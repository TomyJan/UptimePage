import { afterEach, expect, it, vi } from 'vitest';
import { readCache, writeCache } from '../../../src/server/cache.ts';

afterEach(() => vi.useRealTimers());
it('bounds optional storage waits instead of blocking live requests indefinitely', async () => {
  vi.useFakeTimers();
  const cache = {
    match: () => new Promise<Response | undefined>(() => {}),
    put: () => new Promise<void>(() => {}),
  };
  const request = new Request('https://site.test/api/v1/groups/core');
  const read = readCache(cache, request, 'v');
  const write = writeCache(cache, request, 'v', new Response('{}'));
  await vi.advanceTimersByTimeAsync(1001);
  expect(await read).toBeUndefined();
  await expect(write).resolves.toBeUndefined();
});
