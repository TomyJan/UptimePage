import { afterEach, expect, it, vi } from 'vitest';
import { createCloudApiHandler } from '../../../src/server/cloud-runtime.ts';
import { config } from '../../fixtures/server.ts';
import { protectedSource } from '../../fixtures/peekaping.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('reports cold stages and zero upstream/bridge requests on a fully warm request without exposing secrets', async () => {
  const logs: string[] = [];
  vi.spyOn(console, 'info').mockImplementation((entry) => logs.push(entry));
  const source = protectedSource();
  let bridgeCalls = 0;
  vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
    if (input.endsWith('/_uptimepage/cache')) {
      bridgeCalls++;
      return Response.json(null);
    }
    return source(input, init);
  });
  const handler = createCloudApiHandler(config(true));
  const context = {
    request: new Request('https://site.test/api/v1/groups/core'),
    env: { KEY: 'secret' },
  };
  const cold = await handler(context);
  expect(cold.status).toBe(200);
  expect(cold.headers.get('server-timing')).toMatch(/membership;dur=\d+/);
  expect(cold.headers.get('server-timing')).toMatch(/snapshot;dur=\d+/);
  expect(cold.headers.get('x-uptimepage-source-requests')).toBe('5');
  const before = bridgeCalls;
  const warm = await handler(context);
  expect(warm.status).toBe(200);
  expect(warm.headers.get('x-uptimepage-source-requests')).toBe('0');
  expect(bridgeCalls).toBe(before);
  expect(logs).toHaveLength(2);
  expect(JSON.parse(logs[1])).toMatchObject({ event: 'uptimepage.request', upstreamRequests: 0 });
  expect(logs.join('')).not.toMatch(/secret|source\.test|PRIVATE|TOKEN|apiKeyEnv/);
});
