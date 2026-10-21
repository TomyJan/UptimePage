import { expect, it } from 'vitest';
import { handleApi } from '../../../src/server/api.ts';
import { config, now, memoryCache } from '../../fixtures/server.ts';

import { protectedSource } from '../../fixtures/peekaping.ts';
it('uses status pages solely for membership and protected APIs for every displayed value', async () => {
  const calls: string[] = [];
  const runtime = {
    config: config(true),
    now,
    environment: { KEY: 'secret' },
    fetcher: protectedSource(calls),
    cache: memoryCache(),
  };
  const group = await (
    await handleApi(new Request('https://site.test/api/v1/groups/core'), runtime)
  ).json();
  expect(group.monitors).toHaveLength(1);
  expect(group.monitors[0]).toMatchObject({
    id: 'public',
    name: 'Protected API',
    state: 'operational',
    intervalSeconds: 60,
    history: [],
  });
  expect(group.hydrateDetails).toBe(true);
  const response = await handleApi(
    new Request('https://site.test/api/v1/groups/core/monitors/public'),
    runtime,
  );
  const text = await response.text();
  const detail = JSON.parse(text);
  expect(response.status).toBe(200);
  expect(detail.monitor.history).toHaveLength(3);
  expect(detail.monitor.history[0].from).toBe('2026-10-20T13:00:00.000Z');
  expect(detail.monitor.history.map((b: { state: string }) => b.state)).toEqual([
    'operational',
    'no-data',
    'partial',
  ]);
  expect(detail.monitor).toMatchObject({
    responseMs: 42,
    observedAt: '2026-10-21T11:59:30.000Z',
    uptime24h: { value: 99.5 },
  });
  expect(detail.averageResponse).toMatchObject({ value: 36, basis: 'provider' });
  expect(detail.capabilities.events).toBe('available');
  expect(text).not.toMatch(/PRIVATE|TOKEN|WRONG PUBLIC NAME|Forbidden/);
  const before = calls.length;
  expect(
    (await handleApi(new Request('https://site.test/api/v1/groups/core/monitors/private'), runtime))
      .status,
  ).toBe(404);
  expect(calls).toHaveLength(before);
});
it('caches only member IDs for ten minutes independently of live status and fails closed on expiry', async () => {
  const calls: string[] = [];
  let visible = true;
  const runtime = {
    config: config(true),
    now,
    environment: { KEY: 'secret' },
    fetcher: protectedSource(calls, () => visible),
    cache: memoryCache(),
  };
  const req = new Request('https://site.test/api/v1/groups/core');
  await handleApi(req, runtime);
  await handleApi(req, { ...runtime, now: new Date(now.getTime() + 31000) });
  expect(calls.filter((p) => p.includes('/status-pages/'))).toHaveLength(2);
  expect(calls.filter((p) => p.includes('/batch'))).toHaveLength(2);
  visible = false;
  const removed = await handleApi(new Request(req.url + '/monitors/public'), {
    ...runtime,
    now: new Date(now.getTime() + 600000),
  });
  expect(removed.status).toBe(404);
  expect(calls.filter((p) => p.includes('/status-pages/'))).toHaveLength(4);
  expect(calls.filter((p) => p.includes('/stats/'))).toHaveLength(0);
});
it('does not reuse expired membership when its source is unavailable', async () => {
  const runtime = {
    config: config(true),
    now,
    environment: { KEY: 'secret' },
    fetcher: protectedSource(),
    cache: memoryCache(),
  };
  const req = new Request('https://site.test/api/v1/groups/core/monitors/public');
  await handleApi(req, runtime);
  const failed = await handleApi(req, {
    ...runtime,
    now: new Date(now.getTime() + 600000),
    fetcher: async () => new Response('', { status: 503 }),
  });
  expect(failed.status).toBe(502);
  expect((await failed.json()).error.diagnostic.stage).toBe('membership');
});

it('reads incident transitions with API-key authentication instead of inferring incidents from aggregates', async () => {
  const source = protectedSource();
  const response = await handleApi(
    new Request('https://site.test/api/v1/groups/core/monitors/public'),
    {
      config: config(true),
      environment: { KEY: 'secret' },
      now,
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        if (url.searchParams.get('important') === 'true') {
          expect(new Headers(init?.headers).get('X-API-Key')).toBe('secret');
          return Response.json({
            data: [
              { id: 'recovered', status: 1, time: '2026-10-21T11:10:00Z', msg: 'PRIVATE' },
              { id: 'incident', status: 0, time: '2026-10-21T11:00:00Z', msg: 'PRIVATE' },
            ],
          });
        }
        return source(input, init);
      },
    },
  );
  const detail = await response.json();
  expect(detail.capabilities.events).toBe('available');
  expect(detail.events).toEqual([
    {
      id: 'incident',
      from: '2026-10-21T11:00:00.000Z',
      until: '2026-10-21T11:10:00.000Z',
      state: 'down',
    },
  ]);
});

it('keeps the remaining public monitors when a cached member has been deleted upstream', async () => {
  const source = protectedSource();
  const response = await handleApi(new Request('https://site.test/api/v1/groups/core'), {
    config: config(true),
    environment: { KEY: 'secret' },
    now,
    fetcher: async (input, init) =>
      String(input).includes('/status-pages/')
        ? Response.json({ data: [{ id: 'public' }, { id: 'deleted' }] })
        : String(input).includes('/batch?')
          ? Response.json({
              data: [{ id: 'public', name: 'Protected API', status: 1, interval: 60 }],
            })
          : source(input, init),
  });
  expect(response.status).toBe(200);
  const group = await response.json();
  expect(group.monitors.map((m: { id: string }) => m.id)).toEqual(['public']);
  expect(group.revokedMonitorIds).toEqual(['deleted']);
  expect(group.subgroups[0].monitorIds).toEqual(['public']);
});
