import { describe, expect, it } from 'vitest';
import { fetchPeekapingMonitors } from '../../../src/server/sources/peekaping.ts';
import { SourceRequestError } from '../../../src/server/sources/http.ts';
import { fetchUptimeRobotMonitors } from '../../../src/server/sources/uptimerobot.ts';

describe('source request clients', () => {
  it('uses Peekaping X-API-Key and encodes the status-page slug', async () => {
    let actualUrl = '';
    let actualInit: RequestInit | undefined;
    const value = await fetchPeekapingMonitors(
      'https://peekaping.example.test/',
      'ops/team',
      'pk_secret',
      async (url, init) => {
        actualUrl = String(url);
        actualInit = init;
        return new Response('{"monitors":[]}', { status: 200 });
      },
    );
    expect(actualUrl).toBe(
      'https://peekaping.example.test/api/v1/status-pages/slug/ops%2Fteam/monitors',
    );
    expect(new Headers(actualInit?.headers).get('X-API-Key')).toBe('pk_secret');
    expect(value).toEqual({ monitors: [] });
  });

  it('fetches all UptimeRobot pages and sends monitor selection in the body', async () => {
    const requests: URLSearchParams[] = [];
    const value = await fetchUptimeRobotMonitors('ur_secret', ['1', '2'], async (_url, init) => {
      const body = init?.body;
      requests.push(new URLSearchParams(body as string));
      const offset = Number(new URLSearchParams(body as string).get('offset'));
      return new Response(
        JSON.stringify({
          monitors: [{ id: String(offset + 1) }],
          pagination: { total: 2 },
        }),
        { status: 200 },
      );
    });
    expect(value).toEqual([{ id: '1' }, { id: '2' }]);
    expect(requests.map((request) => request.get('offset'))).toEqual(['0', '1']);
    expect(requests[0].get('api_key')).toBe('ur_secret');
    expect(requests[0].get('monitors')).toBe('1-2');
  });

  it('requests response samples and logs for the production detail view', async () => {
    let body: URLSearchParams | undefined;
    await fetchUptimeRobotMonitors(
      'ur_secret',
      ['1'],
      async (_url, init) => {
        body = new URLSearchParams(init?.body as string);
        return new Response(JSON.stringify({ monitors: [], pagination: { total: 0 } }));
      },
      { includeDetails: true, startDate: 100, endDate: 200 },
    );
    expect(body?.get('response_times')).toBe('1');
    expect(body?.get('response_times_start_date')).toBe('100');
    expect(body?.get('response_times_end_date')).toBe('200');
    expect(body?.get('logs')).toBe('1');
    expect(body?.get('logs_start_date')).toBe('100');
    expect(body?.get('logs_end_date')).toBe('200');
  });

  it('maps rate limits and malformed responses to server-safe errors', async () => {
    await expect(
      fetchPeekapingMonitors(
        'https://example.test',
        'a',
        'secret',
        async () =>
          new Response('{"message":"slow down"}', {
            status: 429,
            headers: { 'retry-after': '30' },
          }),
      ),
    ).rejects.toMatchObject({ status: 429, retryAt: expect.any(String) });
    await expect(
      fetchPeekapingMonitors(
        'https://example.test',
        'a',
        'secret',
        async () => new Response('not-json', { status: 200 }),
      ),
    ).rejects.toBeInstanceOf(SourceRequestError);
  });

  it('continues pagination when UptimeRobot returns a string total and surfaces API failures', async () => {
    let calls = 0;
    await expect(
      fetchUptimeRobotMonitors('secret', undefined, async () => {
        calls += 1;
        return new Response(
          JSON.stringify({ monitors: [{ id: calls }], pagination: { total: '2' } }),
        );
      }),
    ).resolves.toHaveLength(2);
    expect(calls).toBe(2);
    await expect(
      fetchUptimeRobotMonitors(
        'secret',
        undefined,
        async () => new Response(JSON.stringify({ stat: 'fail', error: 'bad key' })),
      ),
    ).rejects.toMatchObject({
      message: 'UptimeRobot rejected the request',
      diagnostic: { reason: 'upstream-rejected' },
    });
  });
});

it('sends an explicit encoded string form compatible with the EdgeOne fetch runtime', async () => {
  const result = await fetchUptimeRobotMonitors('secret+&=', ['1'], async (_url, init) => {
    if (typeof init?.body !== 'string') throw new TypeError('Unsupported BodyInit');
    if (new Headers(init.headers).get('content-type') !== 'application/x-www-form-urlencoded')
      return new Response('', { status: 415 });
    expect(new URLSearchParams(init.body).get('api_key')).toBe('secret+&=');
    return Response.json({ stat: 'ok', monitors: [{ id: 1 }] });
  });
  expect(result).toEqual([{ id: 1 }]);
});
