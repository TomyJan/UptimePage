import { afterEach, expect, it, vi } from 'vitest';
import { RefreshScheduler } from '../../src/features/refresh/scheduler.ts';
import { ApiClientError } from '../../src/data/client.ts';
afterEach(() => vi.useRealTimers());
it('waits through timer chunks until a thirty-day refresh is actually due', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
  let calls = 0;
  const scheduler = new RefreshScheduler(async () => {
    calls++;
  }, 2592000);
  scheduler.start();
  await vi.advanceTimersByTimeAsync(1);
  expect(calls).toBe(0);
  await vi.advanceTimersByTimeAsync(2147483646);
  expect(calls).toBe(0);
  await vi.advanceTimersByTimeAsync(444516352);
  expect(calls).toBe(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(calls).toBe(1);
  scheduler.stop();
});

it.each(['defer', 'error'])(
  'honors a distant retry deadline learned from %s across multiple chunks',
  async (source) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
    let calls = 0;
    const retry = Date.now() + 4294968294;
    const scheduler = new RefreshScheduler(async () => {
      calls++;
      if (source === 'error' && calls === 1)
        throw new ApiClientError('rate-limited', new Date(retry).toISOString());
    }, 30);
    scheduler.start();
    if (source === 'error') await scheduler.run(true);
    else scheduler.deferUntil(retry);
    const before = calls;
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(before);
    await vi.advanceTimersByTimeAsync(2147483646);
    expect(calls).toBe(before);
    await vi.advanceTimersByTimeAsync(2147483647);
    expect(calls).toBe(before);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(before + 1);
    scheduler.stop();
  },
);

it.each(['stop', 'disable', 'shorter', 'manual', 'hidden'])(
  'cancels or reconfigures a long timer after its first chunk: %s',
  async (action) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
    let calls = 0;
    const scheduler = new RefreshScheduler(async () => {
      calls++;
    }, 2592000);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(0);
    await vi.advanceTimersByTimeAsync(2147483646);
    expect(calls).toBe(0);
    if (action === 'stop') scheduler.stop();
    if (action === 'disable') scheduler.setInterval(0);
    if (action === 'shorter') scheduler.setInterval(2);
    if (action === 'manual') await scheduler.run(true);
    if (action === 'hidden') scheduler.setHidden(true);
    if (action === 'shorter') {
      await vi.advanceTimersByTimeAsync(1999);
      expect(calls).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toBe(1);
      scheduler.stop();
    } else {
      await vi.advanceTimersByTimeAsync(444516353);
      expect(calls).toBe(action === 'manual' ? 1 : 0);
      if (action === 'hidden') {
        scheduler.setHidden(false);
        await vi.advanceTimersByTimeAsync(0);
        expect(calls).toBe(1);
      }
      scheduler.stop();
    }
  },
);

it.each(['before', 'during'])(
  'keeps a future retry deadline learned %s a successful refresh',
  async (when) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
    let calls = 0;
    const retryAt = Date.parse('2026-10-21T00:03:00Z');
    const scheduler = new RefreshScheduler(async () => {
      calls++;
      if (when === 'during') scheduler.deferUntil(retryAt);
    }, 30);
    scheduler.start();
    if (when === 'before') scheduler.deferUntil(retryAt);
    await scheduler.run(true);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(179999);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2);
    scheduler.stop();
  },
);
it('applies a retry deadline learned from the initial query before polling starts', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
  let calls = 0;
  const scheduler = new RefreshScheduler(async () => {
    calls++;
  }, 30);
  scheduler.start();
  scheduler.deferUntil(Date.parse('2026-10-21T00:03:00Z'));
  await vi.advanceTimersByTimeAsync(179999);
  expect(calls).toBe(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(calls).toBe(1);
  scheduler.stop();
});
it('does not shorten a known retry deadline after a manual request fails with an earlier one', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
  let calls = 0;
  const scheduler = new RefreshScheduler(async () => {
    calls++;
    throw new ApiClientError('unavailable', '2026-10-21T00:03:00Z');
  }, 30);
  scheduler.start();
  scheduler.deferUntil(Date.parse('2026-10-21T00:10:00Z'));
  await scheduler.run(true);
  expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(180_000);
  expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(419_999);
  expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(calls).toBe(2);
  scheduler.stop();
});
it('automatically refreshes once per interval and manual completion resets the deadline', async () => {
  vi.useFakeTimers();
  let calls = 0;
  const scheduler = new RefreshScheduler(async () => {
    calls++;
  }, 60);
  scheduler.start();
  await vi.advanceTimersByTimeAsync(59000);
  expect(calls).toBe(0);
  await scheduler.run(true);
  expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(59000);
  expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(calls).toBe(2);
  scheduler.stop();
});
it('restores a remembered longer retry after replacing the scheduler and current error', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
  let calls = 0;
  let remembered = 0;
  const create = () =>
    new RefreshScheduler(
      async () => {
        calls++;
        throw new ApiClientError(
          'unavailable',
          calls === 1 ? '2026-10-21T00:10:00Z' : '2026-10-21T00:03:00Z',
        );
      },
      30,
      {
        retryAt: remembered,
        remember: (timestamp) => {
          remembered = Math.max(remembered, timestamp);
        },
      },
    );
  const first = create();
  first.start();
  await first.run(true);
  await first.run(true);
  first.stop();
  const replacement = create();
  replacement.start();
  await vi.advanceTimersByTimeAsync(180_000);
  expect(calls).toBe(2);
  await vi.advanceTimersByTimeAsync(419_999);
  expect(calls).toBe(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(calls).toBe(3);
  replacement.stop();
});
it('pauses in background, catches up only once, disables polling at zero', async () => {
  vi.useFakeTimers();
  let calls = 0;
  const scheduler = new RefreshScheduler(async () => {
    calls++;
  }, 30);
  scheduler.start();
  scheduler.setHidden(true);
  await vi.advanceTimersByTimeAsync(120000);
  expect(calls).toBe(0);
  scheduler.setHidden(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(calls).toBe(1);
  scheduler.setInterval(0);
  await vi.advanceTimersByTimeAsync(120000);
  expect(calls).toBe(1);
  scheduler.stop();
});
it('coalesces simultaneous requests and honors a rate-limit retry time', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
  let calls = 0;
  const scheduler = new RefreshScheduler(async () => {
    calls++;
    throw new ApiClientError('rate-limited', '2026-10-21T00:02:00Z');
  }, 30);
  scheduler.start();
  await Promise.all([scheduler.run(true), scheduler.run(true)]);
  expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(119000);
  expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(calls).toBe(2);
  scheduler.stop();
});
