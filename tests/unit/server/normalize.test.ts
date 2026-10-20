import { describe, expect, it } from 'vitest';
import {
  normalizePeekapingMonitor,
  normalizeUptimeRobotMonitor,
} from '../../../src/server/sources/normalize.ts';

const fetchedAt = '2026-10-21T12:00:00.000Z';

describe('source normalization', () => {
  it('maps Peekaping heartbeat status, uptime and history without inventing names', () => {
    const monitor = normalizePeekapingMonitor(
      {
        id: 'm1',
        name: 'API',
        active: true,
        type: 1,
        interval: 60,
        uptime_24h: 99.5,
        heartbeats: [
          {
            status: 1,
            time: '2026-10-21T11:59:00Z',
            end_time: '2026-10-21T11:59:01Z',
            ping: 42,
          },
        ],
      },
      'core',
      ['web'],
      fetchedAt,
    );
    expect(monitor).toMatchObject({
      id: 'm1',
      groupId: 'core',
      subgroupIds: ['web'],
      state: 'operational',
      responseMs: 42,
      type: 'HTTP',
      intervalSeconds: 60,
      sourceName: 'Peekaping',
      uptime24h: { value: 99.5, basis: 'provider' },
    });
    expect(monitor?.history).toHaveLength(1);
  });

  it('maps UptimeRobot states and preserves missing response values as null', () => {
    const monitor = normalizeUptimeRobotMonitor(
      {
        id: 42,
        friendly_name: 'Website',
        status: 9,
        type: 1,
        monitor_interval: 300,
        custom_uptime_ratio: '98.25-99.10',
        average_response_time: null,
      },
      'external',
      ['tools'],
      fetchedAt,
    );
    expect(monitor).toMatchObject({
      id: '42',
      state: 'down',
      responseMs: null,
      type: 'HTTP',
      intervalSeconds: 300,
      sourceName: 'UptimeRobot',
      uptime24h: { value: 98.25 },
    });
  });

  it('normalizes UptimeRobot response samples into ordered history buckets', () => {
    const monitor = normalizeUptimeRobotMonitor(
      {
        id: 42,
        friendly_name: 'Website',
        status: 2,
        response_times: [
          { datetime: 1761048000, value: 250 },
          { datetime: 1761047940, value: 200 },
        ],
      },
      'external',
      ['tools'],
      fetchedAt,
    );
    expect(monitor?.history.map((bucket) => bucket.responseMs)).toEqual([200, 250]);
    expect(monitor?.history[0].from).toBe('2025-10-21T11:59:00.000Z');
  });

  it('rejects malformed upstream records instead of creating fake monitors', () => {
    expect(normalizePeekapingMonitor({ id: 'missing-name' }, 'core', [], fetchedAt)).toBeNull();
    expect(
      normalizeUptimeRobotMonitor({ friendly_name: 'missing-id' }, 'core', [], fetchedAt),
    ).toBeNull();
  });
});
