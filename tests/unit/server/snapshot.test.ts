import { expect, it } from 'vitest';
import { parseConfig } from '../../../config/schema.ts';
import { loadGroupSnapshot, PublicGroupNotFoundError } from '../../../src/server/snapshot.ts';
import type { ServerConfig } from '../../../src/server/config.ts';

const config = (type: 'peekaping' | 'uptimerobot'): ServerConfig => ({
  configVersion: 'version-a',
  cache: {},
  groups: parseConfig({
    site: { name: 'Test' },
    groups: [
      {
        id: 'group',
        name: 'Group',
        source:
          type === 'peekaping'
            ? { type, baseUrl: 'https://peekaping.example.test', apiKeyEnv: 'KEY' }
            : { type, apiKeyEnv: 'KEY' },
        subgroups:
          type === 'peekaping'
            ? [
                { id: 'web', name: 'Web', slug: 'web' },
                { id: 'api', name: 'API', slug: 'api' },
              ]
            : [{ id: 'web', name: 'Web', monitorIds: ['1', '2'] }],
      },
    ],
  }).groups,
});

it('merges Peekaping subgroup results while retaining independent subgroup membership', async () => {
  const calls: string[] = [];
  const snapshot = await loadGroupSnapshot(
    config('peekaping'),
    'group',
    { KEY: 'secret' },
    async (url) => {
      calls.push(String(url));
      if (String(url).includes('/stats/points'))
        return Response.json({ data: { points: [], uptime: null } });
      if (String(url).includes('/heartbeats')) return Response.json({ data: [] });
      const slug = String(url).split('/').at(-2);
      return new Response(
        JSON.stringify({
          monitors: [
            {
              id: 'same',
              name: slug,
              active: true,
              uptime_24h: 100,
              heartbeats: [],
            },
          ],
        }),
      );
    },
    new Date('2026-10-21T12:00:00Z'),
  );
  expect(calls).toHaveLength(5);
  expect(snapshot.monitors).toHaveLength(1);
  expect(snapshot.monitors[0].subgroupIds).toEqual(['web', 'api']);
  expect(snapshot.subgroups.map((subgroup) => subgroup.monitorIds)).toEqual([['same'], ['same']]);
});

it('filters UptimeRobot results to configured IDs and reports source failures per subgroup', async () => {
  const snapshot = await loadGroupSnapshot(
    config('uptimerobot'),
    'group',
    { KEY: 'secret' },
    async () => new Response(JSON.stringify({ error: 'down' }), { status: 503 }),
  );
  expect(snapshot.freshness).toBe('unavailable');
  expect(snapshot.subgroupErrors).toEqual([
    {
      subgroupId: 'web',
      code: 'unavailable',
      diagnostic: { reason: 'upstream-http', status: 503, stage: 'source' },
    },
  ]);
  expect(snapshot.monitors).toEqual([]);
});

it('rejects groups outside the generated server configuration', async () => {
  await expect(
    loadGroupSnapshot(config('peekaping'), 'missing', { KEY: 'secret' }),
  ).rejects.toBeInstanceOf(PublicGroupNotFoundError);
});
