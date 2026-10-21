import type { Range } from './contracts.ts';
export const rangeDays = (range: Range) => (range === '24h' ? 1 : range === '7d' ? 7 : 30);
export const rangeMilliseconds = (range: Range) => rangeDays(range) * 86400000;
