import { useContext, createContext } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient, GroupSnapshot, Range } from '../shared/contracts.ts';
import { createHttpClient } from './client.ts';
import { usePublicConfig } from './config.ts';
import { groupKey, monitorKey } from './queries.ts';
import { loadMonitor, loadGroup } from './loaders.ts';
export const ApiContext = createContext<ApiClient>(createHttpClient());
// Observe existing snapshots only. Unvisited groups must not cause extra requests.
export function useGroupCounts() {
  const publicConfig = usePublicConfig();
  const queries = useQueries({
    queries: publicConfig.groups.map((group) => ({
      queryKey: groupKey(publicConfig.configVersion, group.id),
      enabled: false,
      select: (data: GroupSnapshot) => data.monitors.length,
    })),
  });
  return Object.fromEntries(publicConfig.groups.map((group, i) => [group.id, queries[i].data]));
}
export function useGroupQuery(id: string) {
  const publicConfig = usePublicConfig();
  const client = useContext(ApiContext),
    cache = useQueryClient();
  return useQuery({
    queryKey: groupKey(publicConfig.configVersion, id),
    queryFn: ({ signal }) => loadGroup(cache, client, id, signal, publicConfig.configVersion),
  });
}
export function useMonitorQuery(group: string, id: string, range: Range) {
  const publicConfig = usePublicConfig();
  const client = useContext(ApiContext),
    cache = useQueryClient();
  return useQuery({
    queryKey: monitorKey(publicConfig.configVersion, group, id, range),
    queryFn: ({ signal }) =>
      loadMonitor(cache, client, group, id, range, signal, publicConfig.configVersion),
    placeholderData: (previous) => previous,
  });
}
