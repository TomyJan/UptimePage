import { expect } from 'vitest';
import { now } from './server.ts';
export function protectedSource(
  calls: string[] = [],
  membership: () => boolean = () => true,
): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    expect(new Headers(init?.headers).get('X-API-Key')).toBe('secret');
    if (url.pathname.includes('/status-pages/'))
      return Response.json({
        data: membership()
          ? [
              {
                id: 'public',
                name: 'WRONG PUBLIC NAME',
                interval: 999,
                heartbeats: [{ status: 0, time: now.toISOString() }],
                uptime_24h: 0,
              },
            ]
          : [],
      });
    if (url.pathname.endsWith('/batch')) {
      expect(url.searchParams.get('ids')).toBe('public');
      return Response.json({
        data: [
          {
            id: 'public',
            name: 'Protected API',
            active: true,
            status: 1,
            interval: 60,
            config: 'PRIVATE',
            push_token: 'TOKEN',
          },
          { id: 'private', name: 'Forbidden', status: 0 },
        ],
      });
    }
    if (url.searchParams.get('important') === 'true') return Response.json({ data: [] });
    if (url.pathname.endsWith('/heartbeats')) {
      expect(url.searchParams.get('limit')).toBe('1');
      return Response.json({
        data: [
          {
            status: 1,
            ping: 42,
            time: '2026-10-19T11:59:30Z',
            end_time: '2026-10-21T11:59:30Z',
            msg: 'PRIVATE',
          },
        ],
      });
    }
    if (url.pathname.endsWith('/stats/points')) {
      expect(['minute', 'hour']).toContain(url.searchParams.get('granularity'));
      expect(
        Date.parse(url.searchParams.get('until')!) - Date.parse(url.searchParams.get('since')!),
      ).toBe(86400000);
      return Response.json({
        data: {
          points: [
            { timestamp: now.getTime() - 23 * 3600000, up: 1, down: 0, maintenance: 0, ping: 30 },
            { timestamp: now.getTime() - 60000, up: 1, down: 1, maintenance: 0, ping: 42 },
            { timestamp: now.getTime() - 120000, up: 0, down: 0, maintenance: 0, ping: 0 },
          ],
          uptime: 99.5,
          avgPing: 36,
          minPing: 30,
          maxPing: 42,
        },
      });
    }
    throw new Error('Unexpected protected route: ' + url.pathname);
  };
}
