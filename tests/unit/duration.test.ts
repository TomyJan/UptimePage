import { expect, it } from 'vitest';
import { formatInterval } from '../../src/features/status/duration.ts';
it.each([
  [null, '—', '—'],
  [30, '30 秒', '30s'],
  [300, '5 分钟', '5m'],
  [90, '1 分钟 30 秒', '1m 30s'],
  [3600, '1 小时', '1h'],
  [90061, '1 天 1 小时 1 分钟 1 秒', '1d 1h 1m 1s'],
] as const)('formats %s seconds in readable units', (value, zh, en) => {
  expect(formatInterval(value, 'zh-CN')).toBe(zh);
  expect(formatInterval(value, 'en')).toBe(en);
});
