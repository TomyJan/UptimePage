import { expect, it } from 'vitest';
import { handleApi } from '../../../src/server/api.ts';
import { config, now, raw, memoryCache } from '../../fixtures/server.ts';
import { protectedSource } from '../../fixtures/peekaping.ts';

it('cancels the optional TLS request when the main detail cannot be loaded', async () => {
  const source = protectedSource();
  let aborted = false;
  let release: (() => void) | undefined;
  const response = await handleApi(
    new Request('https://site.test/api/v1/groups/core/monitors/public'),
    {
      config: config(true),
      now,
      environment: { KEY: 'secret' },
      fetcher: async (input, init) => {
        if (String(input).includes('/stats/points')) return new Response('', { status: 503 });
        if (String(input).endsWith('/tls'))
          return new Promise<Response>((resolve, reject) => {
            release = () => resolve(Response.json({ data: null }));
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
    },
  );
  release?.();
  expect(response.status).toBe(502);
  expect(aborted).toBe(true);
});

it('requests Peekaping certificates only for public details and exposes no certificate metadata', async () => {
  const source = protectedSource();
  let tlsCalls = 0;
  const runtime = {
    config: config(true),
    now,
    cache: memoryCache(),
    environment: { KEY: 'secret' },
    fetcher: async (input: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(input)).pathname.endsWith('/tls')) {
        tlsCalls++;
        expect(new Headers(init?.headers).get('X-API-Key')).toBe('secret');
        return Response.json({
          data: { certInfo: { validTo: '2026-12-01T00:00:00Z', subject: 'PRIVATE_DOMAIN' } },
        });
      }
      return source(input, init);
    },
  };
  expect(
    (await handleApi(new Request('https://site.test/api/v1/groups/core'), runtime)).status,
  ).toBe(200);
  expect(tlsCalls).toBe(0);
  const request = new Request('https://site.test/api/v1/groups/core/monitors/public');
  const response = await handleApi(request, runtime);
  const text = await response.text();
  expect(JSON.parse(text)).toMatchObject({
    certificateExpiresAt: '2026-12-01T00:00:00.000Z',
    capabilities: { certificate: 'available' },
  });
  expect(text).not.toMatch(/PRIVATE_DOMAIN|certInfo|cacheMembership/);
  expect(tlsCalls).toBe(1);
  expect((await handleApi(request, runtime)).status).toBe(200);
  expect(tlsCalls).toBe(1);
  expect(
    (await handleApi(new Request('https://site.test/api/v1/groups/core/monitors/private'), runtime))
      .status,
  ).toBe(404);
  expect(tlsCalls).toBe(1);
});

it.each([404, 503])(
  'keeps Peekaping detail usable when optional TLS returns %s',
  async (status) => {
    const source = protectedSource();
    const response = await handleApi(
      new Request('https://site.test/api/v1/groups/core/monitors/public'),
      {
        config: config(true),
        now,
        environment: { KEY: 'secret' },
        fetcher: async (input, init) =>
          String(input).endsWith('/tls') ? new Response('', { status }) : source(input, init),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      certificateExpiresAt: null,
      capabilities: { certificate: status === 404 ? 'unsupported' : 'unavailable' },
      monitor: { state: 'operational' },
    });
  },
);

it.each(['24h', '30d'])(
  'requests UptimeRobot SSL once in the main %s detail, never on the homepage',
  async (range) => {
    const forms: URLSearchParams[] = [];
    const runtime = {
      config: config(),
      now,
      cache: memoryCache(),
      environment: { KEY: 'secret' },
      fetcher: async (_input: RequestInfo | URL, init?: RequestInit) => {
        const form = new URLSearchParams(String(init?.body));
        forms.push(form);
        return Response.json({
          stat: 'ok',
          pagination: { total: 1 },
          monitors: [
            {
              ...raw,
              type: 1,
              status: 2,
              logs: [],
              ...(form.get('ssl') === '1'
                ? { ssl: { expires: 1796083200, issuer: 'PRIVATE' } }
                : {}),
            },
          ],
        });
      },
    };
    await handleApi(new Request('https://site.test/api/v1/groups/core'), runtime);
    expect(forms.some((f) => f.has('ssl'))).toBe(false);
    const response = await handleApi(
      new Request(`https://site.test/api/v1/groups/core/monitors/1?range=${range}`),
      runtime,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      certificateExpiresAt: '2026-12-01T00:00:00.000Z',
      capabilities: { certificate: 'available' },
    });
    expect(forms.filter((f) => f.get('ssl') === '1')).toHaveLength(1);
  },
);
