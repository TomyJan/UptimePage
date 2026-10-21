import {
  monitorSummarySchema,
  type ApiErrorCode,
  type GroupSnapshot,
  type MonitorSummary,
} from '../shared/contracts.ts';
import type { SiteConfig } from '../../config/schema.ts';
import {
  findServerGroup,
  configuredMonitorRefs,
  configuredMonitorIds,
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
  if (!value || typeof value !== 'object')
    throw new SourceRequestError('Invalid Peekaping response');
  const item = value as Record<string, unknown>;
  if (item.success === false)
    throw new SourceRequestError('Peekaping rejected the request', null, null, {
      reason: 'upstream-rejected',
      stage: 'source',
    });
  if (Array.isArray(item.monitors)) return item.monitors;
  if (item.data !== undefined && item.data !== value) return extractPeekapingMonitors(item.data);
  throw new SourceRequestError('Invalid Peekaping response');
}

async function mapLimited<T, R>(items: T[], map: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) results[i] = await map(items[i]);
    }),
  );
  return results;
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
    const results = await mapLimited(group.subgroups, async (subgroup) => {
      try {
        if (!subgroup.slug) throw new Error('Missing Peekaping status-page slug');
        const payload = await fetchPeekapingMonitors(source.baseUrl, subgroup.slug, key, fetcher);
        const selected: MonitorSummary[] = [];
        for (const raw of extractPeekapingMonitors(payload)) {
          const monitor = normalizePeekapingMonitor(raw, group.id, [subgroup.id], fetchedAt);
          if (!monitor || !monitorSummarySchema.safeParse(monitor).success)
            throw new SourceRequestError('Invalid Peekaping monitor');
          selected.push(applyOverride(monitor, group));
        }
        return { subgroup, selected, code: null, retryAt: null, diagnostic: undefined };
      } catch (error) {
        return {
          subgroup,
          selected: [],
          code: sourceErrorCode(error),
          diagnostic:
            error instanceof SourceRequestError
              ? error.diagnostic
              : { reason: 'internal' as const },
          retryAt: error instanceof SourceRequestError ? error.retryAt : null,
        };
      }
    });
    for (const { subgroup, selected, code, retryAt, diagnostic } of results) {
      const rank = new Map((subgroup.order ?? []).map((id, i) => [id, i]));
      selected.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
      subgroupIds[subgroup.id] = [...new Set(selected.map((m) => m.id))];
      for (const monitor of selected) mergeMonitor(monitors, monitor);
      if (code)
        subgroupErrors.push({
          subgroupId: subgroup.id,
          code,
          diagnostic,
          ...(retryAt ? { retryAt } : {}),
        });
    }
  } else {
    const refs = configuredMonitorRefs(group);

    try {
      const rawMonitors = await fetchUptimeRobotMonitors(
        key,
        configuredMonitorIds(group) ? refs.map((ref) => ref.id) : undefined,
        fetcher,
        {
          includeDetails: true,
          responseTimesAverage: 30,
          startDate: Math.floor((now.getTime() - 86400000) / 1000),
          endDate: Math.floor(now.getTime() / 1000),
        },
      );
      for (const raw of rawMonitors) {
        const id = raw && typeof raw === 'object' && 'id' in raw ? String(raw.id) : '';
        const selected = group.subgroups
          .filter((s) => s.monitorIds?.includes('*') || s.monitorIds?.includes(id))
          .map((s) => s.id);
        if (!selected.length) continue;
        const monitor = normalizeUptimeRobotMonitor(raw, group.id, selected, fetchedAt);
        if (!monitor || !monitorSummarySchema.safeParse(monitor).success)
          throw new SourceRequestError('Invalid UptimeRobot monitor');
        mergeMonitor(monitors, applyOverride(monitor, group));
      }
      for (const subgroup of group.subgroups)
        subgroupIds[subgroup.id] = [
          ...new Set([
            ...(subgroup.order ?? []),
            ...(subgroup.monitorIds?.includes('*')
              ? [...monitors.keys()]
              : (subgroup.monitorIds ?? [])),
          ]),
        ].filter((id) => monitors.has(id));
      const ordered = new Map<string, MonitorSummary>();
      for (const sub of group.subgroups)
        for (const id of subgroupIds[sub.id]) ordered.set(id, monitors.get(id)!);
      monitors.clear();
      for (const [id, monitor] of ordered) monitors.set(id, monitor);
    } catch (error) {
      monitors.clear();
      const code = sourceErrorCode(error);
      for (const subgroup of group.subgroups) {
        subgroupIds[subgroup.id] = [];
        subgroupErrors.push({
          subgroupId: subgroup.id,
          code,
          diagnostic:
            error instanceof SourceRequestError ? error.diagnostic : { reason: 'internal' },
          ...(error instanceof SourceRequestError && error.retryAt
            ? { retryAt: error.retryAt }
            : {}),
        });
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
