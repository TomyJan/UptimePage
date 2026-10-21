import { expect, it } from 'vitest';
import { handleApi } from '../../../src/server/api.ts';
import { config, now, memoryCache } from '../../fixtures/server.ts';
import { protectedSource } from '../../fixtures/peekaping.ts';

it('returns protected homepage values without fetching detail events or minute curves', async () => {
  const calls: string[] = [];
  const source = protectedSource();
  const response = await handleApi(new Request('https://site.test/api/v1/groups/core'), {
    config: config(true),
    environment: { KEY: 'secret' },
    now,
    fetcher: async (input, init) => {
      const url = new URL(String(input));
      calls.push(url.pathname + url.search);
      if (url.pathname.endsWith('/stats/points')) {
        expect(url.searchParams.get('granularity')).toBe('hour');
        return Response.json({
          data: {
            points: [
              { timestamp: now.getTime() - 3600000, up: 59, down: 1, maintenance: 0, ping: 42 },
            ],
            uptime: 99.5,
            avgPing: 42,
          },
        });
      }
      return source(input, init);
    },
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.monitors[0]).toMatchObject({ id: 'public', responseMs: 42, uptime24h: 99.5 });
  expect(body.monitors[0].history.length).toBeGreaterThan(0);
  expect(body.monitors[0].history.length).toBeLessThanOrEqual(48);
  expect(body.monitors[0].history.some((cell: unknown[]) => cell[0] === 'partial')).toBe(true);
  expect(body.monitors[0]).not.toHaveProperty('groupId');
  expect(body.monitors[0]).not.toHaveProperty('type');
  expect(body.monitors[0]).not.toHaveProperty('intervalSeconds');
  expect(body.monitors[0]).not.toHaveProperty('subgroupIds');
  expect(calls.filter((p) => p.includes('/stats/'))).toHaveLength(1);
  expect(calls.filter((p) => p.includes('/heartbeats'))).toHaveLength(1);
  expect(calls.some((p) => p.includes('important='))).toBe(false);
  expect(JSON.stringify(body)).not.toMatch(
    /PRIVATE|TOKEN|WRONG PUBLIC NAME|Forbidden|hydrateDetails/,
  );
});

it('does not load other monitors history when opening a single detail', async () => {
  const calls: string[] = [];
  const source = protectedSource(calls);
  const response = await handleApi(
    new Request('https://site.test/api/v1/groups/core/monitors/public'),
    {
      config: config(true),
      environment: { KEY: 'secret' },
      now,
      cache: memoryCache(),
      fetcher: source,
    },
  );
  expect(response.status).toBe(200);
  expect(calls.filter((p) => p.includes('/stats/'))).toHaveLength(1);
  expect(calls.find((p) => p.includes('/stats/'))).toContain('granularity=minute');
});

for (const count of [50, 200])
  it(`aggregates ${count} monitors with bounded upstream concurrency and a compact response`, async () => {
    const ids = Array.from({ length: count }, (_, i) => String(i));
    let active = 0,
      maximum = 0;
    const calls: string[] = [];
    const cache = memoryCache();
    const runtime = {
      config: config(true),
      environment: { KEY: 'secret' },
      now,
      cache,
      fetcher: (async (input, init) => {
        const url = new URL(String(input));
        expect(new Headers(init?.headers).get('X-API-Key')).toBe('secret');
        calls.push(url.pathname + url.search);
        if (url.pathname.includes('/status-pages/'))
          return Response.json({ data: ids.map((id) => ({ id })) });
        if (url.pathname.endsWith('/batch'))
          return Response.json({
            data: url.searchParams
              .get('ids')!
              .split(',')
              .map((id) => ({ id, name: `Monitor ${id}`, status: 1, interval: 60 })),
          });
        active++;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        if (url.pathname.endsWith('/stats/points')) {
          expect(url.searchParams.get('granularity')).toBe('hour');
          return Response.json({
            data: {
              points: Array.from({ length: 24 }, (_, i) => ({
                timestamp: now.getTime() - (24 - i) * 3600000,
                up: 59,
                down: i === 12 ? 1 : 0,
                maintenance: 0,
                ping: 42,
              })),
              uptime: 99.9,
            },
          });
        }
        expect(url.searchParams.get('important')).toBeNull();
        expect(url.searchParams.get('limit')).toBe('1');
        return Response.json({ data: [{ status: 1, ping: 0, time: now.toISOString() }] });
      }) as typeof fetch,
    };
    const request = new Request('https://site.test/api/v1/groups/core');
    const response = await handleApi(request, runtime);
    expect(response.status).toBe(200);
    const text = await response.text();
    const body = JSON.parse(text);
    expect(body.monitors).toHaveLength(count);
    expect(body.monitors.every((m: { responseMs: number }) => m.responseMs === 0)).toBe(true);
    expect(calls.filter((p) => p.includes('/batch?'))).toHaveLength(Math.ceil(count / 100));
    expect(calls.filter((p) => p.includes('/stats/'))).toHaveLength(count);
    expect(calls.filter((p) => p.includes('/heartbeats?'))).toHaveLength(count);
    expect(maximum).toBeGreaterThan(1);
    expect(maximum).toBeLessThanOrEqual(16);
    // Less than 1 KB per monitor, with no minute curves, event logs or repeated dates.
    expect(new TextEncoder().encode(text).length).toBeLessThan(count * 1000 + 1000);
    const before = calls.length;
    await handleApi(request, runtime);
    expect(calls).toHaveLength(before);
  });

it('stops scheduling homepage checks after a rate limit and preserves its safe deadline', async () => {
  let queries = 0;
  const response = await handleApi(new Request('https://site.test/api/v1/groups/core'), {
    config: config(true),
    environment: { KEY: 'secret' },
    now,
    fetcher: async (input) => {
      const url = new URL(String(input));
      const data = Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        name: 'Monitor',
        status: 1,
      }));
      if (url.pathname.includes('/status-pages/') || url.pathname.endsWith('/batch'))
        return Response.json({ data });
      queries++;
      return new Response('', {
        status: 429,
        headers: { 'retry-after': 'Wed, 21 Oct 2026 12:10:00 GMT' },
      });
    },
  });
  const body = await response.json();
  expect(queries).toBeLessThanOrEqual(16);
  expect(
    body.subgroupErrors.every(
      (e: { code: string; retryAt: string }) =>
        e.code === 'rate-limited' && e.retryAt === '2026-10-21T12:10:00.000Z',
    ),
  ).toBe(true);
  expect(body.monitors.every((m: { freshness: string }) => m.freshness === 'unavailable')).toBe(
    true,
  );
});

it('marks a successful detail fresh after joining a partially failed in-flight homepage', async () => {
  const source = protectedSource();
  const cache = memoryCache();
  const runtime = {
    config: config(true),
    environment: { KEY: 'secret' },
    now,
    cache,
    inFlight: new Map<string, Promise<unknown>>(),
    fetcher: (async (input, init) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const url = new URL(String(input));
      if (url.searchParams.get('granularity') === 'hour') return new Response('', { status: 503 });
      return source(input, init);
    }) as typeof fetch,
  };
  const [home, detail] = await Promise.all([
    handleApi(new Request('https://site.test/api/v1/groups/core'), runtime),
    handleApi(new Request('https://site.test/api/v1/groups/core/monitors/public'), runtime),
  ]);
  expect((await home.json()).freshness).toBe('stale');
  expect(detail.status).toBe(200);
  expect((await detail.json()).monitor.freshness).toBe('fresh');
});

it('retains all-maintenance hourly blocks using upstream maintenance as a subset of up', async () => {
  const source = protectedSource();
  const response = await handleApi(new Request('https://site.test/api/v1/groups/core'), {
    config: config(true),
    environment: { KEY: 'secret' },
    now,
    fetcher: async (input, init) =>
      String(input).includes('/stats/points')
        ? Response.json({
            data: {
              points: [
                { timestamp: now.getTime() - 3600000, up: 60, down: 0, maintenance: 60, ping: 0 },
              ],
              uptime: 100,
            },
          })
        : source(input, init),
  });
  const body = await response.json();
  expect(body.monitors[0].history.some((cell: unknown[]) => cell[0] === 'maintenance')).toBe(true);
  expect(body.monitors[0].history.some((cell: unknown[]) => cell[0] === 'partial')).toBe(false);
});
