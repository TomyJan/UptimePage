import { expect, it } from 'vitest';
import { handleApi } from '../../../src/server/api.ts';
import { config, fetcher, memoryCache, now } from '../../fixtures/server.ts';

it.each(['group', 'detail', 'mixed'])(
  'coalesces simultaneous %s requests through a cold cache',
  async (kind) => {
    let calls = 0;
    const inFlight = new Map<string, Promise<unknown>>();
    const runtime = {
      config: config(),
      environment: { KEY: 'key' },
      now,
      cache: memoryCache(),
      inFlight,
      fetcher: async (...args: Parameters<typeof fetch>) => {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return fetcher(...args);
      },
    };
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        handleApi(
          new Request(
            'https://site.test/api/v1/groups/core' +
              (kind === 'detail' || (kind === 'mixed' && i % 2) ? '/monitors/1' : ''),
          ),
          runtime,
        ),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(calls).toBe(kind === 'group' ? 1 : 2);
    const payloads = await Promise.all(responses.map((response) => response.json()));
    expect(
      payloads.every((payload) => payload.configVersion === runtime.config.configVersion),
    ).toBe(true);
    expect(inFlight.size).toBe(0);
  },
);

it('releases failed and successful loads without retaining them as a second cache', async () => {
  let fail = true;
  let calls = 0;
  const inFlight = new Map<string, Promise<unknown>>();
  const runtime = {
    config: config(),
    environment: { KEY: 'key' },
    now,
    inFlight,
    fetcher: async (...args: Parameters<typeof fetch>) => {
      calls++;
      return fail ? new Response('', { status: 503 }) : fetcher(...args);
    },
  };
  const request = new Request('https://site.test/api/v1/groups/core');
  expect((await handleApi(request, runtime)).status).toBe(502);
  expect(inFlight.size).toBe(0);
  fail = false;
  expect((await handleApi(request, runtime)).status).toBe(200);
  expect((await handleApi(request, runtime)).status).toBe(200);
  expect(calls).toBe(3);
  expect(inFlight.size).toBe(0);
});

it('does not coalesce different credentials or configuration versions', async () => {
  let calls = 0;
  const inFlight = new Map<string, Promise<unknown>>();
  const runtime = {
    config: config(),
    environment: { KEY: 'key-a' },
    now,
    inFlight,
    fetcher: async (...args: Parameters<typeof fetch>) => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return fetcher(...args);
    },
  };
  const request = new Request('https://site.test/api/v1/groups/core');
  const responses = await Promise.all([
    handleApi(request, runtime),
    handleApi(request, { ...runtime, environment: { KEY: 'key-b' } }),
    handleApi(request, { ...runtime, config: { ...runtime.config, configVersion: 'other' } }),
  ]);
  expect(responses.every((response) => response.status === 200)).toBe(true);
  expect(calls).toBe(3);
  expect(inFlight.size).toBe(0);
});
