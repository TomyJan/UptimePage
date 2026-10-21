import { expect, it } from 'vitest';
import { buildResponsePaths } from '../../src/features/monitor/chartGeometry.ts';
const at = (h: number) => new Date(Date.UTC(2026, 9, 21, h)).toISOString();
it('breaks at null without extending the last sample', () => {
  const points = [0, 1, 2, 3, 4, 9, 10].map((h, i) => ({
    at: at(h),
    valueMs: i === 2 ? null : 100 + i * 10,
  }));
  const g = buildResponsePaths(points, 500);
  expect(g.segments.map((s) => s.points.length)).toEqual([2, 4]);
  expect(g.segments[0].points[0].x).toBe(40);
  expect(g.segments[1].points.at(-1)!.x).toBe(492);
  expect(g.segments.every((s) => s.line.endsWith(`${s.points.at(-1)!.y}`))).toBeTruthy();
});
it('keeps cubic controls between adjacent extrema, even with flat sections', () => {
  const g = buildResponsePaths(
    [0, 100, 100, 5, 80].map((v, i) => ({ at: at(i), valueMs: v })),
    320,
  );
  const points = g.segments[0].points,
    commands = g.segments[0].line.split(' C ').slice(1);
  commands.forEach((c, i) => {
    const n = c.split(/[ ,]+/).map(Number);
    const lo = Math.min(points[i].y, points[i + 1].y),
      hi = Math.max(points[i].y, points[i + 1].y);
    expect(n[1]).toBeGreaterThanOrEqual(lo - 0.001);
    expect(n[1]).toBeLessThanOrEqual(hi + 0.001);
    expect(n[3]).toBeGreaterThanOrEqual(lo - 0.001);
    expect(n[3]).toBeLessThanOrEqual(hi + 0.001);
  });
  expect(g.max).toBeGreaterThanOrEqual(100);
});
it('supports empty, singleton, duplicate time and zero values', () => {
  expect(buildResponsePaths([], 300).segments).toEqual([]);
  const g = buildResponsePaths(
    [
      { at: at(0), valueMs: 0 },
      { at: at(0), valueMs: 10 },
    ],
    300,
  );
  expect(g.segments[0].points).toHaveLength(1);
  expect(g.segments[0].line).not.toContain('NaN');
});

it('keeps irregular sampling together when no explicit sample is missing', () => {
  const g = buildResponsePaths(
    [0, 1, 3, 4].map((h) => ({ at: at(h), valueMs: 100 })),
    320,
  );
  expect(g.segments.map((s) => s.points.length)).toEqual([4]);
});

it('keeps a fixed requested window when the source only returns recent data', () => {
  const g = buildResponsePaths(
    [1, 2].map((h) => ({ at: at(h), valueMs: 42 })),
    500,
    { from: at(0), until: at(24) },
  );
  expect(g.from).toBe(at(0));
  expect(g.until).toBe(at(24));
  expect(g.segments[0].points[0].x).toBeGreaterThan(g.left);
  expect(g.segments[0].points.at(-1)!.x).toBeLessThan(g.left + (g.right - g.left) / 8);
});

it('draws dashed bridges only for explicitly marked short missing checks, never outages', () => {
  const g = buildResponsePaths(
    [
      { at: at(0), valueMs: 42 },
      { at: at(1), valueMs: null, gap: 'short-missing' },
      { at: at(2), valueMs: 44 },
      { at: at(3), valueMs: null },
      { at: at(4), valueMs: 45 },
    ],
    500,
  );
  expect(g.segments).toHaveLength(3);
  expect(g.bridges).toHaveLength(1);
  expect(g.bridges[0]).toContain(`L ${g.segments[1].points[0].x}`);
});
