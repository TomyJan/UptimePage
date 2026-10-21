/** Only known aggregation can override the configured check cadence. */
export function samplingCadence(
  intervalSeconds: number | null | undefined,
  sampleIntervalSeconds?: number | null,
) {
  return Math.max(intervalSeconds ?? 0, sampleIntervalSeconds ?? 0) * 1000;
}
