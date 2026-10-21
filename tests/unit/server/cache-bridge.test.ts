import { expect, it, vi } from 'vitest';
import { createRemoteCache, handleCacheBridge } from '../../../src/server/cache-bridge.ts';
import { createMemoryCache } from '../../../src/server/memory-cache.ts';
import { LayeredResponseCache } from '../../../src/server/kv-cache.ts';

const origin = 'https://preview.test';
const key = new Request(`${origin}/__uptimepage_cache/version-home-v3/api/v1/groups/core`);

it('reports a pending write when the API budget ends before the bridge response', async () => {
  const events: string[] = [];
  const remote = createRemoteCache(
    origin,
    'secret',
    'version',
    'status',
    async () =>
      new Promise<Response>((resolve) => setTimeout(() => resolve(new Response('null')), 1200)),
    (event) => events.push(event),
  );
  await new LayeredResponseCache([remote]).put(key, new Response('{}'));
  expect(events).toEqual(['status-put:pending']);
});

it.each(['denied', 'network', 'timeout'])(
  'reports sanitized %s bridge failures',
  async (failure) => {
    const events: string[] = [];
    const cache = createRemoteCache(
      origin,
      'private-secret',
      'version',
      'status',
      async () => {
        if (failure === 'denied') return new Response('private upstream body', { status: 404 });
        throw failure === 'timeout'
          ? new DOMException('private URL and credential', 'TimeoutError')
          : new Error('private URL and credential');
      },
      (event) => events.push(event),
    );
    await cache.match(key).catch(() => undefined);
    expect(events).toEqual([
      'status-match:pending',
      `status-match:${failure === 'denied' ? 'http-404' : failure}`,
    ]);
  },
);

it('handles unsigned requests in edge runtimes without static Response.json', async () => {
  const storage = createMemoryCache();
  const json = vi.spyOn(Response, 'json').mockImplementation(() => {
    throw new TypeError('Response.json is not available');
  });
  try {
    const response = await handleCacheBridge(
      new Request(origin),
      'secret',
      'version',
      storage,
      storage,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
  } finally {
    json.mockRestore();
  }
});

it('authenticates cache reads and writes without exposing the secret or caching the transport', async () => {
  const storage = createMemoryCache();
  const calls: Request[] = [];
  const cache = createRemoteCache(
    origin,
    'private-secret',
    'version',
    'status',
    async (input, init) => {
      const request = new Request(input, init);
      calls.push(request.clone());
      const result = await handleCacheBridge(
        request,
        'private-secret',
        'version',
        storage,
        storage,
      );
      expect(result.headers.get('cache-control')).toBe('no-store');
      return result;
    },
  );
  expect(await cache.match(key)).toBeUndefined();
  await cache.put(
    key,
    new Response('{"public":true}', { headers: { 'cache-control': 'public, max-age=300' } }),
  );
  expect(await (await cache.match(key))!.json()).toEqual({ public: true });
  expect(calls).toHaveLength(3);
  expect(await calls[1].text()).not.toContain('private-secret');
  expect(new URL(calls[1].url).pathname).toBe('/_uptimepage/cache');
});

it.each(['unsigned', 'tampered', 'expired', 'other-version', 'other-origin', 'replayed-origin'])(
  'rejects %s cache requests before accessing storage',
  async (mode) => {
    let accesses = 0;
    const storage = {
      match: async () => {
        accesses++;
        return undefined;
      },
      put: async () => {
        accesses++;
      },
    };
    const remote = createRemoteCache(origin, 'secret', 'version', 'status', async (input, init) => {
      const original = new Request(input, init);
      const headers = new Headers(original.headers);
      let body = await original.text();
      if (mode === 'unsigned') headers.delete('x-uptimepage-cache-signature');
      if (mode === 'tampered') body = body.replace('core', 'other');
      const request = new Request(
        mode === 'replayed-origin' ? 'https://other.test/_uptimepage/cache' : original.url,
        { method: 'POST', headers, body },
      );
      const response = await handleCacheBridge(
        request,
        'secret',
        mode === 'other-version' ? 'different' : 'version',
        storage,
        storage,
        mode === 'expired' ? Date.now() + 61000 : Date.now(),
      );
      const reasons: Record<string, string> = {
        unsigned: 'signature',
        tampered: 'signature',
        expired: 'expired',
        'other-version': 'version',
        'replayed-origin': 'origin',
      };
      if (reasons[mode])
        expect(response.headers.get('x-uptimepage-cache-bridge')).toBe(reasons[mode]);
      return response;
    });
    expect(
      await remote.match(
        mode === 'other-origin'
          ? new Request('https://other.test/__uptimepage_cache/version/api/v1/groups/core')
          : key,
      ),
    ).toBeUndefined();
    expect(accesses).toBe(0);
  },
);

it('bounds in-memory storage and expires old entries', async () => {
  const cache = createMemoryCache(8);
  const response = (body: string) =>
    new Response(body, { headers: { 'cache-control': 'max-age=300' } });
  await cache.put(new Request(`${origin}/one`), response('123456'));
  await cache.put(new Request(`${origin}/two`), response('123456'));
  expect(await cache.match(`${origin}/one`)).toBeUndefined();
  expect(await (await cache.match(`${origin}/two`))!.text()).toBe('123456');
  await cache.put(new Request(`${origin}/three`), response('123456789'));
  expect(await cache.match(`${origin}/three`)).toBeUndefined();
  await cache.put(
    new Request(`${origin}/expired`),
    new Response('x', { headers: { 'cache-control': 'max-age=0' } }),
  );
  expect(await cache.match(`${origin}/expired`)).toBeUndefined();
});

it('skips oversized UTF-8 bridge requests without making a platform request', async () => {
  let calls = 0;
  const remote = createRemoteCache(origin, 'secret', 'version', 'status', async () => {
    calls++;
    throw new Error('must not reach the 1 MB edge request limit');
  });
  await remote.put(
    key,
    new Response('中'.repeat(340000), { headers: { 'cache-control': 'max-age=300' } }),
  );
  expect(calls).toBe(0);
});
