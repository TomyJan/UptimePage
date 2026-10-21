import { expect, it } from 'vitest';
import { limitSourceFetch, mapConcurrent } from '../../../src/server/concurrency.ts';
import { fetchPeekapingBatch } from '../../../src/server/sources/peekaping.ts';
import { requestJson } from '../../../src/server/sources/http.ts';

it('shares the origin budget, releases failed slots and cancels queued requests', async () => {
  const releases: (() => void)[] = [];
  const started: string[] = [];
  const fetcher = limitSourceFetch(async (input) => {
    started.push(String(input));
    await new Promise<void>((resolve) => releases.push(resolve));
    if (String(input).endsWith('/fail')) throw new Error('network unavailable');
    return new Response('ok');
  }, 2);
  const a = fetcher('https://upstream.test/fail').catch(() => null);
  const b = fetcher('https://upstream.test/b');
  const abort = new AbortController();
  const cancelled = fetcher('https://upstream.test/cancelled', { signal: abort.signal }).catch(
    () => null,
  );
  const c = fetcher('https://upstream.test/c');
  const other = fetcher('https://other.test/a');
  await new Promise(setImmediate);
  expect(started).toHaveLength(3);
  abort.abort();
  await cancelled;
  releases.shift()!();
  await a;
  await new Promise(setImmediate);
  expect(started).not.toContain('https://upstream.test/cancelled');
  expect(started).toContain('https://upstream.test/c');
  releases.splice(0).forEach((release) => release());
  expect((await Promise.all([b, c, other])).every((response) => response.ok)).toBe(true);
});

it('preserves membership order when concurrent tasks complete in reverse order', async () => {
  const releases: (() => void)[] = [];
  const result = mapConcurrent(['a', 'b', 'c'], 3, async (item) => {
    await new Promise<void>((resolve) => releases.push(resolve));
    return item;
  });
  releases.reverse().forEach((release) => release());
  expect(await result).toEqual(['a', 'b', 'c']);
});

it('keeps a source slot until the response body has finished arriving', async () => {
  const bodies: ReadableStreamDefaultController<Uint8Array>[] = [];
  let started = 0;
  const fetcher = limitSourceFetch(async () => {
    started++;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          bodies.push(controller);
        },
      }),
    );
  }, 1);
  const first = fetcher('https://source.test/a').then((response) => response.text());
  const second = fetcher('https://source.test/b').then((response) => response.text());
  await new Promise(setImmediate);
  const beforeBodyEnds = started;
  bodies[0].enqueue(new TextEncoder().encode('first'));
  bodies[0].close();
  await first;
  await new Promise(setImmediate);
  bodies[1].close();
  await second;
  expect(beforeBodyEnds).toBe(1);
});

it('preserves a rate limit and retry deadline even when its discarded body is broken', async () => {
  const fetcher = limitSourceFetch(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('connection reset'));
          },
        }),
        {
          status: 429,
          headers: { 'retry-after': 'Wed, 21 Oct 2026 23:10:00 GMT' },
        },
      ),
  );
  await expect(requestJson(fetcher, 'https://source.test/check', {})).rejects.toMatchObject({
    status: 429,
    retryAt: '2026-10-21T23:10:00.000Z',
  });
});

it('does not dispatch later batches after the first batch is rate limited', async () => {
  const started: string[] = [];
  const pending: (() => void)[] = [];
  const task = fetchPeekapingBatch(
    'https://source.test',
    Array.from({ length: 1000 }, (_, i) => String(i)),
    'secret',
    async (input) => {
      const id = new URL(String(input)).searchParams.get('ids')!.split(',')[0];
      started.push(id);
      if (id === '0') return new Response('', { status: 429 });
      await new Promise<void>((resolve) => pending.push(resolve));
      return Response.json({ data: [] });
    },
  ).catch(() => null);
  await task;
  for (let i = 0; i < 5; i++) {
    pending.splice(0).forEach((release) => release());
    await new Promise(setImmediate);
  }
  expect(started).toHaveLength(4);
});
