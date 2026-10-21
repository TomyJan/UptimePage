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
) {
  try {
    const data = await client.getMonitor(group, id, range, signal);
    if (
      data.monitor.id !== id ||
      data.monitor.groupId !== group ||
      data.range !== range ||
      data.configVersion !== publicConfig.configVersion
    )
      throw new ApiClientError('invalid-response');
    if (
      (data.diagnostic || data.monitor.freshness !== 'fresh') &&
      cache.getQueryData(monitorKey(publicConfig.configVersion, group, id, range))
    )
      throw new ApiClientError(
        data.diagnostic?.status === 429 ? 'rate-limited' : 'unavailable',
        data.retryAt ?? null,
        data.diagnostic,
      );
    return data;
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'not-found') {
      cache.setQueryData<GroupSnapshot>(
        groupKey(publicConfig.configVersion, group),
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
      const queries = cache
        .getQueryCache()
        .findAll({ queryKey: ['monitor', publicConfig.configVersion, group, id] });
      // Clear data even in active observers; denied ranges must not remain available in memory.
      for (const query of queries)
        query.setState({ data: undefined, status: 'pending', isInvalidated: true });
    }
    throw error;
  }
}
