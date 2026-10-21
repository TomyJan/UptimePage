import { expect, it } from 'vitest';
import { createHttpClient, ApiClientError } from '../../src/data/client.ts';
import { groupKey, monitorKey } from '../../src/data/queries.ts';
it('encodes opaque IDs and passes cancellation to fetch', async () => {
  const controller = new AbortController();
  let actual = '';
  let signal: AbortSignal | null | undefined;
  const client = createHttpClient('/api/v1', async (url, init) => {
    actual = String(url);
    signal = init?.signal;
    return new Response('{}', { status: 404 });
  });
  await expect(
    client.getMonitor('a', 'id/with space', '7d', controller.signal),
  ).rejects.toMatchObject({ code: 'not-found' });
  expect(actual).toBe('/api/v1/groups/a/monitors/id%2Fwith%20space?range=7d');
  expect(signal).toBe(controller.signal);
});
it('separates identical IDs in different groups and ranges', () => {
  expect(monitorKey('v', 'a', 'same', '24h')).not.toEqual(monitorKey('v', 'b', 'same', '24h'));
  expect(monitorKey('v', 'a', 'same', '24h')).not.toEqual(monitorKey('v', 'a', 'same', '7d'));
  expect(groupKey('v1', 'a')).not.toEqual(groupKey('v2', 'a'));
});
it('rejects invalid responses and sanitizes upstream failures', async () => {
  const client = createHttpClient('/api/v1', async () => new Response('{"secret":"private"}'));
  await expect(client.getGroup('a', new AbortController().signal)).rejects.toEqual(
    new ApiClientError('invalid-response'),
  );
  const limited = createHttpClient(
    '/api/v1',
    async () =>
      new Response('{"error":{"code":"rate-limited","retryAt":"2026-10-21T08:00:00Z"}}', {
        status: 429,
      }),
  );
  await expect(limited.getGroup('a', new AbortController().signal)).rejects.toMatchObject({
    code: 'rate-limited',
    retryAt: '2026-10-21T08:00:00Z',
  });
});

it('does not turn authorization failures into public removal', async () => {
  for (const status of [401, 403]) {
    const client = createHttpClient('/api/v1', async () => new Response('{}', { status }));
    await expect(client.getGroup('a', new AbortController().signal)).rejects.toMatchObject({
      code: 'unavailable',
    });
  }
});

it('hydrates Peekaping monitoring data through bounded independent detail requests', async () => {
  const { groupFixture, detailFixture } = await import('../../src/demo/fixtures.ts');
  const group = { ...groupFixture('core', 8), hydrateDetails: true };
  let pending = 0,
    maximum = 0;
  const client = createHttpClient('/api/v1', async (input) => {
    const path = String(input);
    if (!path.includes('/monitors/')) return Response.json(group);
    pending++;
    maximum = Math.max(maximum, pending);
    await new Promise((resolve) => setTimeout(resolve, 2));
    pending--;
    const id = decodeURIComponent(path.split('/monitors/')[1].split('?')[0]);
    const detail = detailFixture('core', id, '24h')!;
    detail.monitor.responseMs = 123;
    return Response.json(detail);
  });
  const result = await client.getGroup('core', new AbortController().signal);
  expect(result.monitors).toHaveLength(8);
  expect(result.monitors.every((m) => m.responseMs === 123)).toBe(true);
  expect(maximum).toBeGreaterThan(1);
  expect(maximum).toBeLessThanOrEqual(4);
});
it('reports hydration failures without replacing protected data with membership data', async () => {
  const { groupFixture } = await import('../../src/demo/fixtures.ts');
  const group = { ...groupFixture('core', 1), hydrateDetails: true };
  const client = createHttpClient('/api/v1', async (input) =>
    String(input).includes('/monitors/')
      ? Response.json(
          { error: { code: 'unavailable', diagnostic: { reason: 'network', stage: 'detail' } } },
          { status: 502 },
        )
      : Response.json(group),
  );
  const result = await client.getGroup('core', new AbortController().signal);
  expect(result.freshness).toBe('stale');
  expect(result.subgroupErrors[0]).toMatchObject({
    code: 'unavailable',
    diagnostic: { reason: 'network', stage: 'detail' },
  });
});

it('stops scheduling more hydration requests after a source rate limit', async () => {
  const { groupFixture } = await import('../../src/demo/fixtures.ts');
  const group = { ...groupFixture('core', 200), hydrateDetails: true };
  let calls = 0;
  const client = createHttpClient('/api/v1', async (input) => {
    if (!String(input).includes('/monitors/')) return Response.json(group);
    calls++;
    return Response.json(
      {
        error: {
          code: 'rate-limited',
          retryAt: '2026-10-21T12:10:00Z',
          diagnostic: { reason: 'upstream-http', status: 429 },
        },
      },
      { status: 429 },
    );
  });
  const result = await client.getGroup('core', new AbortController().signal);
  expect(calls).toBeLessThanOrEqual(4);
  expect(result.monitors).toHaveLength(200);
  expect(
    result.subgroupErrors.every(
      (e) => e.code === 'rate-limited' && e.retryAt === '2026-10-21T12:10:00Z',
    ),
  ).toBe(true);
});

it('retains a concurrent rate-limit deadline when another hydration request fails later', async () => {
  const { groupFixture } = await import('../../src/demo/fixtures.ts');
  const group = { ...groupFixture('core', 2), hydrateDetails: true };
  group.monitors.forEach((m) => {
    m.subgroupIds = [group.subgroups[0].id];
  });
  const client = createHttpClient('/api/v1', async (input) => {
    if (!String(input).includes('/monitors/')) return Response.json(group);
    if (String(input).includes('/monitors/m1'))
      return Response.json(
        { error: { code: 'rate-limited', retryAt: '2026-10-21T12:10:00Z' } },
        { status: 429 },
      );
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json({ error: { code: 'unavailable' } }, { status: 502 });
  });
  const result = await client.getGroup('core', new AbortController().signal);
  expect(result.subgroupErrors[0]).toMatchObject({
    code: 'rate-limited',
    retryAt: '2026-10-21T12:10:00Z',
  });
});
