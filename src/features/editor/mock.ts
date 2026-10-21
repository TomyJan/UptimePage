import { splitConfig, type SiteConfig } from '../../../config/schema.ts';
import type { PublicConfig } from '../../shared/config.ts';
import type {
  ApiClient,
  GroupSnapshot,
  MonitorDetail,
  MonitorSummary,
  Range,
} from '../../shared/contracts.ts';
import { ApiClientError } from '../../data/client.ts';
import { rangeMilliseconds } from '../../shared/ranges.ts';

export const editorMarker = 'UPTIMEPAGE_CONFIG_EDITOR_ONLY';
export function previewConfig(config: SiteConfig, version: string): PublicConfig {
  return splitConfig(config, version).publicConfig;
}
function members(group: SiteConfig['groups'][number]) {
  const explicit = group.subgroups.flatMap((s) => s.monitorIds?.filter((id) => id !== '*') ?? []);
  const pool = [...new Set([...explicit, ...Array.from({ length: 6 }, (_, i) => `demo-${i + 1}`)])];
  return group.subgroups.map((sub) => {
    const ids =
      group.source.type === 'peekaping'
        ? Array.from({ length: 3 }, (_, i) => `${sub.id}-${i + 1}`)
        : sub.monitorIds!.includes('*')
          ? pool
          : [...new Set(sub.monitorIds!)];
    const order = sub.order ?? [];
    return {
      id: sub.id,
      monitorIds: [
        ...order.filter((id) => ids.includes(id)),
        ...ids.filter((id) => !order.includes(id)),
      ],
      freshness: 'fresh' as const,
    };
  });
}
export function createPreviewClient(
  config: SiteConfig,
  pub: PublicConfig,
): ApiClient & { snapshot: (id: string) => GroupSnapshot } {
  const checked = (signal: AbortSignal) => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  };
  function snapshot(id: string, now = Date.now()): GroupSnapshot {
    const group = config.groups.find((g) => g.id === id);
    if (!group) throw new ApiClientError('not-found');
    const subgroups = members(group);
    const interval = group.source.type === 'peekaping' ? 60 : 300;
    const monitors: MonitorSummary[] = [...new Set(subgroups.flatMap((s) => s.monitorIds))].map(
      (id, i) => {
        const override = group.monitors[id];
        const state = i % 6 === 1 ? 'down' : i % 6 === 5 ? 'maintenance' : 'operational';
        return {
          id,
          groupId: group.id,
          subgroupIds: subgroups.filter((s) => s.monitorIds.includes(id)).map((s) => s.id),
          name: override?.name ?? { en: `Service ${i + 1}`, 'zh-CN': `服务 ${i + 1}` },
          description: override?.description ?? null,
          logo: override?.logo ?? null,
          state,
          freshness: 'fresh',
          observedAt: new Date(now).toISOString(),
          responseMs: state === 'down' ? null : 80 + i * 17,
          intervalSeconds: interval,
          sampleIntervalSeconds: interval,
          type: 'HTTP',
          sourceName: group.source.type === 'peekaping' ? 'Peekaping' : 'UptimeRobot',
          uptime24h: {
            value: state === 'down' ? 98.42 : 100,
            from: new Date(now - 86400000).toISOString(),
            until: new Date(now).toISOString(),
            basis: 'provider',
          },
          history: Array.from({ length: 48 }, (_, j) => ({
            from: new Date(now - 86400000 + j * 1800000).toISOString(),
            until: new Date(now - 86400000 + (j + 1) * 1800000).toISOString(),
            state: state === 'down' && j > 44 ? 'down' : 'operational',
            responseMs: 80 + i * 17,
          })),
        };
      },
    );
    return {
      groupId: id,
      configVersion: pub.configVersion,
      fetchedAt: new Date(now).toISOString(),
      freshness: 'fresh',
      monitors,
      subgroups,
      subgroupErrors: [],
    };
  }
  return {
    snapshot,
    async getGroup(id, signal) {
      checked(signal);
      return snapshot(id);
    },
    async getMonitor(group, id, range: Range, signal): Promise<MonitorDetail> {
      checked(signal);
      const now = Date.now(),
        data = snapshot(group, now),
        monitor = data.monitors.find((m) => m.id === id);
      if (!monitor) throw new ApiClientError('not-found');
      const duration = rangeMilliseconds(range),
        from = new Date(now - duration).toISOString(),
        until = new Date(now).toISOString();
      return {
        configVersion: pub.configVersion,
        fetchedAt: until,
        range,
        monitor: {
          ...monitor,
          history: monitor.history.map((b, i) => ({
            ...b,
            from: new Date(now - duration + (i * duration) / 48).toISOString(),
            until: new Date(now - duration + ((i + 1) * duration) / 48).toISOString(),
          })),
        },
        periodUptime: { ...monitor.uptime24h, from, until },
        averageResponse: { value: monitor.responseMs, from, until, basis: 'observed-samples' },
        certificateExpiresAt: new Date(now + 54 * 86400000).toISOString(),
        supportedRanges: ['24h', '7d', '30d'],
        capabilities: {
          history: 'available',
          response: 'available',
          certificate: 'available',
          events: 'available',
        },
        response:
          monitor.responseMs === null
            ? []
            : Array.from({ length: 80 }, (_, i) => ({
                at: new Date(now - duration + (i * duration) / 79).toISOString(),
                valueMs: Math.round(monitor.responseMs! + Math.sin(i / 3) * 25),
              })),
        events:
          monitor.state === 'down'
            ? [
                {
                  id: 'mock-event',
                  from: new Date(now - 3600000).toISOString(),
                  until: null,
                  state: 'down',
                },
              ]
            : [],
        type: monitor.type ?? null,
        intervalSeconds: monitor.intervalSeconds ?? null,
        sourceName: monitor.sourceName ?? null,
      };
    },
  };
}
