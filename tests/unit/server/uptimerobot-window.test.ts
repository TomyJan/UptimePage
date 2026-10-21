import { expect, it } from 'vitest';
import { fetchUptimeRobotMonitors } from '../../../src/server/sources/uptimerobot.ts';

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
