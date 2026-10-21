import { expect, it } from 'vitest';
import { config, now } from '../../fixtures/server.ts';
import { loadGroupSnapshot } from '../../../src/server/snapshot.ts';
import { handleApi } from '../../../src/server/api.ts';

it('exposes safe upstream status and configuration diagnostics without exposing secrets or bodies', async () => {
  const req = new Request('https://site.test/api/v1/groups/core');
  const failed = await handleApi(req, {
    config: config(),
    environment: { KEY: 'secret' },
    now,
    fetcher: async () => new Response('secret internal address', { status: 403 }),
  });
  const body = await failed.text();
  expect(JSON.parse(body).error.diagnostic).toMatchObject({ reason: 'upstream-http', status: 403 });
  expect(body).not.toContain('secret');
  const missing = await handleApi(req, { config: config(), environment: {}, now });
  expect((await missing.json()).error.diagnostic.reason).toBe('configuration');
});

it('reads only the public Peekaping monitor interval and never exposes protected fields', async () => {
  const calls: string[] = [];
  const runtime = {
    config: config(true),
    environment: { KEY: 'secret' },
    now,
    fetcher: async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return String(url).includes('/status-pages/')
        ? Response.json({
            data: [
              {
                id: 'public',
                name: 'Public',
                active: true,
                heartbeats: [{ status: 1, ping: 42, time: '2026-10-21T11:59:00Z' }],
              },
            ],
          })
        : Response.json({
            data: {
              id: 'public',
              interval: 60,
              config: 'private-target',
              push_token: 'private-token',
            },
          });
    },
  };
  const response = await handleApi(
    new Request('https://site.test/api/v1/groups/core/monitors/public'),
    runtime,
  );
  const body = await response.text();
  expect(JSON.parse(body).intervalSeconds).toBe(60);
  expect(body).not.toContain('private-target');
  expect(body).not.toContain('private-token');
  expect(calls.at(-1)).toBe('https://source.test/api/v1/monitors/public');
  calls.length = 0;
  expect(
    (await handleApi(new Request('https://site.test/api/v1/groups/core/monitors/private'), runtime))
      .status,
  ).toBe(404);
  expect(calls.every((url) => url.includes('/status-pages/'))).toBe(true);
});

it('preserves metadata rate-limit retry deadlines without hiding public history', async () => {
  const response = await handleApi(
    new Request('https://site.test/api/v1/groups/core/monitors/public'),
    {
      config: config(true),
      environment: { KEY: 'secret' },
      now,
      fetcher: async (url) =>
        String(url).includes('/status-pages/')
          ? Response.json({
              data: [
                {
                  id: 'public',
                  name: 'Public',
                  active: true,
                  interval: null,
                  heartbeats: [{ status: 1, ping: 42, time: '2026-10-21T11:59:00Z' }],
                },
              ],
            })
          : new Response('', {
              status: 429,
              headers: { 'retry-after': 'Wed, 21 Oct 2026 12:10:00 GMT' },
            }),
    },
  );
  const detail = await response.json();
  expect(detail.retryAt).toBe('2026-10-21T12:10:00.000Z');
  expect(detail.diagnostic).toMatchObject({ status: 429, stage: 'detail' });
  expect(detail.monitor.history).toHaveLength(1);
});

it('uses the real Peekaping cadence to preserve missed-check gaps', async () => {
  const response = await handleApi(
    new Request('https://site.test/api/v1/groups/core/monitors/public'),
    {
      config: config(true),
      environment: { KEY: 'secret' },
      now,
      fetcher: async (url) =>
        String(url).includes('/status-pages/')
          ? Response.json({
              data: [
                {
                  id: 'public',
                  name: 'Public',
                  active: true,
                  heartbeats: ['11:50', '11:53', '11:56'].map((time) => ({
                    status: 1,
                    ping: 42,
                    time: `2026-10-21T${time}:00Z`,
                  })),
                },
              ],
            })
          : Response.json({ data: { id: 'public', interval: 60 } }),
    },
  );
  const detail = await response.json();
  expect(detail.intervalSeconds).toBe(60);
  expect(
    detail.response.filter((p: { valueMs: number | null }) => p.valueMs === null),
  ).toHaveLength(2);
});

it('does not mistake an application rejection for a malformed response or return the upstream error text', async () => {
  const response = await handleApi(new Request('https://site.test/api/v1/groups/core'), {
    config: config(),
    environment: { KEY: 'secret' },
    now,
    fetcher: async () => Response.json({ stat: 'fail', error: 'private secret internal detail' }),
  });
  const text = await response.text();
  expect(JSON.parse(text).error.diagnostic.reason).toBe('upstream-rejected');
  expect(text).not.toContain('private secret');
});

it('classifies an aborted JSON body read as a timeout', async () => {
  const { requestJson } = await import('../../../src/server/sources/http.ts');
  const fetcher: typeof fetch = async (_url, init) => {
    const response = new Response('{}');
    response.json = () =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('private abort context')), {
          once: true,
        }),
      );
    return response;
  };
  await expect(requestJson(fetcher, 'https://source.test', {}, 5)).rejects.toMatchObject({
    diagnostic: { reason: 'timeout', stage: 'source' },
  });
});

it('reuses safe Peekaping detail metadata only while public membership remains confirmed', async () => {
  const { memoryCache } = await import('../../fixtures/server.ts');
  const calls: string[] = [];
  let visible = true;
  const runtime = {
    config: config(true),
    environment: { KEY: 'secret' },
    now,
    cache: memoryCache(),
    fetcher: async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return String(url).includes('/status-pages/')
        ? Response.json({
            data: visible ? [{ id: 'public', name: 'Public', active: true, heartbeats: [] }] : [],
          })
        : Response.json({ data: { id: 'public', interval: 60, config: 'private-target' } });
    },
  };
  const req = new Request('https://site.test/api/v1/groups/core/monitors/public');
  expect((await handleApi(req, runtime)).status).toBe(200);
  expect(calls).toHaveLength(3);
  const cached = await handleApi(req, runtime);
  expect((await cached.json()).intervalSeconds).toBe(60);
  expect(calls).toHaveLength(3);
  visible = false;
  expect((await handleApi(req, { ...runtime, now: new Date(now.getTime() + 31000) })).status).toBe(
    404,
  );
  expect(calls).toHaveLength(5);
});

it('catches unexpected runtime setup failures without returning exception text', async () => {
  const c = config();
  Object.defineProperty(c, 'groups', {
    get() {
      throw new Error('private runtime configuration');
    },
  });
  const response = await handleApi(new Request('https://site.test/api/v1/groups/core'), {
    config: c,
    environment: {},
    now,
  });
  expect(response.status).toBe(502);
  const text = await response.text();
  expect(JSON.parse(text).error.diagnostic).toEqual({ reason: 'internal', stage: 'runtime' });
  expect(text).not.toContain('private runtime configuration');
});
