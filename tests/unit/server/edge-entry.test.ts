import { afterEach, expect, it, vi } from 'vitest';
import { memoryCache } from '../../fixtures/server.ts';

vi.mock('../../../.generated/server-config.ts', async () => {
  const { config } = await import('../../fixtures/server.ts');
  return { default: { ...config(true), cache: { kvBinding: 'TEST_UPTIMEPAGE_KV' } } };
});
import onRequest from '../../../edge-functions/api/v1/[[default]].ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const request = (suffix = '') => new Request(`https://preview.test/api/v1/groups/core${suffix}`);
const env = { KEY: 'private-test-key' };
function upstream() {
  let calls = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
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
  const missingKey = await onRequest({ request: request() });
  expect(missingKey.status).toBe(502);
  expect(calls()).toBe(0);
  const response = await onRequest({ request: request(), env });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const text = await response.text();
  expect(JSON.parse(text).monitors[0]).toMatchObject({ id: '1', state: 'operational' });
  for (const privateValue of ['private-test-key', 'source.test', 'apiKeyEnv'])
    expect(text).not.toContain(privateValue);
  const denied = await onRequest({ request: request('/monitors/private-id'), env });
  expect(denied.status).toBe(404);
});

it('uses global Cache and KV bindings and survives loss of the node cache', async () => {
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
  vi.stubGlobal('caches', { default: memoryCache() });
  vi.stubGlobal('fetch', async () => {
    throw new Error('upstream offline');
  });
  const fromKv = await onRequest({ request: request(), env });
  expect(fromKv.status).toBe(200);
  expect((await fromKv.json()).freshness).toBe('fresh');
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
