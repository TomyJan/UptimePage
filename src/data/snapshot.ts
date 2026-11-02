import { ApiClientError } from './client.ts';
import type { GroupSnapshot, MonitorDetail } from '../shared/contracts.ts';

export type Snapshot = GroupSnapshot | MonitorDetail;

/** Retains the public failure scope even when a prior complete snapshot is kept. */
export class SnapshotLoadError extends ApiClientError {
  readonly subgroupIds: string[];
  readonly monitorIds: string[];
  constructor(error: ApiClientError, subgroupIds: string[], monitorIds: string[]) {
    super(error.code, error.retryAt, error.diagnostic);
    this.name = 'SnapshotLoadError';
    this.subgroupIds = subgroupIds;
    this.monitorIds = monitorIds;
  }
}

/** HTTP success can still contain failed subgroups, monitors or detail sections. */
export function snapshotError(data: Snapshot | undefined | null): SnapshotLoadError | null {
  if (!data) return null;
  if ('monitors' in data) {
    const subgroupIds = [
      ...new Set([
        ...data.subgroupErrors.map((error) => error.subgroupId),
        ...data.subgroups
          .filter((subgroup) => subgroup.freshness !== 'fresh')
          .map((subgroup) => subgroup.id),
      ]),
    ];
    const monitorIds = data.monitors
      .filter((monitor) => monitor.freshness !== 'fresh')
      .map((monitor) => monitor.id);
    if (data.freshness === 'fresh' && !subgroupIds.length && !monitorIds.length) return null;
    const error =
      data.subgroupErrors.find(
        (error) => error.code === 'rate-limited' || error.diagnostic?.status === 429,
      ) ?? data.subgroupErrors[0];
    const retryAt =
      data.subgroupErrors
        .flatMap((error) => (error.retryAt ? [error.retryAt] : []))
        .sort((a, b) => Date.parse(a) - Date.parse(b))
        .at(-1) ?? null;
    return new SnapshotLoadError(
      new ApiClientError(error?.code ?? 'unavailable', retryAt, error?.diagnostic),
      subgroupIds,
      monitorIds,
    );
  }
  // Optional fields and empty history also use "unavailable"; only explicit
  // request failures should prevent new state and timestamps from being used.
  if (!data.diagnostic && data.monitor.freshness === 'fresh') return null;
  return new SnapshotLoadError(
    new ApiClientError(
      data.diagnostic?.status === 429 ? 'rate-limited' : 'unavailable',
      data.retryAt ?? null,
      data.diagnostic,
    ),
    [],
    [data.monitor.id],
  );
}
