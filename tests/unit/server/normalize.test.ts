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
      uptime24h: { value: 98.25 },
    });
  });

  it('rejects malformed upstream records instead of creating fake monitors', () => {
    expect(normalizePeekapingMonitor({ id: 'missing-name' }, 'core', [], fetchedAt)).toBeNull();
    expect(
      normalizeUptimeRobotMonitor({ friendly_name: 'missing-id' }, 'core', [], fetchedAt),
    ).toBeNull();
  });
});
