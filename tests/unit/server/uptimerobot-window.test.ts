import { expect, it } from 'vitest';
import { fetchUptimeRobotMonitors } from '../../../src/server/sources/uptimerobot.ts';
import { normalizeUptimeRobotMonitor } from '../../../src/server/sources/normalize.ts';

it('batches only missing boundaries and requests no extra samples or statistics', async () => {
  const calls: URLSearchParams[] = [];
  const rows = await fetchUptimeRobotMonitors(
    'secret',
    undefined,
    async (_url, init) => {
      const form = new URLSearchParams(init?.body as string);
      calls.push(form);
      return Response.json({
        stat: 'ok',
        monitors: form.has('logs_limit')
          ? [
              { id: 1, status: 9, logs: [{ type: 1, datetime: 1, duration: 0 }] },
              {
                id: 2,
                status: 2,
                logs: [
                  { type: 2, datetime: 110, duration: 10 },
                  { type: 1, datetime: 90, duration: 20 },
                ],
              },
            ]
          : [
              { id: 1, status: 9, logs: [] },
              { id: 2, status: 2, logs: [{ type: 2, datetime: 110, duration: 10 }] },
              { id: 3, status: 9, logs: [{ type: 1, datetime: 120, duration: 0 }] },
              { id: 4, status: 2, logs: [] },
            ],
      });
    },
    { includeDetails: true, startDate: 100, endDate: 200 },
  );
  expect(calls).toHaveLength(2);
  expect(calls[1].get('monitors')).toBe('1-2');
  expect(calls[1].get('logs_limit')).toBe('2');
  expect(calls[1].get('log_types')).toBe('1-2');
  expect(
    ['response_times', 'custom_uptime_ratios', 'logs_start_date', 'logs_end_date'].every(
      (key) => !calls[1].has(key),
    ),
  ).toBe(true);
  expect((rows[0] as { logs: unknown[] }).logs).toHaveLength(1);
  expect((rows[1] as { logs: unknown[] }).logs).toHaveLength(2);
});

it.each(['failed', 'missing', 'changed'])(
  'does not publish incomplete boundaries when the lookup is %s',
  async (scenario) => {
    await expect(
      fetchUptimeRobotMonitors(
        'secret',
        ['1'],
        async (_url, init) => {
          const form = new URLSearchParams(init?.body as string);
          if (form.has('logs_limit')) {
            if (scenario === 'failed') return new Response('', { status: 503 });
            return Response.json({
              stat: 'ok',
              monitors: scenario === 'missing' ? [] : [{ id: 1, status: 2, logs: [] }],
            });
          }
          return Response.json({ stat: 'ok', monitors: [{ id: 1, status: 9, logs: [] }] });
        },
        { includeDetails: true, startDate: 100, endDate: 200 },
      ),
    ).rejects.toThrow();
  },
);

it.each([true, false])(
  'preserves an outage that began before the requested window (ongoing: %s)',
  async (ongoing) => {
    const end = 1800000000,
      start = end - 86400;
    const began = start - 90 * 86400;
    const rows = await fetchUptimeRobotMonitors(
      'secret',
      ['1'],
      async (_url, init) => {
        const form = new URLSearchParams(init?.body as string);
        // Real v2 behavior: date filtering drops the outage's start event.
        const logs = !form.has('logs_limit')
          ? ongoing
            ? []
            : [{ type: 2, datetime: start + 300, duration: 1000 }]
          : [
              ...(ongoing ? [] : [{ type: 2, datetime: start + 300, duration: 1000 }]),
              { type: 1, datetime: began, duration: ongoing ? 0 : start + 300 - began },
            ];
        return Response.json({
          stat: 'ok',
          monitors: [
            { id: 1, friendly_name: 'Public', status: ongoing ? 9 : 2, logs, response_times: [] },
          ],
        });
      },
      { includeDetails: true, startDate: start, endDate: end },
    );
    const monitor = normalizeUptimeRobotMonitor(
      rows[0],
      'core',
      [],
      new Date(end * 1000).toISOString(),
    );
    expect(monitor?.history).toEqual([
      {
        from: new Date(began * 1000).toISOString(),
        until: new Date((ongoing ? end : start + 300) * 1000).toISOString(),
        state: 'down',
        responseMs: null,
      },
    ]);
  },
);

it('splits a 30-day response window into bounded requests without repeating logs or uptime', async () => {
  const end = 1800000000,
    start = end - 30 * 86400;
  const calls: URLSearchParams[] = [];
  const rows = await fetchUptimeRobotMonitors(
    'secret',
    ['1'],
    async (_url, init) => {
      const form = new URLSearchParams(init?.body as string);
      calls.push(form);
      const from = Number(form.get('response_times_start_date'));
      const until = Number(form.get('response_times_end_date'));
      if (until - from > 7 * 86400)
        return Response.json({ stat: 'fail', error: { type: 'invalid_parameter' } });
      return Response.json({
        stat: 'ok',
        pagination: { total: 1 },
        monitors: [
          {
            id: 1,
            friendly_name: 'Public',
            custom_uptime_ratio: '99.5',
            logs: form.get('logs') === '1' ? [{ datetime: start + 1, type: 1 }] : [],
            response_times: [
              { datetime: from, value: 1 },
              { datetime: until, value: 2 },
            ],
          },
        ],
      });
    },
    {
      includeDetails: true,
      startDate: start,
      endDate: end,
      uptimeDays: 30,
      responseTimesAverage: 60,
    },
  );
  expect(calls).toHaveLength(5);
  expect(
    calls.every(
      (c) =>
        Number(c.get('response_times_end_date')) - Number(c.get('response_times_start_date')) <=
        7 * 86400,
    ),
  ).toBe(true);
  expect(calls.filter((c) => c.get('logs') === '1')).toHaveLength(1);
  expect(calls[0].get('logs_start_date')).toBe(String(start));
  expect(calls.filter((c) => c.has('custom_uptime_ratios'))).toHaveLength(1);
  expect(calls.slice(1).every((c) => !c.has('logs_start_date') && c.get('monitors') === '1')).toBe(
    true,
  );
  const monitor = rows[0] as {
    logs: unknown[];
    response_times: { datetime: number; value: number }[];
    custom_uptime_ratio: string;
  };
  expect(monitor.logs).toHaveLength(1);
  expect(monitor.custom_uptime_ratio).toBe('99.5');
  const times = monitor.response_times.map((p) => p.datetime).sort((a, b) => a - b);
  expect(times).toHaveLength(6);
  expect(times[0]).toBe(start);
  expect(times.at(-1)).toBe(end);
});

it('does not return a successful truncated range if an older window fails', async () => {
  let calls = 0;
  await expect(
    fetchUptimeRobotMonitors(
      'secret',
      ['1'],
      async () => {
        calls++;
        return calls === 1
          ? Response.json({ stat: 'ok', monitors: [{ id: 1, response_times: [] }] })
          : new Response('', { status: 503 });
      },
      { includeDetails: true, startDate: 0, endDate: 30 * 86400 },
    ),
  ).rejects.toThrow();
});
