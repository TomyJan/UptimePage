import { useContext,createContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiClient,Range } from '../shared/contracts.ts';
import { createHttpClient } from './client.ts';
import { publicConfig } from './config.ts';
import { groupKey,monitorKey } from './queries.ts';
export const ApiContext=createContext<ApiClient>(createHttpClient());
export function useGroupQuery(id:string){const client=useContext(ApiContext);return useQuery({queryKey:groupKey(publicConfig.configVersion,id),queryFn:({signal})=>client.getGroup(id,signal)})}
export function useMonitorQuery(group:string,id:string,range:Range){const client=useContext(ApiContext);return useQuery({queryKey:monitorKey(publicConfig.configVersion,group,id,range),queryFn:({signal})=>client.getMonitor(group,id,range,signal)})}
