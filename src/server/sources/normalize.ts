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
  const date = new Date(time);
  return Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() >= 1970 &&
    date.getUTCFullYear() <= 9999
    ? date.toISOString()
    : null;
};

const number = (value: unknown): number | null => {
  const result =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(result) && result >= 0 ? result : null;
};
const positive = (value: unknown) => {
  const n = number(value);
  return n !== null && n > 0 ? n : null;
};

function monitorType(value: unknown): string | null {
  const types: Record<number, string> = {
    1: 'HTTP',
    2: 'Keyword',
    3: 'Ping',
    4: 'Port',
    5: 'Heartbeat',
  };
  if (typeof value === 'string' && value.trim()) return value;
  return typeof value === 'number' ? (types[value] ?? String(value)) : null;
}

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
    value: parsed !== null && parsed <= 100 ? parsed : null,
    from: new Date(Date.parse(fetchedAt) - 86400000).toISOString(),
    until: fetchedAt,
    basis: 'provider' as const,
  };
}

function heartbeatHistory(raw: unknown, fetchedAt: string): HistoryBucket[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((entry): HistoryBucket[] => {
      if (!entry || typeof entry !== 'object') return [];
      const item = entry as Record<string, unknown>;
      const from = iso(item.time);
      const end = iso(item.end_time);
      const until =
        end && from && Date.parse(end) > Date.parse(from)
          ? end
          : from
            ? new Date(Date.parse(from) + 1000).toISOString()
            : null;
      if (!from || !until || Date.parse(until) <= Date.parse(from)) return [];
      return [
        {
          from,
          until,
          state: peekapingState(item.status),
          responseMs: item.status === 1 ? number(item.ping) : null,
        },
      ];
    })
    .filter(
      (b) =>
        Date.parse(b.from) < Date.parse(fetchedAt) &&
        Date.parse(b.until) > Date.parse(fetchedAt) - 86400000,
    )
    .map((b) => ({
      ...b,
      until: Date.parse(b.until) > Date.parse(fetchedAt) ? fetchedAt : b.until,
    }))
    .sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
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
  const heartbeats = Array.isArray(item.heartbeats)
    ? [...item.heartbeats].sort((a, b) => {
        const at = (hb: Record<string, unknown>) =>
          Math.max(Date.parse(iso(hb?.time) ?? '') || 0, Date.parse(iso(hb?.end_time) ?? '') || 0);
        return at(b) - at(a);
      })
    : [];
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
    state: item.active === false ? 'paused' : peekapingState(item.status ?? latest?.status),
    freshness: 'fresh',
    observedAt:
      iso(latest?.end_time) &&
      Date.parse(iso(latest?.end_time)!) > Date.parse(iso(latest?.time) ?? '')
        ? iso(latest?.end_time)
        : iso(latest?.time),
    responseMs: latest?.status === 1 ? number(latest?.ping) : null,
    type: monitorType(item.type),
    intervalSeconds: positive(item.interval),
    sourceName: 'Peekaping',
    uptime24h: uptime(item.uptime_24h, fetchedAt),
    history: heartbeatHistory(heartbeats, fetchedAt),
  };
}

function uptimeRobotState(value: unknown): MonitorState {
  switch (number(value)) {
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

function uptimeRobotHistory(item: Record<string, unknown>, fetchedAt: string): HistoryBucket[] {
  const points = Array.isArray(item.response_times) ? item.response_times : [];
  const history = points
    .flatMap((entry): { at: string; valueMs: number | null }[] => {
      if (!entry || typeof entry !== 'object') return [];
      const point = entry as Record<string, unknown>;
      const at = iso(point.datetime ?? point.time);
      if (
        !at ||
        Date.parse(at) > Date.parse(fetchedAt) ||
        Date.parse(at) < Date.parse(fetchedAt) - 86400000
      )
        return [];
      return [{ at, valueMs: number(point.value ?? point.response_time) }];
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const responseHistory: HistoryBucket[] = history.map((point) => {
    const until = new Date(Date.parse(point.at) + 1000).toISOString();
    return {
      from: point.at,
      until:
        Date.parse(until) > Date.parse(point.at)
          ? until
          : new Date(Date.parse(point.at) + 1000).toISOString(),
      state: point.valueMs === null ? ('no-data' as const) : ('operational' as const),
      responseMs: point.valueMs,
    };
  });
  const logs = Array.isArray(item.logs) ? item.logs : [];
  const latestLogTime = Math.max(
    ...logs.map((log) =>
      log && typeof log === 'object' ? Date.parse(iso(log.datetime ?? log.time) ?? '') || 0 : 0,
    ),
    0,
  );
  const incidentHistory = logs.flatMap((entry): HistoryBucket[] => {
    if (!entry || typeof entry !== 'object') return [];
    const log = entry as Record<string, unknown>;
    const from = iso(log.datetime ?? log.time);
    const duration = number(log.duration);
    if (!from || duration === null || Number(log.type) !== 1) return [];
    const ongoing = uptimeRobotState(item.status) === 'down' && Date.parse(from) === latestLogTime;
    const until = ongoing
      ? fetchedAt
      : duration > 0
        ? iso(Date.parse(from) + duration * 1000)
        : null;
    if (!until || Date.parse(until) <= Date.parse(from)) return [];
    return [
      {
        from,
        until: Date.parse(until) > Date.parse(fetchedAt) ? fetchedAt : until,
        state: 'down',
        responseMs: null,
      },
    ];
  });
  // Build a union of outage intervals once. Comparing each response sample
  // against every log repeatedly parsed timestamps and exhausted edge CPU
  // budgets on flapping monitors.
  const windows: { from: number; until: number }[] = [];
  for (const incident of incidentHistory
    .map((bucket) => ({ from: Date.parse(bucket.from), until: Date.parse(bucket.until) }))
    .filter((window) => window.until > window.from)
    .sort((a, b) => a.from - b.from)) {
    const previous = windows.at(-1);
    if (previous && incident.from <= previous.until)
      previous.until = Math.max(previous.until, incident.until);
    else windows.push(incident);
  }
  let incidentIndex = 0;
  const fetchedTime = Date.parse(fetchedAt);
  const currentlyDown = uptimeRobotState(item.status) === 'down';
  // Response samples prove only a point in time. They cannot overwrite an outage
  // or establish uninterrupted uptime until the next sample.
  return [
    ...responseHistory.filter((point) => {
      const from = Date.parse(point.from),
        until = Date.parse(point.until);
      const includeCurrentBoundary = currentlyDown && from === fetchedTime;
      while (
        incidentIndex < windows.length &&
        (windows[incidentIndex].until < from ||
          (windows[incidentIndex].until === from && !includeCurrentBoundary))
      )
        incidentIndex++;
      const incident = windows[incidentIndex];
      return !incident || incident.from >= until;
    }),
    ...incidentHistory,
  ]
    .filter(
      (b) =>
        Date.parse(b.from) <= Date.parse(fetchedAt) &&
        Date.parse(b.until) > Date.parse(fetchedAt) - 86400000,
    )
    .sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
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
  const history = uptimeRobotHistory(item, fetchedAt);
  const points = Array.isArray(item.response_times)
    ? item.response_times
        .flatMap((entry) => {
          if (!entry || typeof entry !== 'object') return [];
          const at = iso(entry.datetime);
          return at ? [{ at, value: number(entry.value) }] : [];
        })
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    : [];
  const latest = points.at(-1);
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
    observedAt: latest?.at ?? null,
    responseMs: uptimeRobotState(item.status) === 'operational' ? (latest?.value ?? null) : null,
    type: monitorType(item.type),
    intervalSeconds: positive(item.interval),
    sourceName: 'UptimeRobot',
    uptime24h: uptime(ratio, fetchedAt),
    history,
  };
}
