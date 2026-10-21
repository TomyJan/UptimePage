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

it('preserves protected-data rate-limit retry deadlines and does not reuse status-page history', async () => {
  const { protectedSource } = await import('../../fixtures/peekaping.ts');
  const source = protectedSource();
  const response = await handleApi(
    new Request('https://site.test/api/v1/groups/core/monitors/public'),
    {
      config: config(true),
      environment: { KEY: 'secret' },
      now,
      fetcher: async (url, init) =>
        String(url).includes('/stats/points')
          ? new Response('', {
              status: 429,
              headers: { 'retry-after': 'Wed, 21 Oct 2026 12:10:00 GMT' },
            })
          : source(url, init),
    },
  );
  expect(response.status).toBe(429);
  const body = await response.json();
  expect(body.error.retryAt).toBe('2026-10-21T12:10:00.000Z');
  expect(body.monitor).toBeUndefined();
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

it('reuses protected Peekaping detail data only within its status TTL', async () => {
  const { protectedSource } = await import('../../fixtures/peekaping.ts');
  const { memoryCache } = await import('../../fixtures/server.ts');
  const calls: string[] = [];
  const runtime = {
    config: config(true),
    environment: { KEY: 'secret' },
    now,
    cache: memoryCache(),
    fetcher: protectedSource(calls),
  };
  const req = new Request('https://site.test/api/v1/groups/core/monitors/public');
  expect((await handleApi(req, runtime)).status).toBe(200);
  const count = calls.length;
  expect((await handleApi(req, runtime)).status).toBe(200);
  expect(calls).toHaveLength(count);
  expect((await handleApi(req, { ...runtime, now: new Date(now.getTime() + 31000) })).status).toBe(
    200,
  );
  expect(calls.filter((p) => p.includes('/status-pages/'))).toHaveLength(2);
  expect(calls.filter((p) => p.includes('/stats/points'))).toHaveLength(2);
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
