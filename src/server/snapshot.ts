import type { ApiErrorCode, GroupSnapshot, MonitorSummary } from '../shared/contracts.ts';
import type { SiteConfig } from '../../config/schema.ts';
import {
  findServerGroup,
  configuredMonitorRefs,
  requireSecret,
  type ServerConfig,
} from './config.ts';
import { SourceRequestError, type JsonFetcher } from './sources/http.ts';
import { fetchPeekapingMonitors } from './sources/peekaping.ts';
import { fetchUptimeRobotMonitors } from './sources/uptimerobot.ts';
import { normalizePeekapingMonitor, normalizeUptimeRobotMonitor } from './sources/normalize.ts';

export class PublicGroupNotFoundError extends Error {
  constructor() {
    super('Group is not public');
    this.name = 'PublicGroupNotFoundError';
  }
}

function sourceErrorCode(error: unknown): ApiErrorCode {
  if (error instanceof SourceRequestError && error.status === 429) return 'rate-limited';
  if (error instanceof SourceRequestError && error.status === 404) return 'not-found';
  return 'unavailable';
}

function extractPeekapingMonitors(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  if (Array.isArray(item.monitors)) return item.monitors;
  if (item.data !== value) return extractPeekapingMonitors(item.data);
  return [];
}

function applyOverride(
  monitor: MonitorSummary,
  group: SiteConfig['groups'][number],
): MonitorSummary {
  const override = group.monitors[monitor.id];
  if (!override) return monitor;
  return {
    ...monitor,
    name: override.name ?? monitor.name,
    logo: override.logo ?? monitor.logo,
    description: override.description ?? monitor.description,
  };
}

function mergeMonitor(map: Map<string, MonitorSummary>, monitor: MonitorSummary) {
  const existing = map.get(monitor.id);
  if (!existing) {
    map.set(monitor.id, monitor);
    return;
  }
  map.set(monitor.id, {
    ...existing,
    subgroupIds: [...new Set([...existing.subgroupIds, ...monitor.subgroupIds])],
    history: existing.history.length >= monitor.history.length ? existing.history : monitor.history,
  });
}

export async function loadGroupSnapshot(
  config: ServerConfig,
  groupId: string,
  environment: Record<string, string | undefined>,
  fetcher: JsonFetcher = fetch,
  now = new Date(),
): Promise<GroupSnapshot> {
  const group = findServerGroup(config, groupId);
  if (!group) throw new PublicGroupNotFoundError();
  const fetchedAt = now.toISOString();
  const monitors = new Map<string, MonitorSummary>();
  const subgroupIds: Record<string, string[]> = {};
  const subgroupErrors: GroupSnapshot['subgroupErrors'] = [];
  const key = requireSecret(environment, group.source.apiKeyEnv);

  if (group.source.type === 'peekaping') {
    const source = group.source;
    await Promise.all(
      group.subgroups.map(async (subgroup) => {
        try {
          if (!subgroup.slug) throw new Error('Missing Peekaping status-page slug');
          const payload = await fetchPeekapingMonitors(source.baseUrl, subgroup.slug, key, fetcher);
          const ids: string[] = [];
          for (const raw of extractPeekapingMonitors(payload)) {
            const monitor = normalizePeekapingMonitor(raw, group.id, [subgroup.id], fetchedAt);
            if (!monitor) continue;
            ids.push(monitor.id);
            mergeMonitor(monitors, applyOverride(monitor, group));
          }
          subgroupIds[subgroup.id] = ids;
        } catch (error) {
          subgroupIds[subgroup.id] = [];
          subgroupErrors.push({ subgroupId: subgroup.id, code: sourceErrorCode(error) });
        }
      }),
    );
  } else {
    const refs = configuredMonitorRefs(group);
    const refMap = new Map(refs.map((ref) => [ref.id, ref.subgroupIds]));
    try {
      const rawMonitors = await fetchUptimeRobotMonitors(
        key,
        refs.map((ref) => ref.id),
        fetcher,
        {
          includeDetails: true,
          startDate: Math.floor((now.getTime() - 86400000) / 1000),
          endDate: Math.floor(now.getTime() / 1000),
        },
      );
      for (const raw of rawMonitors) {
        const id = raw && typeof raw === 'object' && 'id' in raw ? String(raw.id) : '';
        const selected = refMap.get(id);
        if (!selected) continue;
        const monitor = normalizeUptimeRobotMonitor(raw, group.id, selected, fetchedAt);
        if (monitor) mergeMonitor(monitors, applyOverride(monitor, group));
      }
      for (const subgroup of group.subgroups)
        subgroupIds[subgroup.id] = refs
          .filter((ref) => ref.subgroupIds.includes(subgroup.id))
          .map((ref) => ref.id);
    } catch (error) {
      const code = sourceErrorCode(error);
      for (const subgroup of group.subgroups) {
        subgroupIds[subgroup.id] = [];
        subgroupErrors.push({ subgroupId: subgroup.id, code });
      }
    }
  }

  const subgroupValues = group.subgroups.map((subgroup) => ({
    id: subgroup.id,
    monitorIds: subgroupIds[subgroup.id] ?? [],
    freshness: subgroupErrors.some((error) => error.subgroupId === subgroup.id)
      ? ('unavailable' as const)
      : ('fresh' as const),
  }));
  return {
    groupId: group.id,
    fetchedAt,
    configVersion: config.configVersion,
    freshness: subgroupErrors.length === 0 ? 'fresh' : monitors.size > 0 ? 'stale' : 'unavailable',
    monitors: [...monitors.values()],
    subgroups: subgroupValues,
    subgroupErrors,
  };
}
