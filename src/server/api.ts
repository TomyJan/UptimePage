import {
  apiErrorCodeSchema,
  groupSnapshotSchema,
  monitorDetailSchema,
  type ApiErrorCode,
  type GroupSnapshot,
  type MonitorDetail,
} from '../shared/contracts.ts';
import { configuredMonitorIds, findServerGroup, type ServerConfig } from './config.ts';
import { loadGroupSnapshot } from './snapshot.ts';
import { SourceRequestError, type JsonFetcher } from './sources/http.ts';
import { readCache, writeCache, type ResponseCache } from './cache.ts';
import { fetchUptimeRobotMonitors } from './sources/uptimerobot.ts';
import { normalizeUptimeRobotMonitor } from './sources/normalize.ts';
import { requireSecret } from './config.ts';

export type ApiRuntime = {
  config: ServerConfig;
  environment: Record<string, string | undefined>;
  fetcher?: JsonFetcher;
  now?: Date;
  cache?: ResponseCache;
  /** Shared only by requests handled by the same server instance. */
  inFlight?: Map<string, Promise<unknown>>;
};
const freshMs = 30_000;
const retainMs = 300_000;

function json(value: unknown, status = 200) {
  // Use explicit runtime caching only: CDN/browser caches must not independently
  // retain details after the group membership has been refreshed.
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
function errorResponse(code: ApiErrorCode, retryAt: string | null = null) {
  return json(
    { error: { code, retryAt } },
    code === 'not-found' ? 404 : code === 'rate-limited' ? 429 : 502,
  );
}
function splitPath(pathname: string): string[] | null {
  if (!pathname.startsWith('/api/v1/')) return null;
  try {
    return pathname.slice('/api/v1/'.length).split('/').map(decodeURIComponent);
  } catch {
    return null;
  }
}

function detailFromSnapshot(snapshot: GroupSnapshot, monitorId: string): MonitorDetail | null {
  const monitor = snapshot.monitors.find((m) => m.id === monitorId);
  if (!monitor) return null;
  const response: MonitorDetail['response'] = [];
  const history = [...monitor.history].sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
  const steps = history
    .slice(1)
    .map((b, i) => Date.parse(b.from) - Date.parse(history[i].from))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const cadence = monitor.intervalSeconds
    ? monitor.intervalSeconds * 1000
    : (steps[Math.floor(steps.length / 2)] ?? 0);
  for (let i = 0; i < history.length; i++) {
    const bucket = history[i];
    if (Date.parse(bucket.from) >= Date.parse(snapshot.fetchedAt) - 86400000)
      response.push({ at: bucket.from, valueMs: bucket.responseMs });
    const next = history[i + 1];
    if (next && Date.parse(next.from) - Date.parse(bucket.until) > cadence * 1.5)
      response.push({ at: bucket.until, valueMs: null });
  }
  const values = response.flatMap((p) => (p.valueMs === null ? [] : [p.valueMs]));
  const events: MonitorDetail['events'] = [];
  for (const bucket of history) {
    if (bucket.state !== 'down' && bucket.state !== 'maintenance') continue;
    const last = events.at(-1);
    if (
      last &&
      last.state === bucket.state &&
      last.until &&
      Date.parse(last.until) >= Date.parse(bucket.from)
    ) {
      if (Date.parse(bucket.until) > Date.parse(last.until)) last.until = bucket.until;
    } else
      events.push({
        id: `${monitor.id}-${bucket.from}`,
        from: bucket.from,
        until: bucket.until,
        state: bucket.state,
      });
  }
  const lastEvent = events.at(-1);
  if (
    lastEvent &&
    monitor.state === lastEvent.state &&
    history.at(-1)?.state === lastEvent.state &&
    (monitor.sourceName === 'Peekaping' ||
      Date.parse(lastEvent.until!) >= Date.parse(snapshot.fetchedAt) - 1000)
  )
    lastEvent.until = null;
  return monitorDetailSchema.parse({
    monitor,
    fetchedAt: snapshot.fetchedAt,
    configVersion: snapshot.configVersion,
    range: '24h',
    retryAt:
      snapshot.subgroupErrors
        .flatMap((e) => (e.code === 'rate-limited' && e.retryAt ? [e.retryAt] : []))
        .sort()
        .at(-1) ?? null,
    averageResponse24h: {
      value: values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null,
      from: response.find((p) => p.valueMs !== null)?.at ?? null,
      until: response.findLast((p) => p.valueMs !== null)?.at ?? null,
      basis: 'observed-samples',
    },
    certificateExpiresAt: null,
    supportedRanges: ['24h'],
    capabilities: {
      history: history.length ? 'available' : 'unavailable',
      response: values.length ? 'available' : 'unavailable',
      events: history.length ? 'available' : 'unavailable',
      certificate: 'unsupported',
    },
    response,
    events,
    type: monitor.type ?? null,
    intervalSeconds: monitor.intervalSeconds ?? null,
    sourceName: monitor.sourceName ?? null,
  });
}
function stale(snapshot: GroupSnapshot): GroupSnapshot {
  return {
    ...snapshot,
    freshness: 'stale',
    monitors: snapshot.monitors.map((m) => ({ ...m, freshness: 'stale' })),
    subgroups: snapshot.subgroups.map((s) => ({ ...s, freshness: 'stale' })),
  };
}

export async function handleApi(request: Request, runtime: ApiRuntime): Promise<Response> {
  if (request.method !== 'GET') return errorResponse('not-found');
  const url = new URL(request.url);
  const parts = splitPath(url.pathname);
  if (!parts || parts[0] !== 'groups' || !parts[1] || (parts.length !== 2 && parts.length !== 4))
    return errorResponse('not-found');
  const isDetail = parts.length === 4;
  if (isDetail && (parts[2] !== 'monitors' || !parts[3])) return errorResponse('not-found');
  if (isDetail && (url.searchParams.get('range') ?? '24h') !== '24h')
    return errorResponse('invalid-response');
  const group = findServerGroup(runtime.config, parts[1]);
  if (!group) return errorResponse('not-found');
  const ids = configuredMonitorIds(group);
  if (isDetail && ids && !ids.has(parts[3])) return errorResponse('not-found');
  // All detail requests reuse this one cache key; query noise cannot amplify
  // upstream requests and old per-monitor entries cannot bypass membership.
  const key = new Request(`${url.origin}/api/v1/groups/${encodeURIComponent(group.id)}`);
  const now = runtime.now ?? new Date();
  const sourceCredential = runtime.environment[group.source.apiKeyEnv];
  function coalesce<T>(route: string, load: () => Promise<T>): Promise<T> {
    const pending = runtime.inFlight;
    if (!pending) return load();
    // A key rotation or deployment must never join an older credential's load.
    const flightKey = JSON.stringify([runtime.config.configVersion, route, sourceCredential]);
    const existing = pending.get(flightKey);
    if (existing) return existing as Promise<T>;
    const task = Promise.resolve()
      .then(load)
      .finally(() => pending.delete(flightKey));
    pending.set(flightKey, task);
    return task;
  }
  let cached: GroupSnapshot | null = null;
  let cachedDetail: MonitorDetail | null = null;
  const detailKey = new Request(`${key.url}/monitors/${encodeURIComponent(parts[3] ?? '')}`);
  if (isDetail && group.source.type === 'uptimerobot') {
    try {
      const entry = await readCache(runtime.cache, detailKey, runtime.config.configVersion);
      if (entry) {
        const parsed = monitorDetailSchema.safeParse(await entry.json());
        if (
          parsed.success &&
          parsed.data.configVersion === runtime.config.configVersion &&
          parsed.data.monitor.groupId === group.id &&
          parsed.data.monitor.id === parts[3] &&
          parsed.data.range === '24h'
        ) {
          const age = now.getTime() - Date.parse(parsed.data.fetchedAt);
          if (age >= 0 && age < retainMs) cachedDetail = parsed.data;
        }
      }
    } catch {
      /* A corrupt detail cache is a miss. */
    }
  }
  try {
    const entry = await readCache(runtime.cache, key, runtime.config.configVersion);
    if (entry) {
      const parsed = groupSnapshotSchema.safeParse(await entry.json());
      if (
        parsed.success &&
        parsed.data.configVersion === runtime.config.configVersion &&
        parsed.data.groupId === group.id &&
        parsed.data.freshness === 'fresh'
      ) {
        const age = now.getTime() - Date.parse(parsed.data.fetchedAt);
        if (age >= 0 && age < retainMs) cached = parsed.data;
      }
    }
  } catch {
    /* Corrupt cache entries are misses. */
  }
  try {
    let snapshot = cached && now.getTime() - Date.parse(cached.fetchedAt) < freshMs ? cached : null;
    if (!snapshot) {
      snapshot = await coalesce(key.url, async () => {
        const loaded = groupSnapshotSchema.parse(
          await loadGroupSnapshot(
            runtime.config,
            group.id,
            runtime.environment,
            runtime.fetcher,
            now,
          ),
        );
        if (loaded.freshness === 'fresh') {
          const stored = new Response(JSON.stringify(loaded), {
            headers: {
              'content-type': 'application/json',
              'cache-control': `public, max-age=${retainMs / 1000}`,
            },
          });
          // Keep the load in flight through the cache write, closing the gap
          // between source completion and the next visitor's cache read.
          await writeCache(runtime.cache, key, runtime.config.configVersion, stored);
        }
        return loaded;
      });
      if (
        snapshot.freshness === 'unavailable' ||
        (snapshot.freshness !== 'fresh' &&
          isDetail &&
          !snapshot.monitors.some((m) => m.id === parts[3]))
      ) {
        const retryAt =
          snapshot.subgroupErrors
            .flatMap((e) => (e.retryAt ? [e.retryAt] : []))
            .sort()
            .at(-1) ?? null;
        throw new SourceRequestError(
          'Source unavailable',
          snapshot.subgroupErrors.some((e) => e.code === 'rate-limited') ? 429 : null,
          retryAt,
        );
      }
    }
    if (!isDetail) return json(snapshot);
    const member = snapshot.monitors.find((m) => m.id === parts[3]);
    if (!member) return errorResponse('not-found');
    if (group.source.type === 'uptimerobot') {
      // Membership is checked above even when the detail cache is newer.
      if (cachedDetail && now.getTime() - Date.parse(cachedDetail.fetchedAt) < freshMs)
        return json(cachedDetail);
      const detail = await coalesce<MonitorDetail | null>(detailKey.url, async () => {
        const raw = await fetchUptimeRobotMonitors(
          requireSecret(runtime.environment, group.source.apiKeyEnv),
          [member.id],
          runtime.fetcher,
          {
            includeDetails: true,
            startDate: Math.floor((now.getTime() - 86400000) / 1000),
            endDate: Math.floor(now.getTime() / 1000),
          },
        );
        const record = raw.find(
          (m) => m && typeof m === 'object' && 'id' in m && String(m.id) === member.id,
        );
        if (!record) return null;
        const normalized = normalizeUptimeRobotMonitor(
          record,
          group.id,
          member.subgroupIds,
          now.toISOString(),
        );
        if (!normalized) throw new SourceRequestError('Invalid UptimeRobot monitor');
        const monitor = {
          ...normalized,
          name: member.name,
          logo: member.logo,
          description: member.description,
        };
        const detail = detailFromSnapshot(
          { ...snapshot, fetchedAt: now.toISOString(), monitors: [monitor] },
          member.id,
        )!;
        detail.capabilities.events = Array.isArray((record as Record<string, unknown>).logs)
          ? 'available'
          : 'unavailable';
        await writeCache(
          runtime.cache,
          detailKey,
          runtime.config.configVersion,
          new Response(JSON.stringify(detail), {
            headers: {
              'content-type': 'application/json',
              'cache-control': `public, max-age=${retainMs / 1000}`,
            },
          }),
        );
        return detail;
      });
      return detail ? json(detail) : errorResponse('not-found');
    }
    return json(detailFromSnapshot(snapshot, parts[3]));
  } catch (error) {
    // An unavailable Peekaping status page cannot confirm current membership.
    // Fail closed for details instead of serving potentially revoked data.
    if (isDetail && group.source.type === 'uptimerobot' && cachedDetail)
      return json({
        ...cachedDetail,
        monitor: { ...cachedDetail.monitor, freshness: 'stale' },
        retryAt: error instanceof SourceRequestError ? error.retryAt : null,
      });
    if (!isDetail && cached) {
      const fallback = stale(cached);
      fallback.subgroupErrors = group.subgroups.map((subgroup) => ({
        subgroupId: subgroup.id,
        code:
          error instanceof SourceRequestError && error.status === 429
            ? 'rate-limited'
            : 'unavailable',
        ...(error instanceof SourceRequestError && error.retryAt ? { retryAt: error.retryAt } : {}),
      }));
      return json(fallback);
    }
    if (error instanceof SourceRequestError)
      return errorResponse(error.status === 429 ? 'rate-limited' : 'unavailable', error.retryAt);
    return errorResponse('unavailable');
  }
}

export function normalizeApiErrorCode(value: unknown): ApiErrorCode {
  return apiErrorCodeSchema.safeParse(value).success ? (value as ApiErrorCode) : 'unavailable';
}
