import { afterEach, expect, it, vi } from 'vitest';
import { normalizeUptimeRobotMonitor } from '../../../src/server/sources/normalize.ts';
import { epoch, now, raw } from '../../fixtures/server.ts';

afterEach(() => vi.restoreAllMocks());

function alternating(count: number) {
  return {
    ...raw,
    status: 2,
    response_times: Array.from({ length: count }, (_, i) => ({
      datetime: epoch - (i * 120 + 60),
      value: 42,
    })),
    logs: Array.from({ length: count }, (_, i) => ({
      type: 1,
      datetime: epoch - (i + 1) * 120,
      duration: 60,
    })),
  };
}

it('bounds expensive timestamp parsing as samples and outages increase together', () => {
  const small = alternating(360),
    large = alternating(720);
  // Count expensive date conversions instead of using a machine-dependent
  // timing threshold. Doubling input must not quadruple the work.
  const parse = vi.spyOn(Date, 'parse');
  normalizeUptimeRobotMonitor(small, 'core', [], now.toISOString());
  const smallCalls = parse.mock.calls.length;
  parse.mockClear();
  const monitor = normalizeUptimeRobotMonitor(large, 'core', [], now.toISOString());
  const largeCalls = parse.mock.calls.length;
  expect(monitor?.history).toHaveLength(1440);
  expect(monitor?.history.filter((bucket) => bucket.state === 'operational')).toHaveLength(720);
  expect(largeCalls).toBeLessThan(smallCalls * 3);
});

it('preserves outage precedence for nested and adjacent intervals, including their boundaries', () => {
  const monitor = normalizeUptimeRobotMonitor(
    {
      ...raw,
      status: 2,
      response_times: [901, 900, 850, 720, 600, 301, 300].map((age) => ({
        datetime: epoch - age,
        value: age,
      })),
      logs: [
        { type: 1, datetime: epoch - 900, duration: 300 },
        { type: 1, datetime: epoch - 840, duration: 120 },
        { type: 1, datetime: epoch - 600, duration: 300 },
      ],
    },
    'core',
    [],
    now.toISOString(),
  );
  expect(
    monitor?.history
      .filter((bucket) => bucket.state === 'operational')
      .map((bucket) => bucket.responseMs),
  ).toEqual([901, 300]);
  expect(monitor?.history.filter((bucket) => bucket.state === 'down')).toHaveLength(3);
});
