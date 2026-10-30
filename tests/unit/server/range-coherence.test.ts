import { expect, it } from 'vitest';
import { handleApi } from '../../../src/server/api.ts';
import { config, epoch, memoryCache, now, raw } from '../../fixtures/server.ts';

const request = (range: string) =>
  new Request(`https://site.test/api/v1/groups/core/monitors/1?range=${range}`);
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const historicalOutage = { type: 1, datetime: epoch - 2 * 86400 - 600, duration: 60 };
function record(status: number, aggregate: boolean, observed = epoch - 30) {
  return {
    ...raw,
    status,
    ssl: { expires: epoch + (status === 9 ? 86400 : 172800) },
    custom_uptime_ratio: '97.5',
    logs: [
      historicalOutage,
      { type: 1, datetime: epoch - 120, duration: status === 9 ? 0 : 60 },
      ...(status === 9 ? [] : [{ type: 2, datetime: epoch - 60, duration: 0 }]),
    ],
    response_times: aggregate
      ? [
          { datetime: epoch - 2 * 86400, value: 888 },
          { datetime: epoch - 3600, value: 999 },
        ]
      : [{ datetime: observed, value: status === 9 ? 0 : 42 }],
  };
}

for (const range of ['7d', '30d']) {
  for (const cached24h of [false, true]) {
    it.each([2, 9])(
      `${range} keeps a transition from status %s coherent (cached 24h: ${cached24h})`,
      async (previous) => {
        const current = previous === 2 ? 9 : 2;
        let phase: 'warm' | 'transition' = 'warm';
        let historyRequests = 0;
        let latestRequests = 0;
        let activeHistoryStatus = previous;
        const fetcher: typeof fetch = async (_url, init) => {
          const form = new URLSearchParams(init?.body as string);
          const aggregate = form.has('response_times_average');
          const latest = form.get('response_times_limit') === '1';
          if (aggregate && form.get('ssl') === '1') {
            historyRequests++;
            activeHistoryStatus = cached24h || historyRequests > 1 ? current : previous;
          }
          if (latest) latestRequests++;
          const status = phase === 'warm' ? previous : aggregate ? activeHistoryStatus : current;
          return Response.json({
            stat: 'ok',
            pagination: { total: 1 },
            monitors: [record(status, aggregate)],
          });
        };
        const runtime = {
          config: config(),
          now,
          environment: { KEY: 'key' },
          cache: memoryCache(),
          fetcher,
        };
        if (cached24h) await handleApi(request('24h'), runtime);
        phase = 'transition';
        const response = await handleApi(request(range), runtime);
        expect(response.status).toBe(200);
        const detail = await response.json();
        expect(detail.monitor).toMatchObject({
          state: current === 9 ? 'down' : 'operational',
          observedAt: iso(epoch - 30),
          responseMs: current === 9 ? null : 42,
          freshness: 'fresh',
        });
        expect(detail.events).toEqual([
          {
            id: `1-${iso(historicalOutage.datetime)}`,
            from: iso(historicalOutage.datetime),
            until: iso(historicalOutage.datetime + 60),
            state: 'down',
          },
          {
            id: `1-${iso(epoch - 120)}`,
            from: iso(epoch - 120),
            until: current === 9 ? null : iso(epoch - 60),
            state: 'down',
          },
        ]);
        expect(detail.averageResponse.value).toBe(943.5);
        expect(detail.periodUptime.value).toBe(97.5);
        expect(detail.response).toContainEqual({ at: iso(epoch - 2 * 86400), valueMs: 888 });
        expect(detail.certificateExpiresAt).toBe(iso(epoch + (current === 9 ? 86400 : 172800)));
        expect(detail.capabilities.events).toBe('available');
        expect(historyRequests).toBe(cached24h ? 1 : 2);
        expect(latestRequests).toBe(1);
        const requests = { historyRequests, latestRequests };
        const again = await handleApi(request(range), {
          ...runtime,
          now: new Date(now.getTime() + 20_000),
        });
        expect(await again.json()).toEqual(detail);
        expect({ historyRequests, latestRequests }).toEqual(requests);
      },
    );
  }
}

for (const range of ['7d', '30d']) {
  for (const cached24h of [false, true]) {
    it.each([2, 9])(
      `${range} avoids a history retry for unchanged status %s (cached 24h: ${cached24h})`,
      async (status) => {
        let historyRequests = 0;
        let latestRequests = 0;
        const fetcher: typeof fetch = async (_url, init) => {
          const form = new URLSearchParams(init?.body as string);
          if (form.has('response_times_average') && form.get('ssl') === '1') historyRequests++;
          if (form.get('response_times_limit') === '1') latestRequests++;
          return Response.json({
            stat: 'ok',
            pagination: { total: 1 },
            monitors: [record(status, form.has('response_times_average'))],
          });
        };
        const runtime = {
          config: config(),
          now,
          environment: { KEY: 'key' },
          cache: memoryCache(),
          fetcher,
        };
        if (cached24h) await handleApi(request('24h'), runtime);
        const response = await handleApi(request(range), runtime);
        expect(response.status).toBe(200);
        const detail = await response.json();
        expect(detail.monitor).toMatchObject({
          state: status === 9 ? 'down' : 'operational',
          observedAt: iso(epoch - 30),
          responseMs: status === 9 ? null : 42,
        });
        expect(detail.events.at(-1).until).toBe(status === 9 ? null : iso(epoch - 60));
        expect(historyRequests).toBe(1);
        expect(latestRequests).toBe(cached24h ? 0 : 1);
      },
    );
  }
}

it.each(['stale', 'unavailable'] as const)(
  'ignores a recent 24h cache marked %s',
  async (freshness) => {
    const storage = memoryCache();
    let latestRequests = 0;
    const fetcher: typeof fetch = async (_url, init) => {
      const form = new URLSearchParams(init?.body as string);
      const latest = form.get('response_times_limit') === '1';
      if (latest) latestRequests++;
      return Response.json({
        stat: 'ok',
        pagination: { total: 1 },
        monitors: [record(2, form.has('response_times_average'), latest ? epoch : epoch - 30)],
      });
    };
    const runtime = { config: config(), now, environment: { KEY: 'key' }, cache: storage, fetcher };
    await handleApi(request('24h'), runtime);
    const cache = {
      put: storage.put,
      async match(input: RequestInfo | URL) {
        const response = await storage.match(input);
        if (!response || !new Request(input).url.endsWith('/ranges/24h')) return response;
        const value = await response.json();
        value.monitor.freshness = freshness;
        return Response.json(value);
      },
    };
    const response = await handleApi(request('7d'), { ...runtime, cache });
    expect(response.status).toBe(200);
    expect((await response.json()).monitor.observedAt).toBe(iso(epoch));
    expect(latestRequests).toBe(1);
  },
);

it.each(['7d', '30d'])(
  'does not reuse a cached down check from an earlier incident for %s',
  async (range) => {
    let phase: 'warm' | 'new-incident' = 'warm';
    let latestRequests = 0;
    const fetcher: typeof fetch = async (_url, init) => {
      const form = new URLSearchParams(init?.body as string);
      if (form.get('response_times_limit') === '1') latestRequests++;
      const monitor = record(
        9,
        form.has('response_times_average'),
        phase === 'warm' ? epoch - 30 : epoch + 10,
      );
      if (phase === 'new-incident')
        monitor.logs = [
          historicalOutage,
          { type: 1, datetime: epoch - 120, duration: 60 },
          { type: 2, datetime: epoch - 60, duration: 0 },
          { type: 1, datetime: epoch + 5, duration: 0 },
        ];
      return Response.json({ stat: 'ok', pagination: { total: 1 }, monitors: [monitor] });
    };
    const runtime = {
      config: config(),
      now,
      environment: { KEY: 'key' },
      cache: memoryCache(),
      fetcher,
    };
    await handleApi(request('24h'), runtime);
    phase = 'new-incident';
    const response = await handleApi(request(range), {
      ...runtime,
      now: new Date(now.getTime() + 20_000),
    });
    expect(response.status).toBe(200);
    const detail = await response.json();
    expect(detail.monitor).toMatchObject({
      state: 'down',
      observedAt: iso(epoch + 10),
      responseMs: null,
    });
    expect(detail.events.at(-1)).toMatchObject({ from: iso(epoch + 5), until: null });
    expect(latestRequests).toBe(1);
  },
);

for (const range of ['7d', '30d']) {
  for (const cached of [false, true]) {
    it.each(['latest', 'history', 'unstable'])(
      `${range} preserves source failure handling at %s (old detail: ${cached})`,
      async (failure) => {
        let phase: 'warm' | 'failure' = 'warm';
        let historyRequests = 0;
        const fetcher: typeof fetch = async (_url, init) => {
          const form = new URLSearchParams(init?.body as string);
          const aggregate = form.has('response_times_average');
          const latest = form.get('response_times_limit') === '1';
          if (phase === 'failure' && aggregate && form.get('ssl') === '1') historyRequests++;
          if (
            phase === 'failure' &&
            ((failure === 'latest' && latest) || (failure === 'history' && historyRequests > 1))
          )
            return new Response('source down', { status: 503 });
          return Response.json({
            stat: 'ok',
            pagination: { total: 1 },
            monitors: [record(phase === 'failure' && latest ? 9 : 2, aggregate)],
          });
        };
        const runtime = {
          config: config(),
          now,
          environment: { KEY: 'key' },
          cache: memoryCache(),
          fetcher,
        };
        const old = cached ? await (await handleApi(request(range), runtime)).json() : null;
        phase = 'failure';
        const response = await handleApi(request(range), {
          ...runtime,
          now: new Date(now.getTime() + 31_000),
        });
        const result = await response.json();
        if (cached) {
          expect(response.status).toBe(200);
          expect(result.monitor).toEqual({ ...old.monitor, freshness: 'stale' });
          expect(result.events).toEqual(old.events);
          expect(result.diagnostic).toBeDefined();
        } else {
          expect(response.status).toBe(502);
          expect(result.error.code).toBe('unavailable');
        }
        expect(historyRequests).toBe(failure === 'latest' ? 1 : 2);
      },
    );
  }
}
