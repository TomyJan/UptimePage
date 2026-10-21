import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { memoryCache } from '../../fixtures/server.ts';

vi.mock('../../../.generated/server-config.ts', async () => {
  const { config } = await import('../../fixtures/server.ts');
  return { default: { ...config(true), cache: { kvBinding: 'TEST_UPTIMEPAGE_KV' } } };
});
import { createCloudApiHandler } from '../../../src/server/cloud-runtime.ts';
import cacheRequest from '../../../edge-functions/_uptimepage/cache.ts';
import serverConfig from '../../../.generated/server-config.ts';
import cloudRequest from '../../../cloud-functions/api/v1/[[default]].ts';
let onRequest = createCloudApiHandler(serverConfig);

beforeEach(() => {
  onRequest = createCloudApiHandler(serverConfig);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const request = (suffix = '') => new Request(`https://preview.test/api/v1/groups/core${suffix}`);
const env = { KEY: 'private-test-key' };
it('identifies the actual bridge origin without exposing request or forwarding hosts', async () => {
  const response = await onRequest({
    request: new Request('http://preview.test/api/v1/groups/missing', {
      headers: {
        host: 'preview.test',
        'eo-pages-host': 'preview.test',
        'x-forwarded-host': 'private-internal.invalid',
      },
    }),
    env,
  });
  expect(response.status).toBe(404);
  const diagnostic = response.headers.get('x-uptimepage-cache');
  expect(diagnostic).toContain('origin-41bffbbd05e5');
  expect(diagnostic).toContain('host-41bffbbd05e5');
  expect(diagnostic).toContain('eo-pages-host-41bffbbd05e5');
  expect(diagnostic).not.toContain('preview.test');
  expect(diagnostic).not.toContain('private-internal');
});
function upstream() {
  let calls = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/_uptimepage/cache'))
      return cacheRequest({ request: new Request(url, init), env });
    calls++;
    expect(new Headers(init.headers).get('X-API-Key')).toBe('private-test-key');
    if (url.includes('/monitors/batch?'))
      return Response.json({
        data: [
          {
            id: '1',
            name: 'Public API',
            active: true,
            status: 1,
            interval: 60,
            config: 'private-target',
          },
        ],
      });
    if (url.includes('/stats/points?'))
      return Response.json({ data: { points: [], avgPing: null, uptime: null } });
    if (url.includes('/heartbeats?')) return Response.json({ data: [] });
    expect(url).toMatch(
      /^https:\/\/source.test\/api\/v1\/status-pages\/slug\/(one|two)\/monitors$/,
    );
    expect(new Headers(init.headers).get('X-API-Key')).toBe('private-test-key');
    return Response.json({
      data: [
        {
          id: '1',
          name: 'Public API',
          type: 'http',
          active: true,
          uptime_24h: 100,
          heartbeats: [
            { id: 'hb', status: 1, time: new Date(Date.now() - 1000).toISOString(), ping: 42 },
          ],
        },
      ],
    });
  });
  return () => calls;
}

it('runs the actual entry without cache or KV and keeps secrets out of public responses', async () => {
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal('TEST_UPTIMEPAGE_KV', undefined);
  const calls = upstream();
  const missingKey = await cloudRequest({ request: request() });
  expect(missingKey.status).toBe(502);
  expect(calls()).toBe(0);
  const response = await cloudRequest({ request: request(), env });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-uptimepage-cache')).toContain('status-put:http-200');
  const text = await response.text();
  expect(JSON.parse(text).monitors[0]).toMatchObject({ id: '1', state: 'operational' });
  for (const privateValue of ['private-test-key', 'source.test', 'apiKeyEnv'])
    expect(text).not.toContain(privateValue);
  const denied = await cloudRequest({ request: request('/monitors/private-id'), env });
  expect(denied.status).toBe(404);
});

it.each(['lost', 'hung'])('recovers from KV when the node cache is %s', async (mode) => {
  vi.stubGlobal('caches', { default: memoryCache() });
  const entries = new Map<string, string>();
  vi.stubGlobal('TEST_UPTIMEPAGE_KV', {
    async get(key: string) {
      return entries.has(key) ? JSON.parse(entries.get(key)!) : null;
    },
    async put(key: string, value: string) {
      entries.set(key, value);
    },
  });
  const calls = upstream();
  expect((await onRequest({ request: request(), env })).status).toBe(200);
  expect(entries.size).toBe(3);
  expect((await onRequest({ request: request('/monitors/1'), env })).status).toBe(200);
  expect(calls()).toBe(8);
  vi.stubGlobal('caches', {
    default:
      mode === 'hung' ? { match: () => new Promise(() => {}), put: async () => {} } : memoryCache(),
  });
  onRequest = createCloudApiHandler(serverConfig);
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/_uptimepage/cache'))
      return cacheRequest({ request: new Request(url, init), env });
    throw new Error('upstream offline');
  });
  const fromKv = await onRequest({ request: request(), env });
  expect(fromKv.status).toBe(200);
  expect((await fromKv.json()).freshness).toBe('fresh');
});

it('uses the public HTTPS origin when the cloud runtime supplies an internal HTTP URL', async () => {
  vi.stubGlobal('caches', undefined);
  const entries = new Map<string, string>();
  vi.stubGlobal('TEST_UPTIMEPAGE_KV', {
    async get(key: string) {
      return entries.has(key) ? JSON.parse(entries.get(key)!) : null;
    },
    async put(key: string, value: string) {
      entries.set(key, value);
    },
  });
  upstream();
  const realSourceAndBridge = fetch;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    // EdgeOne redirects public HTTP to HTTPS; bridge fetch refuses redirects.
    if (url.startsWith('http://preview.test/')) throw new TypeError('redirect');
    return realSourceAndBridge(url, init);
  });
  const response = await onRequest({
    request: new Request('http://preview.test/api/v1/groups/core'),
    env,
  });
  expect(response.status).toBe(200);
  expect(entries.size).toBe(3);
  expect(response.headers.get('x-uptimepage-cache')).toContain('status-put:http-200');
  for (const stored of entries.values()) {
    expect(JSON.parse(stored).requestUrl).toMatch(/^https:\/\/preview\.test\//);
  }
});

it('ignores failed cache and KV services and continues to the real source adapter', async () => {
  const failed = async () => {
    throw new Error('optional storage offline');
  };
  vi.stubGlobal('caches', { default: { match: failed, put: failed } });
  vi.stubGlobal('TEST_UPTIMEPAGE_KV', { get: failed, put: failed });
  const calls = upstream();
  const response = await onRequest({ request: request('/monitors/1'), env });
  expect(response.status).toBe(200);
  expect((await response.json()).monitor).toMatchObject({ id: '1', freshness: 'fresh' });
  expect(calls()).toBe(6);
});
