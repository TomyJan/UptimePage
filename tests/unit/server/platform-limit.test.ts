import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../.generated/server-config.ts', async () => {
  const { config } = await import('../../fixtures/server.ts');
  return { default: config(true) };
});
import { createCloudApiHandler } from '../../../src/server/cloud-runtime.ts';
import cacheRequest from '../../../edge-functions/_uptimepage/cache.ts';
import serverConfig from '../../../.generated/server-config.ts';

afterEach(() => vi.unstubAllGlobals());

it.each([50, 200])(
  'returns all %s cards through Cloud Functions without consuming edge fetches',
  async (count) => {
    const onRequest = createCloudApiHandler(serverConfig);
    const monitors = Array.from({ length: count }, (_, i) => ({
      id: String(i),
      name: 'Public',
      status: 1,
      interval: 60,
    }));
    let fetches = 0;
    vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
      if (input.endsWith('/_uptimepage/cache')) {
        // Every bridge request is a separate edge invocation; it never fetches a source.
        return cacheRequest({ request: new Request(input, init), env: { KEY: 'secret' } });
      }
      fetches++;
      if (input.includes('/status-pages/')) return Response.json({ data: monitors });
      if (input.includes('/batch?')) {
        const ids = new URL(input).searchParams.get('ids')!.split(',');
        return Response.json({ data: monitors.filter((m) => ids.includes(m.id)) });
      }
      if (input.includes('/stats/points'))
        return Response.json({ data: { points: [], uptime: 100 } });
      return Response.json({ data: [] });
    });
    const response = await onRequest({
      request: new Request('https://preview.test/api/v1/groups/core'),
      env: { KEY: 'secret' },
    });
    const body = await response.json();
    expect(body.monitors).toHaveLength(count);
    expect(fetches).toBeGreaterThan(64);
    expect(body.freshness).toBe('fresh');
  },
);
