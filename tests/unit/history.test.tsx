import { expect, it } from 'vitest';
import { buildHistorySegments, formatMetric } from '../../src/features/status/history.ts';
it('retains uncovered portions instead of stretching samples across a day', () => {
  const segments = buildHistorySegments(
    [
      {
        from: '2026-10-21T00:10:00Z',
        until: '2026-10-21T00:20:00Z',
        state: 'operational',
        responseMs: 0,
      },
    ],
    '2026-10-21T00:00:00Z',
    '2026-10-21T01:00:00Z',
  );
  expect(segments.map((s) => [s.state, s.duration])).toEqual([
    ['no-data', 600000],
    ['operational', 600000],
    ['no-data', 2400000],
  ]);
  expect(segments[1].responseMs).toBe(0);
});
it('clips to the real window and distinguishes zero from missing', () => {
  expect(buildHistorySegments([], '2026-10-21T00:00:00Z', '2026-10-22T00:00:00Z')[0].state).toBe(
    'no-data',
  );
  expect(formatMetric(0, '%')).toBe('0%');
  expect(formatMetric(null, '%')).toBe('—');
});

it('groups dense checks into separated time cells while retaining faults and empty windows', async () => {
  const { buildHistoryCells } = await import('../../src/features/status/history.ts');
  const buckets = Array.from({ length: 100 }, (_, i) => ({
    from: new Date(Date.parse('2026-10-21T10:00:00Z') + i * 60000).toISOString(),
    until: new Date(Date.parse('2026-10-21T10:00:01Z') + i * 60000).toISOString(),
    state: i === 10 ? ('down' as const) : ('operational' as const),
    responseMs: i === 10 ? null : 42,
  }));
  const cells = buildHistoryCells(buckets, '2026-10-21T00:00:00Z', '2026-10-22T00:00:00Z');
  expect(cells).toHaveLength(48);
  expect(cells.filter((c) => c.state === 'no-data')).toHaveLength(44);
  expect(cells[20].state).toBe('down');
  expect(cells[21]).toMatchObject({ state: 'operational', responseMs: 42 });
});
