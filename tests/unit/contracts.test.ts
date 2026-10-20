import { expect, it } from 'vitest';
import { metricSchema } from '../../src/shared/contracts.ts';
it('distinguishes an actual zero from missing data', () => {
  const metric = { value: 0, from: null, until: null, basis: 'provider' };
  expect(metricSchema.parse(metric).value).toBe(0);
  expect(metricSchema.parse({ ...metric, value: null }).value).toBeNull();
  expect(() => metricSchema.parse({ ...metric, value: NaN })).toThrow();
});

import { historyBucketSchema } from '../../src/shared/contracts.ts';
it('orders mixed precision UTC instants by their timestamps', () => {
  const bucket = {
    from: '2026-10-21T12:00:00Z',
    until: '2026-10-21T12:00:00.001Z',
    state: 'operational',
    responseMs: 0,
  };
  expect(historyBucketSchema.safeParse(bucket).success).toBe(true);
  expect(
    historyBucketSchema.safeParse({ ...bucket, from: bucket.until, until: bucket.from }).success,
  ).toBe(false);
  expect(
    historyBucketSchema.safeParse({ ...bucket, until: '2026-10-21T12:00:00.000Z' }).success,
  ).toBe(false);
});
