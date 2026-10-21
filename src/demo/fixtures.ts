import type { GroupSnapshot, MonitorDetail, MonitorSummary, Range } from '../shared/contracts.ts';
import { publicConfig } from '../data/config.ts';
export const marker = 'UPTIMEPAGE_DEMO_ONLY';
export const demoNow = Date.parse('2026-10-21T12:00:00Z');
const iso = (n: number) => new Date(n).toISOString();
export function groupFixture(groupId: string, count = 10, now = demoNow): GroupSnapshot {
  const group = publicConfig.groups.find((g) => g.id === groupId)!;
  const labels = [
    'Website',
    'Public API',
    'Documentation',
    'Image storage',
    'Authentication',
    'Database',
    'CDN',
    'Email',
    'Analytics',
    'Backup',
  ];
  const chinese = [
    '主站',
    '公共接口',
    '文档站',
    '图片存储',
    '身份认证',
    '数据库',
    '内容分发',
    '邮件服务',
    '分析服务',
    '备份',
  ];
  const monitors: MonitorSummary[] = Array.from({ length: count }, (_, i) => {
    const state = i === 1 ? 'down' : i === 6 ? 'maintenance' : i === 9 ? 'paused' : 'operational';
    const freshness = i === 4 ? 'stale' : 'fresh';
    return {
      id: `m${i + 1}`,
      groupId,
      subgroupIds: [group.subgroups[i % group.subgroups.length]?.id ?? ''],
      name: {
        en: `${groupId === 'external' ? 'External ' : ''}${labels[i % 10]}${i >= 10 ? ' ' + (i + 1) : ''}`,
        'zh-CN': `${groupId === 'external' ? '外部' : ''}${chinese[i % 10]}${i >= 10 ? ' ' + (i + 1) : ''}`,
      },
      logo: null,
      description: null,
      state,
      freshness,
      observedAt: i === 9 ? null : iso(now - (i === 4 ? 720000 : 0)),
      responseMs: i === 1 || i === 9 ? null : i === 2 ? 0 : 100 + i * 17,
      uptime24h: {
        value: i === 9 ? null : i === 1 ? 98.42 : i === 2 ? 0 : 100,
        from: i === 9 ? null : iso(now - 86400000),
        until: i === 9 ? null : iso(now),
        basis: 'provider',
      },
      history:
        i === 9
          ? []
          : Array.from({ length: i === 4 ? 28 : 48 }, (_, j) => ({
              from: iso(now - 86400000 + j * 1800000),
              until: iso(now - 86400000 + (j + 1) * 1800000),
              state:
                state === 'down' && j > 43
                  ? 'down'
                  : state === 'maintenance' && j > 44
                    ? 'maintenance'
                    : 'operational',
              responseMs: 100 + i * 17,
            })),
    };
  });
  return {
    groupId,
    fetchedAt: iso(now),
    configVersion: publicConfig.configVersion,
    freshness: 'fresh',
    monitors,
    subgroups: group.subgroups.map((s) => ({
      id: s.id,
      monitorIds: monitors.filter((m) => m.subgroupIds.includes(s.id)).map((m) => m.id),
      freshness: 'fresh',
    })),
    subgroupErrors: [],
  };
}
export function detailFixture(
  groupId: string,
  id: string,
  range: Range,
  now = demoNow,
): MonitorDetail | null {
  const m = groupFixture(groupId, 10, now).monitors.find((m) => m.id === id);
  if (!m) return null;
  const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;
  return {
    monitor: {
      ...m,
      history: m.history.map((b) => ({
        ...b,
        from: iso(now - (now - Date.parse(b.from)) * days),
        until: iso(now - (now - Date.parse(b.until)) * days),
      })),
    },
    fetchedAt: iso(now),
    configVersion: publicConfig.configVersion,
    range,
    periodUptime: { ...m.uptime24h, from: iso(now - days * 86400000) },
    averageResponse: {
      value: m.responseMs === null ? null : 133.6,
      from: iso(now - 86400000),
      until: iso(now),
      basis: 'observed-samples',
    },
    certificateExpiresAt: m.id === 'm10' ? null : iso(now + 54 * 86400000),
    supportedRanges: m.id === 'm10' ? ['24h'] : ['24h', '7d', '30d'],
    capabilities: {
      history: 'available',
      response: m.id === 'm10' ? 'unsupported' : 'available',
      events: m.id === 'm10' ? 'unavailable' : 'available',
      certificate: m.id === 'm10' ? 'unsupported' : 'available',
    },
    response:
      m.responseMs === null
        ? []
        : Array.from({ length: 65 }, (_, i) => ({
            at: iso(now - days * 86400000 + (i / 64) * days * 86400000),
            valueMs:
              i === 29 || i === 30
                ? null
                : Math.round(135 + Math.sin(i / 3) * 24 + Math.cos(i * 1.7) * 13),
          })),
    events:
      m.state === 'down'
        ? [{ id: 'incident-1', from: iso(now - 3600000), until: null, state: 'down' }]
        : [],
    type: 'HTTP',
    intervalSeconds: 60,
    sourceName: groupId === 'external' ? 'UptimeRobot' : 'Peekaping',
  };
}
