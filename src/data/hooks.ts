import { useContext, createContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient, Range } from '../shared/contracts.ts';
import { createHttpClient } from './client.ts';
import { publicConfig } from './config.ts';
import { groupKey, monitorKey } from './queries.ts';
import { loadMonitor } from './loaders.ts';
export const ApiContext = createContext<ApiClient>(createHttpClient());
export function useGroupQuery(id: string) {
  const client = useContext(ApiContext);
  return useQuery({
    queryKey: groupKey(publicConfig.configVersion, id),
    queryFn: ({ signal }) => client.getGroup(id, signal),
  });
}
export function useMonitorQuery(group: string, id: string, range: Range) {
  const client = useContext(ApiContext),
    cache = useQueryClient();
  return useQuery({
    queryKey: monitorKey(publicConfig.configVersion, group, id, range),
    queryFn: ({ signal }) => loadMonitor(cache, client, group, id, range, signal),
    placeholderData: (previous) => previous,
  });
}
