import { afterEach, expect, it, vi } from 'vitest';
import { handleApi } from '../../../src/server/api.ts';
import { createCloudApiHandler } from '../../../src/server/cloud-runtime.ts';
import { cacheBridgeSecret, handleCacheBridge } from '../../../src/server/cache-bridge.ts';
import { loadPeekapingMembership } from '../../../src/server/peekaping-membership.ts';
import { config, fetcher, memoryCache, now, raw } from '../../fixtures/server.ts';

afterEach(() => vi.unstubAllGlobals());

it('does not reuse a previous account snapshot through a newly signed shared cache bridge', async () => {
  const cfg = config();
  cfg.groups[0].subgroups[0].monitorIds = ['*'];
  const storage = memoryCache();
  let environment = { KEY: 'account-a' };
  let sourceCalls = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/_uptimepage/cache'))
      return handleCacheBridge(
        new Request(input, init),
        cacheBridgeSecret(cfg, environment),
        cfg.configVersion,
        storage,
        storage,
      );
    sourceCalls++;
    const accountA = new URLSearchParams(String(init?.body)).get('api_key') === 'account-a';
    return Response.json({
      stat: 'ok',
      monitors: accountA ? [raw] : [],
      pagination: { total: accountA ? 1 : 0 },
    });
  });
  const request = new Request('https://site.test/api/v1/groups/core');
  const first = await createCloudApiHandler(cfg)({ request, env: environment });
  expect((await first.json()).monitors.map((m: { id: string }) => m.id)).toEqual(['1']);
  const warm = await createCloudApiHandler(cfg)({ request, env: environment });
  expect((await warm.json()).monitors.map((m: { id: string }) => m.id)).toEqual(['1']);
  expect(sourceCalls).toBe(1);
  environment = { KEY: 'account-b' };
  const second = await createCloudApiHandler(cfg)({ request, env: environment });
  expect(second.status).toBe(200);
  expect((await second.json()).monitors).toEqual([]);
  expect(sourceCalls).toBe(2);
});

it.each(['', '/monitors/1'] as const)(
  'rejects missing credentials before using cached %s data',
  async (suffix) => {
    const runtime = {
      config: config(),
      environment: { KEY: 'old-key' },
      now,
      fetcher,
      cache: memoryCache(),
    };
    const request = new Request(`https://site.test/api/v1/groups/core${suffix}`);
    expect((await handleApi(request, runtime)).status).toBe(200);
    const denied = await handleApi(request, { ...runtime, environment: {} });
    expect(denied.status).toBe(502);
    expect((await denied.json()).error.diagnostic.reason).toBe('configuration');
  },
);

it('does not return a prior credential detail as stale when the rotated source fails', async () => {
  const runtime = {
    config: config(),
    environment: { KEY: 'old-key' },
    now,
    fetcher,
    cache: memoryCache(),
  };
  const request = new Request('https://site.test/api/v1/groups/core/monitors/1');
  expect((await handleApi(request, runtime)).status).toBe(200);
  const failed = await handleApi(request, {
    ...runtime,
    environment: { KEY: 'new-key' },
    now: new Date(now.getTime() + 31000),
    fetcher: async () => new Response(null, { status: 503 }),
  });
  expect(failed.status).toBe(502);
  expect(await failed.text()).not.toContain('old-key');
});

it('binds Peekaping membership caches to normalized credentials without exposing them', async () => {
  const cfg = config(true),
    cache = memoryCache();
  let calls = 0,
    visible = true;
  const source: typeof fetch = async () => {
    calls++;
    return Response.json({ data: visible ? [{ id: 'previous-member' }] : [] });
  };
  const load = (key: string) =>
    loadPeekapingMembership(cfg, 'core', { KEY: key }, source, now, cache);
  expect((await load('old-key')).subgroups[0].monitorIds).toEqual(['previous-member']);
  visible = false;
  expect((await load(' old-key ')).subgroups[0].monitorIds).toEqual(['previous-member']);
  expect(calls).toBe(2);
  expect((await load('new-key')).subgroups.every((s) => s.monitorIds.length === 0)).toBe(true);
  expect(calls).toBe(4);
});
