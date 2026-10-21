import { expect, it } from 'vitest';
import { encodeGroupSnapshot } from '../../src/server/home.ts';
import { compactGroupSchema, groupResponseSchema } from '../../src/shared/home.ts';
import { groupFixture } from '../../src/demo/fixtures.ts';
import { createHttpClient } from '../../src/data/client.ts';
import { buildHistoryCells } from '../../src/features/status/history.ts';

it('keeps subgroup ordering, zero values, outages and no-data cells across the compact wire format', async () => {
  const source = groupFixture('core', 50);
  source.monitors[0].responseMs = 0;
  source.monitors[0].uptime24h.value = 0;
  source.monitors[0].logo = 'https://example.test/logo.svg';
  source.monitors[0].description = { en: 'Service', 'zh-CN': '服务' };
  source.monitors[1].history = [];
  const wire = encodeGroupSnapshot(source);
  expect(compactGroupSchema.safeParse(wire).success).toBe(true);
  const client = createHttpClient('/api/v1', async () => Response.json(wire));
  const data = await client.getGroup('core', new AbortController().signal);
  expect(data.subgroups).toEqual(source.subgroups);
  expect(data.monitors[0]).toMatchObject({
    responseMs: 0,
    uptime24h: { value: 0 },
    logo: source.monitors[0].logo,
    description: source.monitors[0].description,
  });
  for (const m of data.monitors) {
    const original = source.monitors.find((s) => s.id === m.id)!;
    expect(m.subgroupIds).toEqual(
      source.subgroups.filter((s) => s.monitorIds.includes(m.id)).map((s) => s.id),
    );
    const expected = buildHistoryCells(
      original.history,
      new Date(Date.parse(source.fetchedAt) - 86400000).toISOString(),
      source.fetchedAt,
      original.sampleIntervalSeconds,
    );
    expect(m.history.map((c) => c.state)).toEqual(expected.map((c) => c.state));
    expect(m.history.map((c) => [c.from, c.until])).toEqual(expected.map((c) => [c.from, c.until]));
  }
  expect(JSON.stringify(wire).length).toBeLessThan(JSON.stringify(source).length / 3);
});
it('rejects empty, oversized or malformed compact history cells', () => {
  const wire = encodeGroupSnapshot(groupFixture('core', 1));
  for (const history of [
    [],
    Array.from({ length: 49 }, () => ['operational', 42]),
    [['down', -1]],
    [['invented', 42]],
  ])
    expect(
      groupResponseSchema.safeParse({ ...wire, monitors: [{ ...wire.monitors[0], history }] })
        .success,
    ).toBe(false);
});
