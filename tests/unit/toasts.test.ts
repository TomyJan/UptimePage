import { afterEach, expect, it, vi } from 'vitest';
import { createToastStore } from '../../src/features/toasts/store.ts';
afterEach(() => vi.useRealTimers());
it('evicts older notifications permanently instead of queuing them', () => {
  vi.useFakeTimers();
  const s = createToastStore();
  for (let i = 1; i <= 12; i++) s.push(`message ${i}`);
  expect(s.getSnapshot().map((t) => t.message)).toEqual([
    'message 8',
    'message 9',
    'message 10',
    'message 11',
    'message 12',
  ]);
  s.setCapacity(2);
  expect(s.getSnapshot().map((t) => t.message)).toEqual(['message 11', 'message 12']);
  s.dismiss(s.getSnapshot()[1].id);
  s.setCapacity(5);
  expect(s.getSnapshot().map((t) => t.message)).toEqual(['message 11']);
  s.dismiss(s.getSnapshot()[0].id);
  expect(vi.getTimerCount()).toBe(0);
});
it('tracks independent remaining duration and overlapping pause reasons', async () => {
  vi.useFakeTimers();
  const s = createToastStore();
  const id = s.push('first', 5000);
  await vi.advanceTimersByTimeAsync(2000);
  s.pause(id, 'hover', true);
  s.pause(id, 'focus', true);
  await vi.advanceTimersByTimeAsync(9000);
  expect(s.getSnapshot()).toHaveLength(1);
  s.pause(id, 'hover', false);
  await vi.advanceTimersByTimeAsync(4000);
  expect(s.getSnapshot()).toHaveLength(1);
  s.pause(id, 'focus', false);
  await vi.advanceTimersByTimeAsync(2999);
  expect(s.getSnapshot()).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(s.getSnapshot()).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});
it('page visibility pauses all messages including newly added ones', async () => {
  vi.useFakeTimers();
  const s = createToastStore();
  s.setHidden(true);
  s.push('hidden', 1000);
  await vi.advanceTimersByTimeAsync(5000);
  expect(s.getSnapshot()).toHaveLength(1);
  s.setHidden(false);
  await vi.advanceTimersByTimeAsync(1000);
  expect(s.getSnapshot()).toHaveLength(0);
});
