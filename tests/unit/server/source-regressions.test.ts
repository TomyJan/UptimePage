import { expect, it, vi } from 'vitest';
import { groupSnapshotSchema, monitorSummarySchema } from '../../../src/shared/contracts.ts';
import { loadGroupSnapshot } from '../../../src/server/snapshot.ts';
import { normalizeUptimeRobotMonitor } from '../../../src/server/sources/normalize.ts';
import { fetchUptimeRobotMonitors } from '../../../src/server/sources/uptimerobot.ts';
import { now, raw, config, fetcher } from '../../fixtures/server.ts';
import { normalizePeekapingMonitor } from '../../../src/server/sources/normalize.ts';
import { requestJson } from '../../../src/server/sources/http.ts';

it('keeps the newest downtime ongoing even when its elapsed duration is nonzero', () => {
  const monitor = normalizeUptimeRobotMonitor(
    {
      ...raw,
      response_times: [{ datetime: Date.parse(now.toISOString()) / 1000, value: 0 }],
      logs: [{ type: 1, datetime: Date.parse(now.toISOString()) / 1000 - 300, duration: 298 }],
    },
    'core',
    [],
    now.toISOString(),
  );
  expect(monitor?.history).toMatchObject([
    { state: 'down', until: now.toISOString(), responseMs: null },
  ]);
});

it('uses the newest Peekaping heartbeat from the documented ascending array', () => {
  const monitor = normalizePeekapingMonitor(
    {
      id: 'm1',
      name: 'API',
      active: true,
      type: 'http',
      uptime_24h: 99,
      heartbeats: [
        { status: 0, time: '2026-10-21T11:00:00Z', end_time: '2026-10-21T11:30:00Z', ping: 0 },
        { status: 1, time: '2026-10-21T11:30:00Z', end_time: '2026-10-21T11:59:00Z', ping: 42 },
      ],
    },
    'core',
    [],
    now.toISOString(),
  );
  expect(monitorSummarySchema.parse(monitor)).toMatchObject({
    state: 'operational',
    responseMs: 42,
    observedAt: '2026-10-21T11:59:00.000Z',
  });
});
it('continues a full UptimeRobot page without a total and rejects repeated pages', async () => {
  let calls = 0;
  const rows = await fetchUptimeRobotMonitors('key', undefined, async () =>
    Response.json({
      stat: 'ok',
      monitors: Array.from({ length: calls++ === 0 ? 50 : 1 }, (_, i) => ({
        id: calls === 1 ? i + 1 : 51,
      })),
    }),
  );
  expect(rows).toHaveLength(51);
  await expect(
    fetchUptimeRobotMonitors('key', undefined, async () =>
      Response.json({ stat: 'ok', monitors: [{ id: 1 }], pagination: { total: 2 } }),
    ),
  ).rejects.toThrow('pagination');
});
it('normalizes Retry-After dates and forbids forwarding credentials through redirects', async () => {
  let redirect: RequestRedirect | undefined;
  await expect(
    requestJson(
      async (_url, init) => {
        redirect = init?.redirect;
        return new Response('{}', {
          status: 429,
          headers: { 'retry-after': 'Wed, 21 Oct 2026 12:00:00 GMT' },
        });
      },
      'https://source.test',
      {},
    ),
  ).rejects.toMatchObject({ retryAt: now.toISOString() });
  expect(redirect).toBe('error');
});
it('retains rate-limit headers when the source returns an HTML error page', async () => {
  await expect(
    requestJson(
      async () =>
        new Response('<h1>Too many requests</h1>', {
          status: 429,
          headers: { 'retry-after': 'Wed, 21 Oct 2026 12:00:00 GMT' },
        }),
      'https://source.test',
      {},
    ),
  ).rejects.toMatchObject({ status: 429, retryAt: now.toISOString() });
});
it.each([' ', false, {}])('treats invalid status %j as unknown instead of paused', (status) => {
  expect(
    normalizeUptimeRobotMonitor({ ...raw, status }, 'core', [], now.toISOString())?.state,
  ).toBe('unknown');
});
it('applies subgroup order and does not retain phantom UptimeRobot members', async () => {
  const input = config();
  input.groups[0].subgroups[0].monitorIds = ['1', '2', '3'];
  input.groups[0].subgroups[0].order = ['2'];
  const snapshot = await loadGroupSnapshot(
    input,
    'core',
    { KEY: 'key' },
    async () =>
      Response.json({ stat: 'ok', monitors: [raw, { ...raw, id: 2 }], pagination: { total: 2 } }),
    now,
  );
  expect(snapshot.subgroups[0].monitorIds).toEqual(['2', '1']);
  expect(snapshot.monitors.map((m) => m.id)).toEqual(['2', '1']);
});
it('uses documented UptimeRobot fields and never stretches a response sample across an outage', () => {
  const monitor = monitorSummarySchema.parse(
    normalizeUptimeRobotMonitor(raw, 'core', ['one'], now.toISOString()),
  );
  expect(monitor.uptime24h.value).toBe(98.25);
  expect(monitor.intervalSeconds).toBe(300);
  expect(monitor.observedAt).not.toBe(new Date(raw.create_datetime * 1000).toISOString());
  expect(
    monitor.history.some((b) => b.state === 'down' && Date.parse(b.until) === now.getTime()),
  ).toBe(true);
  const downAt = now.getTime() - 120000;
  expect(
    monitor.history
      .filter((b) => Date.parse(b.from) <= downAt && Date.parse(b.until) > downAt)
      .every((b) => b.state === 'down'),
  ).toBe(true);
});
it('does not convert absent/blank/invalid values into valid zeroes or paused states', () => {
  const monitor = monitorSummarySchema.parse(
    normalizeUptimeRobotMonitor(
      {
        ...raw,
        status: null,
        interval: 0,
        custom_uptime_ratios: '',
        response_times: [],
        create_datetime: 1e30,
      },
      'core',
      [],
      now.toISOString(),
    ),
  );
  expect(monitor.state).toBe('unknown');
  expect(monitor.intervalSeconds).toBeNull();
  expect(monitor.uptime24h.value).toBeNull();
  expect(monitor.observedAt).toBeNull();
});
it('rejects malformed successful source responses and requests 24h uptime explicitly', async () => {
  let params = new URLSearchParams();
  await fetchUptimeRobotMonitors('key', ['1'], async (_url, init) => {
    params = new URLSearchParams(init?.body as string);
    return Response.json({ stat: 'ok', monitors: [], pagination: { total: 0 } });
  });
  expect(params.get('custom_uptime_ratios')).toBe('1');
  await expect(
    fetchUptimeRobotMonitors('key', ['1'], async () => Response.json({})),
  ).rejects.toThrow();
});
it('does not fetch all account monitors for an empty allowlist', async () => {
  const fetch = vi.fn(fetcher);
  expect(await fetchUptimeRobotMonitors('key', [], fetch)).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});
it('keeps configured subgroup order when Peekaping responses finish out of order', async () => {
  const snapshot = await loadGroupSnapshot(
    config(true),
    'core',
    { KEY: 'key' },
    async (url) => {
      if (String(url).includes('/one/')) await new Promise((resolve) => setTimeout(resolve, 20));
      const name = String(url).includes('/batch?') ? 'Protected' : 'Ignored';
      return Response.json({
        data: [{ id: 'same', name, active: true, heartbeats: [], uptime_24h: 100 }],
      });
    },
    now,
  );
  groupSnapshotSchema.parse(snapshot);
  expect(snapshot.monitors[0].name).toBe('Protected');
  expect(snapshot.monitors[0].subgroupIds).toEqual(['one', 'two']);
});
