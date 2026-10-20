import type { HistoryBucket, MonitorState, MonitorSummary } from '../../shared/contracts.ts';

const iso = (value: unknown): string | null => {
  const time =
    typeof value === 'number'
      ? value < 10_000_000_000
        ? value * 1000
        : value
      : typeof value === 'string'
        ? Date.parse(value)
        : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

const number = (value: unknown): number | null => {
  const result =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(result) && result >= 0 ? result : null;
};

function peekapingState(value: unknown): MonitorState {
  if (value === 1) return 'operational';
  if (value === 0) return 'down';
  if (value === 2) return 'pending';
  if (value === 3) return 'maintenance';
  return 'unknown';
}

function uptime(value: unknown, fetchedAt: string) {
  const parsed = number(value);
  return {
    value: parsed,
    from: new Date(Date.parse(fetchedAt) - 86400000).toISOString(),
    until: fetchedAt,
    basis: 'provider' as const,
  };
}

function heartbeatHistory(raw: unknown): HistoryBucket[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): HistoryBucket[] => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const from = iso(item.time);
    const until =
      iso(item.end_time) ?? (from ? new Date(Date.parse(from) + 1000).toISOString() : null);
    if (!from || !until || Date.parse(until) <= Date.parse(from)) return [];
    return [
      {
        from,
        until,
        state: peekapingState(item.status),
        responseMs: number(item.ping),
      },
    ];
  });
}

export function normalizePeekapingMonitor(
  raw: unknown,
  groupId: string,
  subgroupIds: string[],
  fetchedAt: string,
): MonitorSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = typeof item.id === 'string' ? item.id : null;
  const name = typeof item.name === 'string' ? item.name : null;
  if (!id || !name) return null;
  const heartbeats = Array.isArray(item.heartbeats) ? item.heartbeats : [];
  const latest =
    heartbeats[0] && typeof heartbeats[0] === 'object'
      ? (heartbeats[0] as Record<string, unknown>)
      : null;
  return {
    id,
    groupId,
    subgroupIds,
    name,
    logo: null,
    description: null,
    state: item.active === false ? 'paused' : peekapingState(latest?.status),
    freshness: 'fresh',
    observedAt: iso(latest?.time),
    responseMs: number(latest?.ping),
    uptime24h: uptime(item.uptime_24h, fetchedAt),
    history: heartbeatHistory(heartbeats),
  };
}

function uptimeRobotState(value: unknown): MonitorState {
  switch (Number(value)) {
    case 0:
      return 'paused';
    case 1:
      return 'pending';
    case 2:
      return 'operational';
    case 8:
    case 9:
      return 'down';
    default:
      return 'unknown';
  }
}

function uptimeRobotHistory(item: Record<string, unknown>): HistoryBucket[] {
  const points = Array.isArray(item.response_times) ? item.response_times : [];
  const history = points
    .flatMap((entry): { at: string; valueMs: number | null }[] => {
      if (!entry || typeof entry !== 'object') return [];
      const point = entry as Record<string, unknown>;
      const at = iso(point.datetime ?? point.time);
      if (!at) return [];
      return [{ at, valueMs: number(point.value ?? point.response_time) }];
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const responseHistory: HistoryBucket[] = history.map((point, index) => {
    const next = history[index + 1]?.at;
    const until = next ?? new Date(Date.parse(point.at) + 1000).toISOString();
    return {
      from: point.at,
      until:
        Date.parse(until) > Date.parse(point.at)
          ? until
          : new Date(Date.parse(point.at) + 1000).toISOString(),
      state: 'operational' as const,
      responseMs: point.valueMs,
    };
  });
  const logs = Array.isArray(item.logs) ? item.logs : [];
  const incidentHistory = logs.flatMap((entry): HistoryBucket[] => {
    if (!entry || typeof entry !== 'object') return [];
    const log = entry as Record<string, unknown>;
    const from = iso(log.datetime ?? log.time);
    const duration = number(log.duration);
    if (!from || duration === null || duration <= 0 || Number(log.type) !== 1) return [];
    return [
      {
        from,
        until: new Date(Date.parse(from) + duration * 1000).toISOString(),
        state: 'down',
        responseMs: null,
      },
    ];
  });
  return [...responseHistory, ...incidentHistory].sort(
    (a, b) => Date.parse(a.from) - Date.parse(b.from),
  );
}

export function normalizeUptimeRobotMonitor(
  raw: unknown,
  groupId: string,
  subgroupIds: string[],
  fetchedAt: string,
): MonitorSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = item.id === undefined || item.id === null ? null : String(item.id);
  const name = typeof item.friendly_name === 'string' ? item.friendly_name : null;
  if (!id || !name) return null;
  const observedAt = iso(item.create_datetime) ?? fetchedAt;
  const ratio =
    typeof item.custom_uptime_ratio === 'string'
      ? item.custom_uptime_ratio.split('-')[0]
      : item.custom_uptime_ratio;
  return {
    id,
    groupId,
    subgroupIds,
    name,
    logo: null,
    description: null,
    state: uptimeRobotState(item.status),
    freshness: 'fresh',
    observedAt,
    responseMs: number(item.average_response_time),
    uptime24h: {
      value: number(ratio),
      from: new Date(Date.parse(fetchedAt) - 86400000).toISOString(),
      until: fetchedAt,
      basis: 'provider',
    },
    history: uptimeRobotHistory(item),
  };
}
