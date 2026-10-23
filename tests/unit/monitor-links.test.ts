import { expect, it } from 'vitest';
import { parseConfig, splitConfig } from '../../config/schema.ts';
import {
  normalizePeekapingMonitor,
  normalizeUptimeRobotMonitor,
} from '../../src/server/sources/normalize.ts';
import { loadGroupSnapshot } from '../../src/server/snapshot.ts';
import { encodeGroupSnapshot } from '../../src/server/home.ts';
import { groupResponseSchema } from '../../src/shared/home.ts';
import { handleApi } from '../../src/server/api.ts';
import { createMemoryCache } from '../../src/server/memory-cache.ts';

const now = new Date('2026-10-23T04:00:00Z');
function input(
  type: 'peekaping' | 'uptimerobot' = 'uptimerobot',
  global = false,
  group?: boolean,
  web?: boolean,
  api?: boolean,
) {
  return {
    site: { name: 'Test', showLinks: global },
    groups: [
      {
        id: 'core',
        name: 'Core',
        ...(group === undefined ? {} : { showLinks: group }),
        source:
          type === 'peekaping'
            ? { type, baseUrl: 'https://source.example.test', apiKeyEnv: 'KEY' }
            : { type, apiKeyEnv: 'KEY' },
        subgroups: [
          {
            id: 'web',
            name: 'Web',
            ...(web === undefined ? {} : { showLinks: web }),
            ...(type === 'peekaping' ? { slug: 'web' } : { monitorIds: ['1', '2'] }),
          },
          {
            id: 'api',
            name: 'API',
            ...(api === undefined ? {} : { showLinks: api }),
            ...(type === 'peekaping' ? { slug: 'api' } : { monitorIds: ['1'] }),
          },
        ],
      },
    ],
  };
}
const records = [1, 2].map((id) => ({
  id: String(id),
  name: `Service ${id}`,
  friendly_name: `Service ${id}`,
  url: `https://service${id}.example.test/path?query=1`,
  active: true,
  status: 2,
  logs: [],
  interval: 60,
}));
function upstream(calls: string[] = []): typeof fetch {
  return async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.includes('/status-pages/'))
      return Response.json({ data: target.includes('/slug/api/') ? [records[0]] : records });
    if (target.includes('/stats/points'))
      return Response.json({ data: { points: [], uptime: null } });
    if (target.includes('/heartbeats')) return Response.json({ data: [] });
    if (target.includes('/tls')) return Response.json({ data: null });
    return Response.json({ data: records, monitors: records, pagination: { total: 2 } });
  };
}

it('defaults link display off and resolves the global fallback for both build outputs', () => {
  const data = input();
  const { showLinks: _, ...site } = data.site;
  expect(parseConfig({ ...data, site }).site).toMatchObject({ showLinks: false });
  const split = splitConfig(parseConfig(input('uptimerobot', true)), 'links');
  expect(split.serverConfig.groups[0]).toMatchObject({ showLinks: true });
  expect(split.publicConfig.groups[0]).toMatchObject({
    showLinks: true,
    subgroups: [{ showLinks: true }, { showLinks: true }],
  });
});

it.each(['peekaping', 'uptimerobot'] as const)(
  'keeps %s URLs only for allowed memberships and round-trips the compact contract',
  async (type) => {
    const calls: string[] = [];
    const config = splitConfig(
      parseConfig(input(type, true, false, false, true)),
      'links',
    ).serverConfig;
    const snapshot = await loadGroupSnapshot(
      config,
      'core',
      { KEY: 'secret' },
      upstream(calls),
      now,
      undefined,
      false,
    );
    expect(snapshot.monitors.map((m) => m.url)).toEqual([records[0].url, undefined]);
    const decoded = groupResponseSchema.parse(encodeGroupSnapshot(snapshot));
    expect(decoded.monitors.map((m) => m.url)).toEqual([records[0].url, undefined]);
    expect(calls).toHaveLength(type === 'peekaping' ? 3 : 1);
  },
);

it.each(['peekaping', 'uptimerobot'] as const)(
  'omits %s links entirely when globally disabled',
  async (type) => {
    const config = splitConfig(parseConfig(input(type)), 'off').serverConfig;
    const snapshot = await loadGroupSnapshot(
      config,
      'core',
      { KEY: 'secret' },
      upstream(),
      now,
      undefined,
      false,
    );
    expect(JSON.stringify(snapshot)).not.toContain('service1.example.test');
    expect(snapshot.monitors.every((m) => !Object.hasOwn(m, 'url'))).toBe(true);
  },
);

it.each([
  'javascript:alert(1)',
  'data:text/html,test',
  '//example.test',
  'https://user:password@example.test',
  'not a URL',
  'https://example.test/\nsecret',
  'https:\\example.test',
])('does not publish unsafe or malformed target %s', (url) => {
  expect(
    normalizePeekapingMonitor({ ...records[0], url }, 'core', ['web'], now.toISOString()),
  ).not.toHaveProperty('url');
  expect(
    normalizeUptimeRobotMonitor({ ...records[0], url }, 'core', ['web'], now.toISOString()),
  ).not.toHaveProperty('url');
});

it.each(['http://example.test/health', 'https://example.test/path?ok=1#test'])(
  'normalizes a valid target from both sources: %s',
  (url) => {
    expect(
      normalizePeekapingMonitor({ ...records[0], url }, 'core', ['web'], now.toISOString()),
    ).toMatchObject({ url });
    expect(
      normalizeUptimeRobotMonitor({ ...records[0], url }, 'core', ['web'], now.toISOString()),
    ).toMatchObject({ url });
  },
);

it.each(['peekaping', 'uptimerobot'] as const)(
  'enforces %s links through full home loads, cold/warm details and configuration changes',
  async (type) => {
    const cache = createMemoryCache(),
      calls: string[] = [];
    for (const enabled of [false, true, false, true]) {
      const config = splitConfig(
        parseConfig(input(type, false, undefined, enabled)),
        `detail-${enabled}`,
      ).serverConfig;
      const runtime = {
        config,
        now,
        environment: { KEY: 'secret' },
        fetcher: upstream(calls),
        cache,
      };
      const groupResponse = await handleApi(
        new Request('https://status.test/api/v1/groups/core'),
        runtime,
      );
      expect(groupResponse.status).toBe(200);
      const home = await groupResponse.json();
      if (enabled) expect(home.monitors[0].url).toBe(records[0].url);
      else expect(home.monitors[0]).not.toHaveProperty('url');
      const request = new Request('https://status.test/api/v1/groups/core/monitors/1');
      for (let i = 0; i < 2; i++) {
        const response = await handleApi(request, runtime);
        expect(response.status).toBe(200);
        const detail = await response.json();
        if (enabled) expect(detail.monitor.url).toBe(records[0].url);
        else expect(detail.monitor).not.toHaveProperty('url');
      }
    }
  },
);

it.each([false, true])(
  'preserves UptimeRobot link policy during stale home and detail fallback (enabled=%s)',
  async (enabled) => {
    const runtime = {
      config: splitConfig(parseConfig(input('uptimerobot', enabled)), `stale-${enabled}`)
        .serverConfig,
      now,
      environment: { KEY: 'secret' },
      fetcher: upstream(),
      cache: createMemoryCache(),
    };
    const home = new Request('https://stale.test/api/v1/groups/core');
    const detail = new Request('https://stale.test/api/v1/groups/core/monitors/1');
    await handleApi(home, runtime);
    await handleApi(detail, runtime);
    runtime.now = new Date(now.getTime() + 60_000);
    runtime.fetcher = async () => Response.json({}, { status: 503 });
    for (const request of [home, detail]) {
      const response = await handleApi(request, runtime);
      expect(response.status).toBe(200);
      const data = await response.json(),
        monitor = data.monitor ?? data.monitors[0];
      expect(monitor.freshness).toBe('stale');
      if (enabled) expect(monitor.url).toBe(records[0].url);
      else expect(monitor).not.toHaveProperty('url');
    }
  },
);
