import type { QueryClient } from '@tanstack/react-query';
import type { ApiClient, GroupSnapshot, Range } from '../shared/contracts.ts';
import { ApiClientError } from './client.ts';
import { publicConfig } from './config.ts';
import { groupKey, monitorKey } from './queries.ts';
export async function loadMonitor(
  cache: QueryClient,
  client: ApiClient,
  group: string,
  id: string,
  range: Range,
  signal: AbortSignal,
  version = publicConfig.configVersion,
) {
  try {
    const data = await client.getMonitor(group, id, range, signal);
    if (
      data.monitor.id !== id ||
      data.monitor.groupId !== group ||
      data.range !== range ||
      data.configVersion !== version
    )
      throw new ApiClientError('invalid-response');
    if (
      (data.diagnostic || data.monitor.freshness !== 'fresh') &&
      cache.getQueryData(monitorKey(version, group, id, range))
    )
      throw new ApiClientError(
        data.diagnostic?.status === 429 ? 'rate-limited' : 'unavailable',
        data.retryAt ?? null,
        data.diagnostic,
      );
    return data;
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'not-found') {
      revokeMonitor(cache, group, id, version);
    }
    throw error;
  }
}

function revokeMonitor(cache: QueryClient, group: string, id: string, version: string) {
  cache.setQueryData<GroupSnapshot>(
    groupKey(version, group),
    (old) =>
      old && {
        ...old,
        monitors: old.monitors.filter((m) => m.id !== id),
        subgroups: old.subgroups.map((s) => ({
          ...s,
          monitorIds: s.monitorIds.filter((member) => member !== id),
        })),
      },
  );
  const queries = cache.getQueryCache().findAll({ queryKey: ['monitor', version, group, id] });
  // Clear data even in active observers; denied ranges must not remain available in memory.
  for (const query of queries)
    query.setState({ data: undefined, status: 'pending', isInvalidated: true });
}
export async function loadGroup(
  cache: QueryClient,
  client: ApiClient,
  id: string,
  signal: AbortSignal,
  version = publicConfig.configVersion,
) {
  const data = await client.getGroup(id, signal);
  if (
    data.groupId !== id ||
    data.configVersion !== version ||
    data.monitors.some((m) => m.groupId !== id)
  )
    throw new ApiClientError('invalid-response');
  // Apply confirmed removals even when another monitor's refresh failed.
  for (const revoked of data.revokedMonitorIds ?? []) revokeMonitor(cache, id, revoked, version);
  if (data.freshness !== 'fresh' && cache.getQueryData(groupKey(version, id))) {
    const error = data.subgroupErrors[0];
    throw new ApiClientError(
      error?.code ?? 'unavailable',
      data.subgroupErrors
        .flatMap((e) => (e.retryAt ? [e.retryAt] : []))
        .sort()
        .at(-1) ?? null,
      error?.diagnostic,
    );
  }
  return data;
}
