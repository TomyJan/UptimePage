import { expect, it } from 'vitest';
import { config, now } from '../../fixtures/server.ts';
import { loadGroupSnapshot } from '../../../src/server/snapshot.ts';
import { handleApi } from '../../../src/server/api.ts';

it('expands wildcard membership while retaining explicit subgroup selection and rejecting unknown details', async () => {
  const c = config();
  c.groups[0].subgroups = [
    { id: 'all-key', name: 'All', logo: null, monitorIds: ['*'], order: ['2'] },
    { id: 'one', name: 'One', logo: null, monitorIds: ['1'] },
  ];
  const bodies: URLSearchParams[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    bodies.push(new URLSearchParams(init?.body as string));
    return Response.json({
      stat: 'ok',
      monitors: [1, 2].map((id) => ({ id, friendly_name: `M${id}`, status: 2 })),
      pagination: { total: 2 },
    });
  };
  const snapshot = await loadGroupSnapshot(c, 'core', { KEY: 'secret' }, fetcher, now);
  expect(bodies[0].has('monitors')).toBe(false);
  expect(snapshot.subgroups.map((s) => s.monitorIds)).toEqual([['2', '1'], ['1']]);
  expect(snapshot.monitors.find((m) => m.id === '1')?.subgroupIds).toEqual(['all-key', 'one']);
  const denied = await handleApi(
    new Request('https://site.test/api/v1/groups/core/monitors/private'),
    { config: c, environment: { KEY: 'secret' }, fetcher, now },
  );
  expect(denied.status).toBe(404);
});

it('paginates wildcard selections and keeps explicit subgroup ordering independent', async () => {
  const c = config();
  c.groups[0].subgroups[0].monitorIds = ['*'];
  c.groups[0].subgroups.push({
    id: 'specific',
    name: 'Specific',
    logo: null,
    monitorIds: ['51', '1'],
  });
  let calls = 0;
  const data = await loadGroupSnapshot(
    c,
    'core',
    { KEY: 'key' },
    async (_url, init) => {
      calls++;
      const body = new URLSearchParams(init?.body as string);
      expect(body.has('monitors')).toBe(false);
      const offset = Number(body.get('offset'));
      return Response.json({
        stat: 'ok',
        monitors: Array.from({ length: offset === 0 ? 50 : 1 }, (_, i) => ({
          id: offset + i + 1,
          friendly_name: 'Monitor',
          status: 2,
        })),
        pagination: { total: 51 },
      });
    },
    now,
  );
  expect(calls).toBe(2);
  expect(data.monitors).toHaveLength(51);
  expect(data.subgroups[1].monitorIds).toEqual(['51', '1']);
});

it('validates wildcard ordering without allowing the selector as a monitor ID', async () => {
  const { parseConfig } = await import('../../../config/schema.ts');
  const make = (monitorIds: string[], order: string[]) => ({
    site: { name: 'Test' },
    groups: [
      {
        id: 'test',
        name: 'Test',
        source: { type: 'uptimerobot', apiKeyEnv: 'KEY' },
        subgroups: [{ id: 'test', name: 'Test', monitorIds, order }],
      },
    ],
  });
  expect(() => parseConfig(make(['*'], ['51', '1']))).not.toThrow();
  expect(() => parseConfig(make(['*'], ['*']))).toThrow('Order references');
  expect(() => parseConfig(make(['1'], ['2']))).toThrow('Order references');
});
