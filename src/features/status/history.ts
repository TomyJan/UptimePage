import type { HistoryBucket } from '../../shared/contracts.ts';
export type HistorySegment = HistoryBucket & { duration: number };
export function buildHistorySegments(
  buckets: HistoryBucket[],
  from: string,
  until: string,
): HistorySegment[] {
  const start = Date.parse(from),
    end = Date.parse(until);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const result: HistorySegment[] = [];
  let cursor = start;
  const push = (a: number, b: number, bucket?: HistoryBucket) => {
    if (b > a)
      result.push({
        from: new Date(a).toISOString(),
        until: new Date(b).toISOString(),
        state: bucket?.state ?? 'no-data',
        responseMs: bucket?.responseMs ?? null,
        duration: b - a,
      });
  };
  for (const bucket of [...buckets].sort((a, b) => Date.parse(a.from) - Date.parse(b.from))) {
    const a = Math.max(start, cursor, Date.parse(bucket.from)),
      b = Math.min(end, Date.parse(bucket.until));
    if (b <= a) continue;
    push(cursor, a);
    push(a, b, bucket);
    cursor = b;
  }
  push(cursor, end);
  return result;
}
export function formatMetric(value: number | null, suffix: string) {
  return value === null ? '—' : `${Number(value.toFixed(2))}${suffix}`;
}

/** Each cell summarizes checks in a time window, never inferred continuous uptime. */
export function buildHistoryCells(
  buckets: HistoryBucket[],
  from: string,
  until: string,
): HistorySegment[] {
  const start = Date.parse(from),
    end = Date.parse(until);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const count = 48,
    width = (end - start) / count;
  const priority: Record<HistoryBucket['state'], number> = {
    'no-data': 0,
    operational: 1,
    paused: 2,
    unknown: 3,
    pending: 4,
    maintenance: 5,
    partial: 6,
    down: 7,
  };
  const cells = Array.from(
    { length: count },
    (_, i): HistorySegment & { sum: number; samples: number } => ({
      from: new Date(start + i * width).toISOString(),
      until: new Date(start + (i + 1) * width).toISOString(),
      state: 'no-data',
      responseMs: null,
      duration: width,
      sum: 0,
      samples: 0,
    }),
  );
  for (const bucket of buckets) {
    const a = Math.max(start, Date.parse(bucket.from)),
      b = Math.min(end, Date.parse(bucket.until));
    if (!(b > a)) continue;
    for (
      let i = Math.max(0, Math.floor((a - start) / width));
      i < count && start + i * width < b;
      i++
    ) {
      const cell = cells[i];
      if (priority[bucket.state] > priority[cell.state]) cell.state = bucket.state;
      if (bucket.responseMs !== null && bucket.state !== 'no-data') {
        cell.sum += bucket.responseMs;
        cell.samples++;
      }
    }
  }
  return cells.map(({ sum, samples, ...cell }) => ({
    ...cell,
    responseMs: samples ? sum / samples : null,
  }));
}
