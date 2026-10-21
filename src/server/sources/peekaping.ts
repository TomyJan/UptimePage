import type { HistoryBucket, MonitorSummary, MonitorDetail } from '../../shared/contracts.ts';
import { SourceRequestError, requestJson, type JsonFetcher } from './http.ts';

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
function auth(apiKey: string) {
  return { headers: { Accept: 'application/json', 'X-API-Key': apiKey } };
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
  );
}
export async function fetchPeekapingBatch(
  baseUrl: string,
  ids: string[],
  apiKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<unknown[]> {
  const result: unknown[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const data = peekapingData(
      await requestJson(
        fetcher,
        sourceUrl(
          baseUrl,
          `monitors/batch?${new URLSearchParams({ ids: ids.slice(i, i + 100).join(',') })}`,
        ),
        auth(apiKey),
      ),
    );
    if (!Array.isArray(data)) throw new SourceRequestError('Invalid Peekaping batch');
    result.push(...data);
  }
  return result;
}
export async function fetchPeekapingHistory(
  baseUrl: string,
  monitor: MonitorSummary,
  apiKey: string,
  until: Date,
  fetcher: JsonFetcher = fetch,
) {
  const end = until.getTime(),
    start = end - 86400000;
  const path = `monitors/${encodeURIComponent(monitor.id)}`;
  const query = new URLSearchParams({
    since: new Date(start).toISOString(),
    until: until.toISOString(),
    granularity: 'minute',
  });
  const raw = peekapingData(
    await requestJson(fetcher, sourceUrl(baseUrl, `${path}/stats/points?${query}`), auth(apiKey)),
  );
  if (!raw || typeof raw !== 'object' || !('points' in raw) || !Array.isArray(raw.points))
    throw new SourceRequestError('Invalid Peekaping statistics');
  const stats = raw as Record<string, unknown> & { points: unknown[] };
  const number = (n: unknown): number | null =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
  const interval = Math.max(60, Math.round((monitor.intervalSeconds ?? 60) / 60) * 60) * 1000;
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
      const count = up + down + maintenance;
      return {
        from: new Date(Math.max(start, at)).toISOString(),
        until: new Date(Math.min(end, at + interval)).toISOString(),
        state: !count
          ? 'no-data'
          : down === count
            ? 'down'
            : maintenance === count
              ? 'maintenance'
              : up === count
                ? 'operational'
                : 'partial',
        responseMs: up ? number(p.ping) : null,
      };
    })
    .filter((p) => Date.parse(p.until) > Date.parse(p.from))
    .sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
  const latest = peekapingData(
    await requestJson(
      fetcher,
      sourceUrl(baseUrl, `${path}/heartbeats?limit=1&page=0`),
      auth(apiKey),
    ),
  );
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
  const uptime = number(stats.uptime);
  return {
    monitor: {
      ...monitor,
      history,
      observedAt:
        Number.isFinite(observed) && observed <= end ? new Date(observed).toISOString() : null,
      responseMs: monitor.state === 'operational' && hb?.status === 1 ? number(hb.ping) : null,
      uptime24h: {
        value: uptime !== null && uptime <= 100 ? uptime : null,
        from: new Date(start).toISOString(),
        until: until.toISOString(),
        basis: 'provider' as const,
      },
    },
    average: number(stats.avgPing),
    events: await fetchPeekapingEvents(baseUrl, monitor, apiKey, until, fetcher),
  };
}

async function fetchPeekapingEvents(
  baseUrl: string,
  monitor: MonitorSummary,
  apiKey: string,
  until: Date,
  fetcher: JsonFetcher,
): Promise<MonitorDetail['events']> {
  const start = until.getTime() - 86400000,
    end = until.getTime();
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
        auth(apiKey),
      ),
    );
    if (!Array.isArray(rows)) throw new SourceRequestError('Invalid Peekaping events');
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
      if (at <= end)
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
  const events: MonitorDetail['events'] = [];
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const state = change.status === 0 ? 'down' : change.status === 3 ? 'maintenance' : null;
    if (!state) continue;
    const next = changes[i + 1];
    const ongoing = !next && monitor.state === state;
    if (!next && !ongoing) continue;
    const finish = next?.at ?? end;
    if (finish <= start || finish <= change.at) continue;
    events.push({
      id: change.id,
      from: new Date(Math.max(start, change.at)).toISOString(),
      until: ongoing ? null : new Date(finish).toISOString(),
      state,
    });
  }
  return events;
}
