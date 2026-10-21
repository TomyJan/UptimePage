import { expect, it } from 'vitest';
import { selectMonitors, summarize } from '../../src/features/status/selectors.ts';
import { groupFixture } from '../../src/demo/fixtures.ts';
import { loadGroupSnapshot } from '../../src/server/snapshot.ts';
import { config, now } from '../fixtures/server.ts';

it('counts fresh successful subgroup results even when another status page fails', async () => {
  const snapshot = await loadGroupSnapshot(
    config(true),
    'core',
    { KEY: 'key' },
    async (url) =>
      String(url).includes('/stats/points')
        ? Response.json({ data: { points: [], uptime: null } })
        : String(url).includes('/heartbeats')
          ? Response.json({ data: [] })
          : String(url).includes('/one/') || String(url).includes('/batch?')
            ? Response.json({
                data: [
                  {
                    id: 'up',
                    name: 'Up',
                    status: 1,
                    active: true,
                    heartbeats: [{ status: 1, time: '2026-10-21T11:59:00Z', ping: 1 }],
                  },
                  {
                    id: 'down',
                    name: 'Down',
                    status: 0,
                    active: true,
                    heartbeats: [{ status: 0, time: '2026-10-21T11:59:00Z', ping: 0 }],
                  },
                ],
              })
            : new Response('', { status: 503 }),
    now,
  );
  expect(snapshot.freshness).toBe('stale');
  expect(snapshot.monitors.map((monitor) => monitor.freshness)).toEqual(['fresh', 'fresh']);
  expect(summarize(snapshot)).toEqual({ up: 1, down: 1, other: 0, total: 2, healthy: false });
});
it('preserves independent subgroup ordering and filters only public text', () => {
  const data = groupFixture('core', 4);
  data.subgroups[0].monitorIds = ['m4', 'm1', 'm4'];
  expect(selectMonitors(data, 'web', '', false).map((m) => m.id)).toEqual(['m4', 'm1']);
  expect(selectMonitors(data, 'all', '  documentation ', false).map((m) => m.id)).toEqual(['m3']);
  expect(selectMonitors(data, 'missing', '', false)).toEqual([]);
  expect(selectMonitors(data, 'all', '', false).map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
});
it('pins observed problems stably and retains the last observed state after transport failures', () => {
  const data = groupFixture('core');
  expect(
    selectMonitors(data, 'all', '', true)
      .slice(0, 2)
      .map((m) => m.id),
  ).toEqual(['m2', 'm1']);
  expect(summarize(data)).toEqual({ up: 7, down: 1, other: 2, total: 10, healthy: false });
  data.freshness = 'stale';
  data.monitors = data.monitors.map((monitor) => ({ ...monitor, freshness: 'stale' }));
  expect(summarize(data).up).toBe(7);
});
it('deduplicates only within a group and supports arbitrary counts', () => {
  const data = groupFixture('core', 200);
  data.monitors.push(data.monitors[0]);
  expect(selectMonitors(data, 'all', '', false)).toHaveLength(200);
  expect(selectMonitors(groupFixture('external'), 'all', '', false)[0].groupId).toBe('external');
});
