import { afterEach, expect, it, vi } from 'vitest';
import { RefreshScheduler } from '../../src/features/refresh/scheduler.ts';
import { ApiClientError } from '../../src/data/client.ts';
afterEach(() => vi.useRealTimers());
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
