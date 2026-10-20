import { expect, it } from 'vitest';
import { metricSchema } from '../../src/shared/contracts.ts';
it('distinguishes an actual zero from missing data', () => {
  const metric = { value: 0, from: null, until: null, basis: 'provider' };
  expect(metricSchema.parse(metric).value).toBe(0);
  expect(metricSchema.parse({ ...metric, value: null }).value).toBeNull();
  expect(() => metricSchema.parse({ ...metric, value: NaN })).toThrow();
});
