import {
  apiErrorCodeSchema,
  rangeSchema,
  type ApiErrorCode,
  type GroupSnapshot,
  type MonitorDetail,
  type Range,
} from '../shared/contracts.ts';
import type { ServerConfig } from './config.ts';
import { loadGroupSnapshot, PublicGroupNotFoundError } from './snapshot.ts';
import { SourceRequestError, type JsonFetcher } from './sources/http.ts';
import { readCache, writeCache, type ResponseCache } from './cache.ts';

export type ApiRuntime = {
  config: ServerConfig;
  environment: Record<string, string | undefined>;
  fetcher?: JsonFetcher;
  now?: Date;
  cache?: ResponseCache;
};

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
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
  const raw = pathname.slice('/api/v1/'.length).split('/');
  try {
    return raw.map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
}

function detailFromSnapshot(
  snapshot: GroupSnapshot,
  monitorId: string,
  range: Range,
): MonitorDetail | null {
  const monitor = snapshot.monitors.find((item) => item.id === monitorId);
  if (!monitor) return null;
  const response = monitor.history.flatMap((bucket) =>
    bucket.responseMs === null ? [] : [{ at: bucket.from, valueMs: bucket.responseMs }],
  );
  const values = response.map((point) => point.valueMs);
  const average = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
  const events = monitor.history
    .filter((bucket) => bucket.state === 'down' || bucket.state === 'maintenance')
    .map((bucket, index) => ({
      id: `${monitor.id}-${bucket.from}-${index}`,
      from: bucket.from,
      until: bucket.until,
      state: bucket.state === 'maintenance' ? ('maintenance' as const) : ('down' as const),
    }));
  return {
    monitor,
    fetchedAt: snapshot.fetchedAt,
    configVersion: snapshot.configVersion,
    range,
    averageResponse24h: {
      value: average,
      from: response[0]?.at ?? null,
      until: response.at(-1)?.at ?? null,
      basis: 'observed-samples',
    },
    certificateExpiresAt: null,
    supportedRanges: ['24h'],
    capabilities: {
      history: monitor.history.length ? 'available' : 'unsupported',
      response: response.length ? 'available' : 'unsupported',
      events: events.length ? 'available' : 'unsupported',
      certificate: 'unsupported',
    },
    response,
    events,
    type: monitor.type ?? null,
    intervalSeconds: monitor.intervalSeconds ?? null,
    sourceName: monitor.sourceName ?? null,
  };
}

async function loadSnapshot(runtime: ApiRuntime, groupId: string) {
  return loadGroupSnapshot(
    runtime.config,
    groupId,
    runtime.environment,
    runtime.fetcher,
    runtime.now,
  );
}

async function staleResponse(response: Response) {
  const payload = (await response.json()) as Record<string, unknown>;
  if (payload.monitor && typeof payload.monitor === 'object') {
    payload.monitor = { ...(payload.monitor as Record<string, unknown>), freshness: 'stale' };
  } else if ('freshness' in payload) {
    payload.freshness = 'stale';
    if (Array.isArray(payload.monitors))
      payload.monitors = payload.monitors.map((monitor) =>
        monitor && typeof monitor === 'object'
          ? { ...(monitor as Record<string, unknown>), freshness: 'stale' }
          : monitor,
      );
  }
  return json(payload, 200, { 'cache-control': 'no-store', 'x-uptimepage-cache': 'stale' });
}

export async function handleApi(request: Request, runtime: ApiRuntime): Promise<Response> {
  if (request.method !== 'GET') return json({ error: { code: 'not-found', retryAt: null } }, 404);
  const parts = splitPath(new URL(request.url).pathname);
  if (!parts || parts[0] !== 'groups' || (parts.length !== 2 && parts.length !== 4))
    return errorResponse('not-found');
  const groupId = parts[1];
  try {
    const cached = await readCache(runtime.cache, request, runtime.config.configVersion);
    if (cached) return cached;
    const snapshot = await loadSnapshot(runtime, groupId);
    if (parts.length === 2) {
      const response = json(snapshot, 200, { 'cache-control': 'public, max-age=30' });
      await writeCache(runtime.cache, request, runtime.config.configVersion, response);
      return response;
    }
    if (parts[2] !== 'monitors' || !parts[3]) return errorResponse('not-found');
    const rangeValue = new URL(request.url).searchParams.get('range') ?? '24h';
    const range = rangeSchema.safeParse(rangeValue);
    if (!range.success) return errorResponse('invalid-response');
    const detail = detailFromSnapshot(snapshot, parts[3], range.data);
    if (!detail) return errorResponse('not-found');
    const response = json(detail, 200, { 'cache-control': 'public, max-age=30' });
    await writeCache(runtime.cache, request, runtime.config.configVersion, response);
    return response;
  } catch (error) {
    const cached = await readCache(runtime.cache, request, runtime.config.configVersion);
    if (cached) return staleResponse(cached);
    if (error instanceof PublicGroupNotFoundError) return errorResponse('not-found');
    if (error instanceof SourceRequestError)
      return errorResponse(error.status === 429 ? 'rate-limited' : 'unavailable', error.retryAt);
    return errorResponse('unavailable');
  }
}

export function normalizeApiErrorCode(value: unknown): ApiErrorCode {
  return apiErrorCodeSchema.safeParse(value).success ? (value as ApiErrorCode) : 'unavailable';
}
