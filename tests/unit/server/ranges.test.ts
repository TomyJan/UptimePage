import { expect, it, vi } from 'vitest';
import { handleApi } from '../../../src/server/api.ts';
import { now, epoch, raw, config, memoryCache } from '../../fixtures/server.ts';
import { protectedSource } from '../../fixtures/peekaping.ts';

it('queries and caches each UptimeRobot range independently, preserving old observations', async () => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const form = new URLSearchParams(init?.body as string);
    const days = Number(form.get('custom_uptime_ratios'));
    return Response.json({
      stat: 'ok',
      pagination: { total: 1 },
      monitors: [
        {
          ...raw,
          status: 2,
          logs: [],
          custom_uptime_ratio: String(100 - days / 10),
          response_times: [
            { datetime: epoch - (days - 0.5) * 86400, value: 42 },
            { datetime: epoch - 300, value: 50 },
          ],
        },
      ],
    });
  });
  const runtime = {
    config: config(),
    now,
    environment: { KEY: 'key' },
    cache: memoryCache(),
    fetcher,
  };
  for (const range of ['24h', '7d', '30d']) {
    const response = await handleApi(
      new Request(`https://site.test/api/v1/groups/core/monitors/1?range=${range}`),
      runtime,
    );
    expect(response.status).toBe(200);
    const detail = await response.json();
    const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;
    expect(detail.range).toBe(range);
    expect(detail.supportedRanges).toEqual(['24h', '7d', '30d']);
    expect(detail.response[0].at).toBe(
      new Date((epoch - (days - 0.5) * 86400) * 1000).toISOString(),
    );
    expect(detail.periodUptime).toMatchObject({
      value: 100 - days / 10,
      from: new Date(now.getTime() - days * 86400000).toISOString(),
    });
    const form = new URLSearchParams(fetcher.mock.calls.at(-1)![1]?.body as string);
    expect(form.get('response_times_start_date')).toBe(String(epoch - days * 86400));
  }
  const calls = fetcher.mock.calls.length;
  for (const range of ['24h', '7d', '30d']) {
    const d = await (
      await handleApi(
        new Request(`https://site.test/api/v1/groups/core/monitors/1?range=${range}&noise=1`),
        runtime,
      )
    ).json();
    expect(d.range).toBe(range);
  }
  expect(fetcher).toHaveBeenCalledTimes(calls);
});

it.each(['7d', '30d'])(
  'queries authenticated hourly Peekaping statistics for %s',
  async (range) => {
    const days = range === '7d' ? 7 : 30;
    const fallback = protectedSource();
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith('/stats/points')) return fallback(input, init);
      expect(new Headers(init?.headers).get('X-API-Key')).toBe('secret');
      expect(url.searchParams.get('granularity')).toBe('hour');
      expect(
        Date.parse(url.searchParams.get('until')!) - Date.parse(url.searchParams.get('since')!),
      ).toBe(days * 86400000);
      return Response.json({
        data: {
          points: [
            {
              timestamp: now.getTime() - days * 86400000,
              up: 1,
              down: 0,
              maintenance: 0,
              ping: 30,
            },
          ],
          uptime: 99,
          avgPing: 30,
        },
      });
    };
    const response = await handleApi(
      new Request(`https://site.test/api/v1/groups/core/monitors/public?range=${range}`),
      {
        config: config(true),
        now,
        environment: { KEY: 'secret' },
        fetcher,
      },
    );
    expect(response.status).toBe(200);
    const d = await response.json();
    expect(d.range).toBe(range);
    expect(d.monitor.history[0].until).toBe(
      new Date(now.getTime() - days * 86400000 + 3600000).toISOString(),
    );
    expect(d.averageResponse.value).toBe(30);
    expect(d.periodUptime.value).toBe(99);
  },
);

it('keeps regular provider aggregation connected despite a shorter configured check interval', async () => {
  const seconds = [7200, 5400, 3600, 1800, 300];
  const fetcher: typeof fetch = async () =>
    Response.json({
      stat: 'ok',
      pagination: { total: 1 },
      monitors: [
        {
          ...raw,
          status: 2,
          logs: [],
          response_times: seconds.map((s) => ({ datetime: epoch - s, value: 42 })),
        },
      ],
    });
  const d = await (
    await handleApi(new Request('https://site.test/api/v1/groups/core/monitors/1?range=7d'), {
      config: config(),
      now,
      environment: { KEY: 'key' },
      fetcher,
    })
  ).json();
  expect(d.response.filter((p: { valueMs: number | null }) => p.valueMs === null)).toHaveLength(0);
});

it('tolerates five-minute check jitter, breaks at a genuine gap and never connects through an outage', async () => {
  const fetcher: typeof fetch = async () =>
    Response.json({
      stat: 'ok',
      pagination: { total: 1 },
      monitors: [
        {
          ...raw,
          status: 2,
          response_times: [3600, 3305, 2990, 2700, 900, 600, 300].map((s) => ({
            datetime: epoch - s,
            value: 42,
          })),
          logs: [{ datetime: epoch - 550, duration: 100, type: 1 }],
        },
      ],
    });
  const d = await (
    await handleApi(new Request('https://site.test/api/v1/groups/core/monitors/1'), {
      config: config(),
      now,
      environment: { KEY: 'key' },
      fetcher,
    })
  ).json();
  expect(d.response.slice(0, 4).every((p: { valueMs: number | null }) => p.valueMs === 42)).toBe(
    true,
  );
  expect(
    d.response.some(
      (p: { at: string; valueMs: number | null }) =>
        p.valueMs === null &&
        Date.parse(p.at) > (epoch - 2700) * 1000 &&
        Date.parse(p.at) < (epoch - 900) * 1000,
    ),
  ).toBe(true);
  expect(
    d.response.some(
      (p: { at: string; valueMs: number | null }) =>
        p.valueMs === null && p.at === new Date((epoch - 550) * 1000).toISOString(),
    ),
  ).toBe(true);
});

it.each([false, true])(
  'keeps latest raw response independent of 30d averages (24h cached: %s)',
  async (cached) => {
    let latestCalls = 0;
    const fetcher: typeof fetch = async (_url, init) => {
      const form = new URLSearchParams(init?.body as string);
      const latest = form.get('response_times_limit') === '1';
      if (latest) {
        latestCalls++;
        expect(form.get('logs')).toBe('0');
      }
      const aggregate = form.has('response_times_average');
      return Response.json({
        stat: 'ok',
        pagination: { total: 1 },
        monitors: [
          {
            ...raw,
            status: 2,
            logs: [],
            response_times: [
              { datetime: epoch - (aggregate ? 3600 : 37), value: aggregate ? 999 : 42 },
            ],
          },
        ],
      });
    };
    const runtime = {
      config: config(),
      now,
      environment: { KEY: 'key' },
      cache: memoryCache(),
      fetcher,
    };
    if (cached)
      await handleApi(new Request('https://site.test/api/v1/groups/core/monitors/1'), runtime);
    const response = await handleApi(
      new Request('https://site.test/api/v1/groups/core/monitors/1?range=30d'),
      runtime,
    );
    expect(response.status).toBe(200);
    const d = await response.json();
    expect(d.monitor.responseMs).toBe(42);
    expect(d.monitor.observedAt).toBe(new Date((epoch - 37) * 1000).toISOString());
    expect(d.averageResponse.value).toBe(999);
    expect(latestCalls).toBe(cached ? 0 : 1);
  },
);
it('does not infer aggregation from surviving hourly points in a five-minute raw series', async () => {
  const fetcher: typeof fetch = async () =>
    Response.json({
      stat: 'ok',
      pagination: { total: 1 },
      monitors: [
        {
          ...raw,
          status: 2,
          logs: [],
          response_times: [14400, 10800, 7200, 3600].map((s) => ({
            datetime: epoch - s,
            value: 42,
          })),
        },
      ],
    });
  const d = await (
    await handleApi(new Request('https://site.test/api/v1/groups/core/monitors/1'), {
      config: config(),
      now,
      environment: { KEY: 'key' },
      fetcher,
    })
  ).json();
  const gaps = d.response.filter((p: { valueMs: number | null }) => p.valueMs === null);
  expect(gaps).toHaveLength(3);
  expect(gaps.every((p: { gap?: string }) => p.gap === undefined)).toBe(true);
});

it('marks missing hourly Peekaping buckets instead of drawing a solid line through them', async () => {
  const fallback = protectedSource();
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith('/stats/points')) return fallback(input, init);
    return Response.json({
      data: {
        points: [5, 4, 2, 1].map((h) => ({
          timestamp: now.getTime() - h * 3600000,
          up: 1,
          down: 0,
          maintenance: 0,
          ping: 42,
        })),
        uptime: 100,
        avgPing: 42,
      },
    });
  };
  const d = await (
    await handleApi(new Request('https://site.test/api/v1/groups/core/monitors/public?range=7d'), {
      config: config(true),
      now,
      environment: { KEY: 'secret' },
      fetcher,
    })
  ).json();
  expect(d.response.filter((p: { gap?: string }) => p.gap === 'short-missing')).toHaveLength(1);
});
