import { encodeGroupSnapshot } from './home.ts';
import { withMonitorLink } from '../shared/monitor-links.ts';
import {
  apiErrorCodeSchema,
  rangeSchema,
  type Range,
  groupSnapshotSchema,
  monitorDetailSchema,
  type ApiErrorCode,
  type Diagnostic,
  type GroupSnapshot,
  type MonitorDetail,
} from '../shared/contracts.ts';
import { rangeDays, rangeMilliseconds } from '../shared/ranges.ts';
import { samplingCadence } from '../shared/sampling.ts';
import { configuredMonitorIds, findServerGroup, type ServerConfig } from './config.ts';
import { loadGroupSnapshot } from './snapshot.ts';
import { SourceRequestError, type JsonFetcher } from './sources/http.ts';
import { readCache, writeCache, type ResponseCache } from './cache.ts';
import { fetchPeekapingHistory } from './sources/peekaping.ts';
import { loadPeekapingMembership, type PeekapingMembership } from './peekaping-membership.ts';
import { fetchUptimeRobotMonitors } from './sources/uptimerobot.ts';
import { normalizeUptimeRobotMonitor } from './sources/normalize.ts';
import { credentialCacheVersion, requireSecret } from './config.ts';
import { RequestTiming } from './timing.ts';
import { fetchPeekapingCertificate, parseUptimeRobotCertificate } from './certificates.ts';
import { handleIcon } from './icon-api.ts';

export type ApiRuntime = {
  config: ServerConfig;
  environment: Record<string, string | undefined>;
  fetcher?: JsonFetcher;
  /** Request/cache timestamp and fixed history window; defaults to clock() at entry. */
  now?: Date;
  /** Live read clock in milliseconds; defaults to Date.now even when now is fixed. */
  clock?: () => number;
  cache?: ResponseCache;
  membershipCache?: ResponseCache;
  /** Shared only by requests handled by the same server instance. */
  inFlight?: Map<string, Promise<unknown>>;
  timing?: RequestTiming;
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
export function errorResponse(
  code: ApiErrorCode,
  retryAt: string | null = null,
  diagnostic?: Diagnostic,
) {
  return json(
    { error: { code, retryAt, diagnostic } },
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

function detailFromSnapshot(
  snapshot: GroupSnapshot,
  monitorId: string,
  range: Range,
): MonitorDetail | null {
  const monitor = snapshot.monitors.find((m) => m.id === monitorId);
  if (!monitor) return null;
  const response: MonitorDetail['response'] = [];
  const history = [...monitor.history].sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
  const cadence = samplingCadence(monitor.intervalSeconds, monitor.sampleIntervalSeconds);
  for (let i = 0; i < history.length; i++) {
    const bucket = history[i];
    const start = Date.parse(snapshot.fetchedAt) - rangeMilliseconds(range);
    if (Date.parse(bucket.until) > start)
      response.push({
        at: new Date(Math.max(start, Date.parse(bucket.from))).toISOString(),
        valueMs: bucket.responseMs,
      });
    const next = history[i + 1];
    if (
      next &&
      Date.parse(next.from) > Date.parse(bucket.until) &&
      Date.parse(next.from) - Date.parse(bucket.from) > cadence * 1.5
    )
      response.push({
        at: bucket.until,
        valueMs: null,
        ...(bucket.responseMs !== null &&
        next.responseMs !== null &&
        Date.parse(next.from) - Date.parse(bucket.from) <= cadence * 2.5
          ? { gap: 'short-missing' as const }
          : {}),
      });
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
    range,
    periodUptime: {
      ...monitor.uptime24h,
      from: new Date(Date.parse(snapshot.fetchedAt) - rangeMilliseconds(range)).toISOString(),
    },
    retryAt:
      snapshot.subgroupErrors
        .flatMap((e) => (e.code === 'rate-limited' && e.retryAt ? [e.retryAt] : []))
        .sort()
        .at(-1) ?? null,
    averageResponse: {
      value: values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null,
      from: response.find((p) => p.valueMs !== null)?.at ?? null,
      until: response.findLast((p) => p.valueMs !== null)?.at ?? null,
      basis: 'observed-samples',
    },
    certificateExpiresAt: null,
    supportedRanges: ['24h', '7d', '30d'],
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
  try {
    if (new URL(request.url).pathname.startsWith('/api/v1/icons/'))
      return await handleIcon(request, runtime);
    return await handleRequest(request, runtime);
  } catch (error) {
    if (error instanceof SourceRequestError)
      return errorResponse(
        error.status === 429 ? 'rate-limited' : 'unavailable',
        error.retryAt,
        error.diagnostic,
      );
    return errorResponse('unavailable', null, { reason: 'internal', stage: 'runtime' });
  }
}
async function handleRequest(request: Request, runtime: ApiRuntime): Promise<Response> {
  if (request.method !== 'GET') return errorResponse('not-found');
  const url = new URL(request.url);
  const parts = splitPath(url.pathname);
  if (!parts || parts[0] !== 'groups' || !parts[1] || (parts.length !== 2 && parts.length !== 4))
    return errorResponse('not-found');
  const isDetail = parts.length === 4;
  if (isDetail && (parts[2] !== 'monitors' || !parts[3])) return errorResponse('not-found');
  const parsedRange = rangeSchema.safeParse(url.searchParams.get('range') ?? '24h');
  if (isDetail && !parsedRange.success) return errorResponse('invalid-response');
  const range = parsedRange.success ? parsedRange.data : '24h';
  const group = findServerGroup(runtime.config, parts[1]);
  if (!group) return errorResponse('not-found');
  const publicSnapshot = (snapshot: GroupSnapshot) => ({
    ...snapshot,
    monitors: snapshot.monitors.map((m) => withMonitorLink(m, group)),
  });
  const publicDetail = (detail: MonitorDetail) => ({
    ...detail,
    monitor: withMonitorLink(detail.monitor, group),
  });
  const ids = configuredMonitorIds(group);
  if (isDetail && ids && !ids.has(parts[3])) return errorResponse('not-found');
  // All detail requests reuse this one cache key; query noise cannot amplify
  // upstream requests and old per-monitor entries cannot bypass membership.
  const key = new Request(`${url.origin}/api/v1/groups/${encodeURIComponent(group.id)}`);
  const clock = runtime.clock ?? Date.now;
  const now = runtime.now ?? new Date(clock());
  // Start storage reads before membership I/O. Records carry the membership
  // generation internally and are never used until authorization is confirmed.
  const sourceCredential = requireSecret(runtime.environment, group.source.apiKeyEnv);
  const cacheVersion = credentialCacheVersion(
    runtime.config.configVersion,
    'home-v6',
    sourceCredential,
  );
  const detailKey = new Request(
    `${key.url}/monitors/${encodeURIComponent(parts[3] ?? '')}/ranges/${range}`,
  );
  const snapshotRead = readCache(runtime.cache, key, cacheVersion).catch(() => null);
  const detailRead = isDetail
    ? readCache(runtime.cache, detailKey, cacheVersion).catch(() => null)
    : Promise.resolve(null);
  let membership: PeekapingMembership | undefined;
  try {
    if (group.source.type === 'peekaping')
      membership = await timed('membership', () =>
        coalesce(
          `${key.url}:membership`,
          () =>
            loadPeekapingMembership(
              runtime.config,
              group.id,
              runtime.environment,
              runtime.fetcher,
              now,
              runtime.membershipCache ?? runtime.cache,
              url.origin,
            ),
          `${runtime.config.configVersion}:membership`,
        ),
      );
  } catch (error) {
    return error instanceof SourceRequestError
      ? errorResponse(
          error.status === 429 ? 'rate-limited' : 'unavailable',
          error.retryAt,
          error.diagnostic,
        )
      : errorResponse('unavailable', null, { reason: 'internal', stage: 'membership' });
  }
  // Invalidate old status-page-derived data and bind all status/detail entries to
  // the membership generation, so a ten-minute refresh also revokes old details.
  const membershipDigest: string = membership
    ? Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(membership.generation)),
        ),
        (b) => b.toString(16).padStart(2, '0'),
      ).join('')
    : '';
  const flightVersion = `${cacheVersion}:${membershipDigest}`;
  function serializeCached(value: object) {
    return JSON.stringify({ ...value, cacheMembership: membershipDigest });
  }
  async function cachedPayload(entry: Response | undefined | null) {
    if (!entry) return null;
    const value = await entry.json();
    return value && typeof value === 'object' && value.cacheMembership === membershipDigest
      ? value
      : null;
  }
  if (
    isDetail &&
    membership &&
    !membership.subgroups.some((s) => s.monitorIds.includes(parts[3]))
  ) {
    const error = membership.errors[0];
    return error
      ? errorResponse(
          error.code === 'rate-limited' ? 'rate-limited' : 'unavailable',
          error.retryAt ?? null,
          error.diagnostic,
        )
      : errorResponse('not-found');
  }
  function coalesce<T>(
    route: string,
    load: () => Promise<T>,
    version: string = flightVersion,
  ): Promise<T> {
    const pending = runtime.inFlight;
    if (!pending) return load();
    // A key rotation or deployment must never join an older credential's load.
    const flightKey = JSON.stringify([version, route, sourceCredential]);
    const existing =
      pending.get(flightKey) ??
      (isDetail && route === `${key.url}/base`
        ? pending.get(JSON.stringify([version, key.url, sourceCredential]))
        : undefined);
    if (existing) return existing as Promise<T>;
    const task = Promise.resolve()
      .then(load)
      .finally(() => pending.delete(flightKey));
    pending.set(flightKey, task);
    return task;
  }
  function timed<T>(stage: 'membership' | 'snapshot' | 'detail', work: () => Promise<T>) {
    return runtime.timing ? runtime.timing.measure(stage, work) : work();
  }
  const snapshotKey = isDetail ? new Request(`${key.url}/base`) : key;
  let cached: GroupSnapshot | null = null;
  let cachedDetail: MonitorDetail | null = null;
  if (isDetail) {
    try {
      const value = await cachedPayload(await detailRead);
      if (value) {
        const parsed = monitorDetailSchema.safeParse(value);
        if (
          parsed.success &&
          parsed.data.configVersion === runtime.config.configVersion &&
          parsed.data.monitor.groupId === group.id &&
          parsed.data.monitor.id === parts[3] &&
          parsed.data.range === range
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
    // A fresh full homepage also supplies identity/authorization metadata for details.
    // A cold detail loads metadata only; it must never fetch every monitor's history.
    let value = await cachedPayload(await snapshotRead);
    if (isDetail && value && now.getTime() - Date.parse(value.fetchedAt) >= freshMs) value = null;
    if (!value && isDetail)
      value = await cachedPayload(await readCache(runtime.cache, snapshotKey, cacheVersion));
    if (value) {
      const parsed = groupSnapshotSchema.safeParse(value);
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
      snapshot = await coalesce(snapshotKey.url, async () => {
        const loaded = groupSnapshotSchema.parse(
          await timed('snapshot', () =>
            loadGroupSnapshot(
              runtime.config,
              group.id,
              runtime.environment,
              runtime.fetcher,
              now,
              membership,
              !isDetail,
              clock,
            ),
          ),
        );
        if (loaded.freshness === 'fresh') {
          const stored = new Response(serializeCached(loaded), {
            headers: {
              'content-type': 'application/json',
              'cache-control': `public, max-age=${retainMs / 1000}`,
            },
          });
          // Keep the load in flight through the cache write, closing the gap
          // between source completion and the next visitor's cache read.
          await writeCache(runtime.cache, snapshotKey, cacheVersion, stored);
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
          snapshot.subgroupErrors.find((e) => e.diagnostic)?.diagnostic ?? { reason: 'internal' },
        );
      }
    }
    if (!isDetail) return json(encodeGroupSnapshot(publicSnapshot(snapshot)));
    const member = snapshot.monitors.find((m) => m.id === parts[3]);
    if (!member) return errorResponse('not-found');
    // A detail cache cannot bypass current public membership.
    if (cachedDetail && now.getTime() - Date.parse(cachedDetail.fetchedAt) < freshMs)
      return json(publicDetail(cachedDetail));
    if (group.source.type === 'uptimerobot') {
      const detail = await timed('detail', () =>
        coalesce<MonitorDetail | null>(detailKey.url, async () => {
          const raw = await fetchUptimeRobotMonitors(
            requireSecret(runtime.environment, group.source.apiKeyEnv),
            [member.id],
            runtime.fetcher,
            {
              includeDetails: true,
              includeCertificate: true,
              uptimeDays: rangeDays(range),
              ...(range === '24h' ? {} : { responseTimesAverage: range === '7d' ? 30 : 60 }),
              startDate: Math.floor((now.getTime() - rangeMilliseconds(range)) / 1000),
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
            range,
            range === '24h' ? null : range === '7d' ? 1800 : 3600,
          );
          if (!normalized) throw new SourceRequestError('Invalid UptimeRobot monitor');
          let latest = normalized;
          if (range !== '24h') {
            const entry = await readCache(
              runtime.cache,
              new Request(`${key.url}/monitors/${encodeURIComponent(member.id)}/ranges/24h`),
              cacheVersion,
            );
            let rawDetail: MonitorDetail | null = null;
            try {
              const value = await cachedPayload(entry);
              const parsed = value && monitorDetailSchema.safeParse(value);
              if (
                parsed &&
                parsed.success &&
                parsed.data.range === '24h' &&
                parsed.data.configVersion === runtime.config.configVersion &&
                parsed.data.monitor.groupId === group.id &&
                parsed.data.monitor.id === member.id &&
                now.getTime() - Date.parse(parsed.data.fetchedAt) >= 0 &&
                now.getTime() - Date.parse(parsed.data.fetchedAt) < freshMs
              )
                rawDetail = parsed.data;
            } catch {
              /* Corrupt optional cache: retrieve the latest check. */
            }
            if (rawDetail) latest = rawDetail.monitor;
            else {
              const rows = await fetchUptimeRobotMonitors(
                requireSecret(runtime.environment, group.source.apiKeyEnv),
                [member.id],
                runtime.fetcher,
                { includeDetails: true, latestOnly: true },
              );
              const row = rows.find(
                (m) => m && typeof m === 'object' && 'id' in m && String(m.id) === member.id,
              );
              const check = normalizeUptimeRobotMonitor(
                row,
                group.id,
                member.subgroupIds,
                now.toISOString(),
              );
              if (!check) throw new SourceRequestError('Invalid UptimeRobot latest check');
              latest = check;
            }
          }
          const monitor = withMonitorLink(
            {
              ...normalized,
              observedAt: latest.observedAt,
              responseMs: normalized.state === 'operational' ? latest.responseMs : null,
              name: member.name,
              logo: member.logo,
              description: member.description,
            },
            group,
          );
          const detail = detailFromSnapshot(
            { ...snapshot, fetchedAt: now.toISOString(), monitors: [monitor] },
            member.id,
            range,
          )!;
          detail.monitor.uptime24h = member.uptime24h;
          const certificate = parseUptimeRobotCertificate(record);
          detail.certificateExpiresAt = certificate.certificateExpiresAt;
          detail.capabilities.certificate = certificate.capability;
          detail.capabilities.events = Array.isArray((record as Record<string, unknown>).logs)
            ? 'available'
            : 'unavailable';
          await writeCache(
            runtime.cache,
            detailKey,
            cacheVersion,
            new Response(serializeCached(detail), {
              headers: {
                'content-type': 'application/json',
                'cache-control': `public, max-age=${retainMs / 1000}`,
              },
            }),
          );
          return detail;
        }),
      );
      return detail ? json(publicDetail(detail)) : errorResponse('not-found');
    }
    const detail = await timed('detail', () =>
      coalesce(detailKey.url, async () => {
        const baseUrl = group.source.type === 'peekaping' ? group.source.baseUrl : '';
        const apiKey = requireSecret(runtime.environment, group.source.apiKeyEnv);
        const controller = new AbortController();
        const [result, certificate] = await Promise.all([
          fetchPeekapingHistory(
            baseUrl,
            member,
            apiKey,
            now,
            runtime.fetcher,
            range,
            'detail',
            undefined,
            undefined,
            clock,
          ),
          fetchPeekapingCertificate(baseUrl, member.id, apiKey, runtime.fetcher, controller.signal),
        ]).catch((error) => {
          controller.abort();
          throw error;
        });
        const detail = detailFromSnapshot(
          { ...snapshot, fetchedAt: now.toISOString(), monitors: [result.monitor] },
          member.id,
          range,
        )!;
        detail.monitor.uptime24h = member.uptime24h;
        if (range === '24h') detail.monitor.uptime24h = detail.periodUptime;
        detail.averageResponse = {
          value: result.average,
          from: detail.periodUptime.from,
          until: now.toISOString(),
          basis: 'provider',
        };
        // Incident boundaries come from authenticated status transitions, never stat buckets.
        detail.events = result.events;
        detail.capabilities.events = 'available';
        detail.certificateExpiresAt = certificate.certificateExpiresAt;
        detail.capabilities.certificate = certificate.capability;
        if (detail.monitor.freshness === 'fresh')
          await writeCache(
            runtime.cache,
            detailKey,
            cacheVersion,
            new Response(serializeCached(detail), {
              headers: {
                'content-type': 'application/json',
                'cache-control': `public, max-age=${retainMs / 1000}`,
              },
            }),
          );
        return detail;
      }),
    );
    return json(publicDetail(detail));
  } catch (error) {
    // An unavailable Peekaping status page cannot confirm current membership.
    // Fail closed for details instead of serving potentially revoked data.
    if (isDetail && group.source.type === 'uptimerobot' && cachedDetail)
      return json({
        ...cachedDetail,
        monitor: withMonitorLink({ ...cachedDetail.monitor, freshness: 'stale' }, group),
        retryAt: error instanceof SourceRequestError ? error.retryAt : null,
        diagnostic: error instanceof SourceRequestError ? error.diagnostic : { reason: 'internal' },
      });
    if (!isDetail && cached) {
      const fallback = stale(cached);
      fallback.subgroupErrors = group.subgroups.map((subgroup) => ({
        subgroupId: subgroup.id,
        diagnostic: error instanceof SourceRequestError ? error.diagnostic : { reason: 'internal' },
        code:
          error instanceof SourceRequestError && error.status === 429
            ? 'rate-limited'
            : 'unavailable',
        ...(error instanceof SourceRequestError && error.retryAt ? { retryAt: error.retryAt } : {}),
      }));
      return json(encodeGroupSnapshot(publicSnapshot(fallback)));
    }
    if (error instanceof SourceRequestError)
      return errorResponse(
        error.status === 429 ? 'rate-limited' : 'unavailable',
        error.retryAt,
        error.diagnostic,
      );
    return errorResponse('unavailable', null, { reason: 'internal', stage: 'runtime' });
  }
}

export function normalizeApiErrorCode(value: unknown): ApiErrorCode {
  return apiErrorCodeSchema.safeParse(value).success ? (value as ApiErrorCode) : 'unavailable';
}
