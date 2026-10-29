import { expect, it } from 'vitest';
import { handleApi } from '../../../src/server/api.ts';
import { config, now } from '../../fixtures/server.ts';
import { protectedSource } from '../../fixtures/peekaping.ts';

it('uses the real clock by default for a heartbeat generated during an API request', async () => {
  const source = protectedSource();
  let heartbeatAt = '';
  const response = await handleApi(new Request('https://site.test/api/v1/groups/core'), {
    config: config(true),
    environment: { KEY: 'secret' },
    fetcher: async (input, init) => {
      if (new URL(String(input)).pathname.endsWith('/heartbeats')) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        heartbeatAt = new Date().toISOString();
        return Response.json({ data: [{ status: 1, time: heartbeatAt, ping: 42 }] });
      }
      return source(input, init);
    },
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(Date.parse(heartbeatAt)).toBeGreaterThan(Date.parse(body.fetchedAt));
  expect(body.monitors[0]).toMatchObject({
    state: 'operational',
    observedAt: heartbeatAt,
    responseMs: 42,
  });
});

for (const page of ['home', 'detail']) {
  it.each([
    { name: 'operational heartbeat', status: 1, active: true, offset: 20, state: 'operational' },
    { name: 'new outage', status: 0, active: true, offset: 20, state: 'down' },
    { name: 'outage at read completion', status: 0, active: true, offset: 40, state: 'down' },
    { name: 'paused monitor', status: 0, active: false, offset: 20, state: 'paused' },
    { name: 'truly future heartbeat', status: 0, active: true, offset: 60000, state: 'unknown' },
  ])(
    `validates live ${page} observations against read completion: $name`,
    async ({ status, active, offset, state }) => {
      const started = now.getTime();
      let currentTime = started;
      const observedAt = new Date(started + offset).toISOString();
      const source = protectedSource();
      const windows: string[] = [];
      const response = await handleApi(
        new Request(
          `https://site.test/api/v1/groups/core${page === 'detail' ? '/monitors/public' : ''}`,
        ),
        {
          config: config(true),
          now,
          clock: () => currentTime,
          environment: { KEY: 'secret' },
          fetcher: async (input, init) => {
            const url = new URL(String(input));
            if (url.pathname.endsWith('/batch'))
              return Response.json({
                data: [{ id: 'public', name: 'API', active, status: 1, interval: 60 }],
              });
            if (url.pathname.endsWith('/stats/points'))
              windows.push(url.searchParams.get('until')!);
            if (url.pathname.endsWith('/heartbeats')) {
              // Upstream generates a heartbeat while this request is in progress.
              await Promise.resolve();
              currentTime = started + 40;
              if (url.searchParams.get('important') === 'true')
                return Response.json({
                  data:
                    status === 1
                      ? [
                          { id: 'outage', status: 0, time: new Date(started - 1000).toISOString() },
                          { id: 'recovered', status: 1, time: observedAt },
                        ]
                      : [{ id: 'outage', status: 0, time: observedAt }],
                });
              return Response.json({ data: [{ status, time: observedAt, ping: 42 }] });
            }
            return source(input, init);
          },
        },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      const monitor = page === 'detail' ? body.monitor : body.monitors[0];
      expect(monitor).toMatchObject({
        state,
        observedAt: state === 'unknown' ? null : observedAt,
        responseMs: state === 'operational' ? 42 : null,
      });
      expect(body.fetchedAt).toBe(now.toISOString());
      expect(windows).toEqual([now.toISOString()]);
      if (page === 'detail') {
        expect(body.periodUptime.until).toBe(now.toISOString());
        expect(body.events).toEqual(
          state === 'down'
            ? [{ id: 'outage', from: observedAt, until: null, state: 'down' }]
            : state === 'operational'
              ? [
                  {
                    id: 'outage',
                    from: new Date(started - 1000).toISOString(),
                    until: observedAt,
                    state: 'down',
                  },
                ]
              : [],
        );
      }
    },
  );
}
