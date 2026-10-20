import { useContext, createContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient, Range } from '../shared/contracts.ts';
import { createHttpClient } from './client.ts';
import { publicConfig } from './config.ts';
import { groupKey, monitorKey } from './queries.ts';
import { loadMonitor } from './loaders.ts';
import { ApiClientError } from './client.ts';
export const ApiContext = createContext<ApiClient>(createHttpClient());
export function useGroupQuery(id: string) {
  const client = useContext(ApiContext);
  return useQuery({
    queryKey: groupKey(publicConfig.configVersion, id),
    queryFn: async ({ signal }) => {
      const data = await client.getGroup(id, signal);
      if (
        data.groupId !== id ||
        data.configVersion !== publicConfig.configVersion ||
        data.monitors.some((m) => m.groupId !== id)
      )
        throw new ApiClientError('invalid-response');
      return data;
    },
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
