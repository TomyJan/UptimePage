import { afterEach, expect, it, vi } from 'vitest';
import { loadGroupSnapshot } from '../../../src/server/snapshot.ts';
import type { GroupSnapshot } from '../../../src/shared/contracts.ts';
import { config, memoryCache, now } from '../../fixtures/server.ts';
import { LayeredResponseCache } from '../../../src/server/kv-cache.ts';
import { protectedSource } from '../../fixtures/peekaping.ts';

afterEach(() => vi.useRealTimers());

it('cancels the companion heartbeat when statistics fail rather than leaving an orphan request', async () => {
  vi.useFakeTimers();
  const source = protectedSource();
  let aborted = false;
  const snapshot = await loadGroupSnapshot(
    config(true),
    'core',
    { KEY: 'secret' },
    async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/stats/points')) return new Response('', { status: 503 });
      if (url.pathname.endsWith('/heartbeats'))
        return new Promise<Response>((_, reject) => {
          init!.signal!.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      return source(input, init);
    },
    now,
  );
  const cancelledOnFailure = aborted;
  await vi.runAllTimersAsync();
  expect(snapshot.freshness).toBe('stale');
  expect(cancelledOnFailure).toBe(true);
});

it('loads all forty protected cards within two seconds at 250ms upstream latency', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const ids = Array.from({ length: 40 }, (_, i) => String(i));
  let active = 0,
    peak = 0,
    requests = 0;
  let result: GroupSnapshot | undefined;
  const task = loadGroupSnapshot(
    config(true),
    'core',
    { KEY: 'secret' },
    async (input, init) => {
      expect(new Headers(init?.headers).get('X-API-Key')).toBe('secret');
      const url = new URL(String(input));
      requests++;
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 250));
      active--;
      if (url.pathname.includes('/status-pages/'))
        return Response.json({ data: ids.map((id) => ({ id })) });
      if (url.pathname.endsWith('/batch'))
        return Response.json({
          data: ids.map((id) => ({ id, name: `Service ${id}`, status: 1, interval: 60 })),
        });
      if (url.pathname.endsWith('/stats/points'))
        return Response.json({
          data: {
            points: [
              { timestamp: now.getTime() - 3600000, up: 60, down: 0, maintenance: 0, ping: 42 },
            ],
            uptime: 100,
          },
        });
      expect(url.searchParams.get('limit')).toBe('1');
      return Response.json({ data: [{ time: now.toISOString(), status: 1, ping: 42 }] });
    },
    now,
  ).then((response) => {
    result = response;
    return response;
  });
  await vi.advanceTimersByTimeAsync(2000);
  const finishedOnTime = Boolean(result);
  await vi.runAllTimersAsync();
  const body = await task;
  expect(body.freshness).toBe('fresh');
  expect(body.monitors).toHaveLength(40);
  expect(
    body.monitors.every(
      (m: { responseMs: number | null; uptime24h: { value: number | null } }) =>
        m.responseMs === 42 && m.uptime24h.value === 100,
    ),
  ).toBe(true);
  expect(peak).toBeLessThanOrEqual(16);
  expect(requests).toBe(83);
  expect(finishedOnTime).toBe(true);
});

it('promotes a shared cache hit so the next read needs no network request', async () => {
  const memory = memoryCache();
  let reads = 0;
  const shared = {
    match: async () => {
      reads++;
      return new Response('snapshot');
    },
    put: async () => {},
  };
  const cache = new LayeredResponseCache([memory, shared]);
  const key = new Request('https://site.test/cache');
  expect(await (await cache.match(key))?.text()).toBe('snapshot');
  expect(await (await cache.match(key))?.text()).toBe('snapshot');
  expect(reads).toBe(1);
});

it('stops dispatching more homepage work when the source is timing out', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const ids = Array.from({ length: 40 }, (_, i) => String(i));
  let checks = 0;
  let result: GroupSnapshot | undefined;
  const task = loadGroupSnapshot(
    config(true),
    'core',
    { KEY: 'secret' },
    async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.includes('/status-pages/'))
        return Response.json({ data: ids.map((id) => ({ id })) });
      if (url.pathname.endsWith('/batch'))
        return Response.json({ data: ids.map((id) => ({ id, name: `Service ${id}`, status: 1 })) });
      checks++;
      return new Promise<Response>((_, reject) => {
        init!.signal!.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    },
    now,
  ).then((response) => {
    result = response;
    return response;
  });
  await vi.advanceTimersByTimeAsync(5000);
  const finishedOnTime = Boolean(result);
  await vi.runAllTimersAsync();
  const body = await task;
  expect(body.freshness).toBe('stale');
  expect(body.monitors).toHaveLength(40);
  expect(body.subgroupErrors.every((error) => error.diagnostic?.reason === 'timeout')).toBe(true);
  expect(finishedOnTime).toBe(true);
  expect(checks).toBeLessThanOrEqual(16);
});
