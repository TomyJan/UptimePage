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

it('loads a complete homepage in one request without per-monitor detail requests', async () => {
  const { groupFixture } = await import('../../src/demo/fixtures.ts');
  const group = groupFixture('core', 200);
  let calls = 0;
  const client = createHttpClient('/api/v1', async (input) => {
    calls++;
    expect(String(input)).toBe('/api/v1/groups/core');
    return Response.json({ ...group, hydrateDetails: true });
  });
  const result = await client.getGroup('core', new AbortController().signal);
  expect(result.monitors).toHaveLength(200);
  expect(result.freshness).toBe('fresh');
  expect(calls).toBe(1);
});
