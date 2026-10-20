import { expect, it } from 'vitest';
import {
  createKvCache,
  LayeredResponseCache,
  type KvNamespace,
} from '../../../src/server/kv-cache.ts';

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
