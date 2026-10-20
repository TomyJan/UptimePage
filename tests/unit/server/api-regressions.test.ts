import { expect, it, vi } from 'vitest';
import { handleApi } from '../../../src/server/api.ts';
import { monitorDetailSchema } from '../../../src/shared/contracts.ts';
import { now, epoch, raw, config, fetcher, memoryCache } from '../../fixtures/server.ts';

it('fails closed for Peekaping details when membership cannot be refreshed', async () => {
  const runtime = {
    config: config(true),
    now,
    cache: memoryCache(),
    environment: { KEY: 'key' },
    fetcher: async () =>
      Response.json({
        data: [{ id: 'm1', name: 'API', active: true, heartbeats: [], uptime_24h: 100 }],
      }),
  };
  const req = new Request('https://site.test/api/v1/groups/core/monitors/m1');
  expect((await handleApi(req, runtime)).status).toBe(200);
  expect(
    (
      await handleApi(req, {
        ...runtime,
        now: new Date(now.getTime() + 31000),
        fetcher: async () => new Response('{}', { status: 503 }),
      })
    ).status,
  ).toBe(502);
});
it('checks refreshed membership even when a UptimeRobot detail cache is still fresh', async () => {
  const runtime = {
    config: config(),
    now,
    cache: memoryCache(),
    environment: { KEY: 'key' },
    fetcher,
  };
  await handleApi(new Request('https://site.test/api/v1/groups/core'), runtime);
  const req = new Request('https://site.test/api/v1/groups/core/monitors/1');
  expect((await handleApi(req, { ...runtime, now: new Date(now.getTime() + 29000) })).status).toBe(
    200,
  );
  expect(
    (
      await handleApi(req, {
        ...runtime,
        now: new Date(now.getTime() + 31000),
        fetcher: async () => Response.json({ stat: 'ok', monitors: [], pagination: { total: 0 } }),
      })
    ).status,
  ).toBe(404);
});
it('does not use expired snapshots or poison the cache on a source error', async () => {
  const runtime = {
    config: config(),
    now,
    cache: memoryCache(),
    environment: { KEY: 'key' },
    fetcher,
  };
  const req = new Request('https://site.test/api/v1/groups/core');
  await handleApi(req, runtime);
  const failed = {
    ...runtime,
    fetcher: async () =>
      new Response('{}', {
        status: 429,
        headers: { 'retry-after': 'Wed, 21 Oct 2026 12:10:00 GMT' },
      }),
  };
  expect(
    (await (await handleApi(req, { ...failed, now: new Date(now.getTime() + 31000) })).json())
      .freshness,
  ).toBe('stale');
  const response = await handleApi(req, { ...failed, now: new Date(now.getTime() + 300000) });
  expect(response.status).toBe(429);
  expect((await response.json()).error.retryAt).toBe('2026-10-21T12:10:00.000Z');
});
it('keeps valid source results when optional caches throw and does not claim missing logs are empty', async () => {
  const cache = {
    async match() {
      throw new Error('cache read failed');
    },
    async put() {
      throw new Error('cache write failed');
    },
  };
  const response = await handleApi(new Request('https://site.test/api/v1/groups/core/monitors/1'), {
    config: config(),
    now,
    cache,
    environment: { KEY: 'key' },
    fetcher: async () =>
      Response.json({
        stat: 'ok',
        monitors: [{ ...raw, logs: undefined }],
        pagination: { total: 1 },
      }),
  });
  expect(response.status).toBe(200);
  expect((await response.json()).capabilities.events).toBe('unavailable');
});
it('keeps regular response samples connected while preserving null outage points', async () => {
  const samples = {
    ...raw,
    status: 2,
    response_times: [
      { datetime: epoch - 600, value: 100 },
      { datetime: epoch - 300, value: 120 },
    ],
    logs: [],
  };
  const response = await handleApi(new Request('https://site.test/api/v1/groups/core/monitors/1'), {
    config: config(),
    now,
    environment: { KEY: 'key' },
    fetcher: async () =>
      Response.json({ stat: 'ok', monitors: [samples], pagination: { total: 1 } }),
  });
  const detail = monitorDetailSchema.parse(await response.json());
  expect(detail.response).toHaveLength(2);
  expect(detail.events).toEqual([]);
  expect(detail.capabilities.events).toBe('available');
});
it('validates routes and ranges before upstream access, and distinguishes source failures from removal', async () => {
  const fetch = vi.fn(fetcher);
  const runtime = { config: config(), environment: { KEY: 'key' }, fetcher: fetch, now };
  for (const path of ['core/bogus/1', 'core/monitors/1?range=30d', 'core/monitors/2']) {
    expect(
      (await handleApi(new Request('https://site.test/api/v1/groups/' + path), runtime)).status,
    ).not.toBe(200);
  }
  expect(fetch).not.toHaveBeenCalled();
  const failure = await handleApi(new Request('https://site.test/api/v1/groups/core/monitors/1'), {
    ...runtime,
    fetcher: async () => new Response('', { status: 503 }),
  });
  expect(failure.status).toBe(502);
  expect((await failure.json()).error.code).toBe('unavailable');
});
it('reuses a group snapshot across details and query noise, with honest stale fallback after 30 seconds', async () => {
  const cache = memoryCache();
  const fetch = vi.fn(fetcher);
  const runtime = { config: config(), environment: { KEY: 'key' }, cache, fetcher: fetch, now };
  await handleApi(new Request('https://site.test/api/v1/groups/core?noise=1'), runtime);
  const detail = await handleApi(
    new Request('https://site.test/api/v1/groups/core/monitors/1?range=24h&noise=2'),
    runtime,
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(
    new URLSearchParams(fetch.mock.calls[0][1]?.body as string).get('response_times_average'),
  ).toBe('30');
  expect(
    new URLSearchParams(fetch.mock.calls[1][1]?.body as string).get('response_times_average'),
  ).toBeNull();
  await handleApi(new Request('https://site.test/api/v1/groups/core/monitors/1?noise=3'), runtime);
  expect(fetch).toHaveBeenCalledTimes(2);
  monitorDetailSchema.parse(await detail.clone().json());
  const payload = await detail.json();
  expect(payload.events[0].until).toBeNull();
  expect(payload.response.some((p: { valueMs: number | null }) => p.valueMs === null)).toBe(true);
  const failed = {
    ...runtime,
    now: new Date(now.getTime() + 31000),
    fetcher: async () => new Response('', { status: 503 }),
  };
  const stale = await handleApi(new Request('https://site.test/api/v1/groups/core'), failed);
  expect((await stale.json()).freshness).toBe('stale');
});
it('does not retain a removed Peekaping detail in a separate cache entry', async () => {
  const runtime = {
    config: config(true),
    environment: { KEY: 'key' },
    cache: memoryCache(),
    now,
    fetcher: async () =>
      Response.json({
        data: [{ id: 'm1', name: 'API', active: true, heartbeats: [], uptime_24h: 100 }],
      }),
  };
  const request = new Request('https://site.test/api/v1/groups/core/monitors/m1');
  expect((await handleApi(request, runtime)).status).toBe(200);
  expect(
    (
      await handleApi(request, {
        ...runtime,
        now: new Date(now.getTime() + 31000),
        fetcher: async () => Response.json({ data: [] }),
      })
    ).status,
  ).toBe(404);
});
