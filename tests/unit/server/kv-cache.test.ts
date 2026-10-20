import { afterEach, expect, it, vi } from 'vitest';
import {
  createKvCache,
  LayeredResponseCache,
  type KvNamespace,
} from '../../../src/server/kv-cache.ts';
afterEach(() => vi.useRealTimers());

it('reaches the fallback layer when the primary cache never settles', async () => {
  vi.useFakeTimers();
  const cache = new LayeredResponseCache([
    { match: () => new Promise<Response | undefined>(() => {}), put: async () => {} },
    { match: async () => new Response('fallback'), put: async () => {} },
  ]);
  const read = cache.match(new Request('https://site.test'));
  await vi.advanceTimersByTimeAsync(401);
  expect(await (await read)?.text()).toBe('fallback');
});

it('expires valid KV entries according to the stored deadline', async () => {
  vi.useFakeTimers();
  const { namespace } = memoryKv();
  const cache = createKvCache(namespace);
  const request = new Request('https://site.test/groups/core');
  await cache.put(
    request,
    new Response('{}', { headers: { 'cache-control': 'public, max-age=30' } }),
  );
  expect(await cache.match(request)).toBeDefined();
  vi.setSystemTime(Date.now() + 30000);
  expect(await cache.match(request)).toBeUndefined();
});

function memoryKv() {
  const values = new Map<string, string>();
  const namespace: KvNamespace = {
    async get(key, options) {
      expect(options).toEqual({ type: 'json' });
      const value = values.get(key);
      return value ? JSON.parse(value) : null;
    },
    async put(key, value) {
      expect(key).toMatch(/^uptimepage_[a-f0-9]+$/);
      values.set(key, value);
    },
  };
  return { namespace, values };
}

it('stores cache responses in KV with an expiry derived from cache-control', async () => {
  const { namespace } = memoryKv();
  const cache = createKvCache(namespace);
  const request = new Request('https://site.test/api/v1/groups/core?x=a/b');
  await cache.put(
    request,
    new Response('{"ok":true}', { headers: { 'cache-control': 'public, max-age=60' } }),
  );
  const response = await cache.match(request);
  expect(await response?.json()).toEqual({ ok: true });
});

it('reuses physical KV slots across config versions while denying mismatched versions', async () => {
  const { namespace, values } = memoryKv();
  const cache = createKvCache(namespace);
  const a = new Request('https://site.test/__uptimepage_cache/version-a/api/v1/groups/core');
  const b = new Request('https://site.test/__uptimepage_cache/version-b/api/v1/groups/core');
  await cache.put(a, new Response('old'));
  expect(await cache.match(b)).toBeUndefined();
  await cache.put(b, new Response('new'));
  expect(values.size).toBe(1);
  expect(await cache.match(a)).toBeUndefined();
  expect(await (await cache.match(b))?.text()).toBe('new');
});

it('continues using another cache layer when an optional KV binding fails', async () => {
  const fallback = new Map<string, Response>();
  const primary = {
    match: async () => undefined,
    put: async () => {
      throw new Error('kv unavailable');
    },
  };
  const secondary = {
    match: async () => new Response('cached'),
    put: async (request: Request, response: Response) => {
      fallback.set(request.url, response);
    },
  };
  const cache = new LayeredResponseCache([primary, secondary]);
  expect(await (await cache.match(new Request('https://site.test')))?.text()).toBe('cached');
  await cache.put(new Request('https://site.test'), new Response('fresh'));
  expect(fallback.size).toBe(1);
});

it('bounds KV keys and rejects corrupt envelopes without an expiry', async () => {
  let savedKey = '';
  const cache = createKvCache({
    async get() {
      return { body: '{}', status: 200, headers: [] };
    },
    async put(key) {
      savedKey = key;
    },
  });
  const req = new Request('https://site.test/' + 'm'.repeat(500));
  await cache.put(req, new Response('{}'));
  expect(savedKey.length).toBeLessThanOrEqual(512);
  expect(await cache.match(req)).toBeUndefined();
});
