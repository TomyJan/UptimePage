import { rangeMilliseconds } from '../../shared/ranges.ts';
import type { Range } from '../../shared/contracts.ts';
import type { HistoryBucket, MonitorSummary, MonitorDetail } from '../../shared/contracts.ts';
import { SourceRequestError, requestJson, type JsonFetcher } from './http.ts';
import { mapConcurrent, type TaskLimiter } from '../concurrency.ts';

const requestTimeoutMs = 4000;

export function peekapingData(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object')
    throw new SourceRequestError('Invalid Peekaping response');
  const item = payload as Record<string, unknown>;
  if (item.success === false)
    throw new SourceRequestError('Peekaping rejected request', null, null, {
      reason: 'upstream-rejected',
      stage: 'source',
    });
  return item.data ?? item.monitors ?? payload;
}
function sourceUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, '')}/api/v1/${path}`;
}
function auth(apiKey: string, signal?: AbortSignal) {
  return {
    headers: { Accept: 'application/json', 'X-API-Key': apiKey },
    ...(signal ? { signal } : {}),
  };
}
export async function fetchPeekapingMonitors(
  baseUrl: string,
  slug: string,
  apiKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<unknown> {
  return requestJson(
    fetcher,
    sourceUrl(baseUrl, `status-pages/slug/${encodeURIComponent(slug)}/monitors`),
    auth(apiKey),
    requestTimeoutMs,
  );
}
export async function fetchPeekapingBatch(
  baseUrl: string,
  ids: string[],
  apiKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<unknown[]> {
  const batches = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) =>
    ids.slice(i * 100, (i + 1) * 100),
  );
  const result = await mapConcurrent(batches, 4, async (batch) => {
    const data = peekapingData(
      await requestJson(
        fetcher,
        sourceUrl(baseUrl, `monitors/batch?${new URLSearchParams({ ids: batch.join(',') })}`),
        auth(apiKey),
        requestTimeoutMs,
      ),
    );
    if (!Array.isArray(data)) throw new SourceRequestError('Invalid Peekaping batch');
    return data;
  });
  return result.flat();
}
export async function fetchPeekapingHistory(
  baseUrl: string,
  monitor: MonitorSummary,
  apiKey: string,
  until: Date,
  fetcher: JsonFetcher = fetch,
  range: Range = '24h',
  purpose: 'home' | 'detail' = 'detail',
  schedule: TaskLimiter = (work) => work(),
  signal?: AbortSignal,
  clock: () => number = Date.now,
) {
  const end = until.getTime(),
    start = end - rangeMilliseconds(range);
  const path = `monitors/${encodeURIComponent(monitor.id)}`;
  const query = new URLSearchParams({
    since: new Date(start).toISOString(),
    until: until.toISOString(),
    granularity: purpose === 'home' || range !== '24h' ? 'hour' : 'minute',
  });
  const controller = new AbortController();
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const request = (suffix: string) =>
    schedule(
      () =>
        requestJson(
          fetcher,
          sourceUrl(baseUrl, `${path}/${suffix}`),
          auth(apiKey, requestSignal),
          requestTimeoutMs,
        ),
      requestSignal,
    );
  const current = request('heartbeats?limit=1&page=0')
    .then(peekapingData)
    .then((latest) => {
      if (!Array.isArray(latest)) throw new SourceRequestError('Invalid Peekaping heartbeat');
      const hb =
        latest[0] && typeof latest[0] === 'object' ? (latest[0] as Record<string, unknown>) : null;
      const observed = hb
        ? Math.max(
            ...[hb.time, hb.end_time].flatMap((value) =>
              typeof value === 'string' && Number.isFinite(Date.parse(value))
                ? [Date.parse(value)]
                : [],
            ),
          )
        : NaN;
      const valid =
        Number.isFinite(observed) &&
        observed <= clock() &&
        typeof hb?.status === 'number' &&
        [0, 1, 2, 3].includes(hb.status);
      const state: MonitorSummary['state'] =
        monitor.state === 'paused'
          ? monitor.state
          : !valid
            ? 'unknown'
            : hb!.status === 0
              ? 'down'
              : hb!.status === 1
                ? 'operational'
                : hb!.status === 2
                  ? 'pending'
                  : 'maintenance';
      return {
        state,
        observedAt: valid ? new Date(observed).toISOString() : null,
        responseMs:
          valid &&
          state === 'operational' &&
          hb?.status === 1 &&
          typeof hb.ping === 'number' &&
          Number.isFinite(hb.ping) &&
          hb.ping >= 0
            ? hb.ping
            : null,
      };
    });
  const [raw, observation, events] = await Promise.all([
    request(`stats/points?${query}`).then(peekapingData),
    current,
    purpose === 'home'
      ? Promise.resolve([])
      : fetchPeekapingEvents(
          baseUrl,
          monitor,
          apiKey,
          until,
          fetcher,
          range,
          current,
          clock,
          requestSignal,
        ),
  ]).catch((error) => {
    controller.abort();
    throw error;
  });
  if (!raw || typeof raw !== 'object' || !('points' in raw) || !Array.isArray(raw.points))
    throw new SourceRequestError('Invalid Peekaping statistics');
  const stats = raw as Record<string, unknown> & { points: unknown[] };
  const number = (n: unknown): number | null =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
  const interval =
    purpose !== 'home' && range === '24h'
      ? Math.max(60, Math.round((monitor.intervalSeconds ?? 60) / 60) * 60) * 1000
      : 3600000;
  const history: HistoryBucket[] = stats.points
    .map((value): HistoryBucket => {
      if (!value || typeof value !== 'object')
        throw new SourceRequestError('Invalid Peekaping stat point');
      const p = value as Record<string, unknown>;
      const at = number(p.timestamp),
        up = number(p.up),
        down = number(p.down),
        maintenance = number(p.maintenance);
      if (
        at === null ||
        up === null ||
        down === null ||
        maintenance === null ||
        !Number.isSafeInteger(up + down + maintenance)
      )
        throw new SourceRequestError('Invalid Peekaping stat point');
      // Peekaping counts maintenance within up, and also exposes it separately.
      const count = up + down;
      return {
        from: new Date(Math.max(start, at)).toISOString(),
        until: new Date(Math.min(end, at + interval)).toISOString(),
        state: !count
          ? 'no-data'
          : down === count
            ? 'down'
            : maintenance === count
              ? 'maintenance'
              : up === count && maintenance === 0
                ? 'operational'
                : 'partial',
        responseMs: up > maintenance ? number(p.ping) : null,
      };
    })
    .filter((p) => Date.parse(p.until) > Date.parse(p.from))
    .sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
  const uptime = number(stats.uptime);
  return {
    monitor: {
      ...monitor,
      ...observation,
      freshness: 'fresh' as const,
      history,
      sampleIntervalSeconds: interval / 1000,
      uptime24h: {
        value: uptime !== null && uptime <= 100 ? uptime : null,
        from: new Date(start).toISOString(),
        until: until.toISOString(),
        basis: 'provider' as const,
      },
    },
    average: number(stats.avgPing),
    events,
  };
}

async function fetchPeekapingEvents(
  baseUrl: string,
  monitor: MonitorSummary,
  apiKey: string,
  until: Date,
  fetcher: JsonFetcher,
  range: Range,
  current: Promise<Pick<MonitorSummary, 'state'>>,
  clock: () => number,
  signal?: AbortSignal,
): Promise<MonitorDetail['events']> {
  const start = until.getTime() - rangeMilliseconds(range);
  const changes: { id: string; at: number; status: number }[] = [];
  let previousOldest = Infinity;
  for (let page = 0; ; page++) {
    // A corrupt or non-paginating upstream must never run an unbounded loop.
    if (page >= 50)
      throw new SourceRequestError('Peekaping event pagination exceeded request budget');
    const query = new URLSearchParams({ important: 'true', limit: '1000', page: String(page) });
    const rows = peekapingData(
      await requestJson(
        fetcher,
        sourceUrl(baseUrl, `monitors/${encodeURIComponent(monitor.id)}/heartbeats?${query}`),
        auth(apiKey, signal),
        requestTimeoutMs,
      ),
    );
    if (!Array.isArray(rows)) throw new SourceRequestError('Invalid Peekaping events');
    const receivedAt = clock();
    let oldest = Infinity;
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') throw new SourceRequestError('Invalid Peekaping event');
      const row = raw as Record<string, unknown>;
      const at = typeof row.time === 'string' ? Date.parse(row.time) : NaN;
      if (
        !Number.isFinite(at) ||
        typeof row.status !== 'number' ||
        ![0, 1, 2, 3].includes(row.status)
      )
        throw new SourceRequestError('Invalid Peekaping event');
      oldest = Math.min(oldest, at);
      if (at <= receivedAt)
        changes.push({
          id: typeof row.id === 'string' ? row.id : `${monitor.id}-${at}`,
          at,
          status: row.status,
        });
    }
    if (rows.length < 1000 || oldest <= start) break;
    if (oldest >= previousOldest)
      throw new SourceRequestError('Invalid Peekaping event pagination');
    previousOldest = oldest;
  }
  changes.sort((a, b) => a.at - b.at);
  const currentState = (await current).state;
  const end = clock();
  const events: MonitorDetail['events'] = [];
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const state = change.status === 0 ? 'down' : change.status === 3 ? 'maintenance' : null;
    if (!state) continue;
    const next = changes[i + 1];
    const ongoing = !next && currentState === state;
    if (!next && !ongoing) continue;
    const finish = next?.at ?? end;
    if (finish <= start || (!ongoing && finish <= change.at)) continue;
    events.push({
      id: change.id,
      from: new Date(Math.max(start, change.at)).toISOString(),
      until: ongoing ? null : new Date(finish).toISOString(),
      state,
    });
  }
  return events;
}
