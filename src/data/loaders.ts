import type {QueryClient} from '@tanstack/react-query';
import type {ApiClient,Range} from '../shared/contracts.ts';
import {ApiClientError} from './client.ts';
import {publicConfig} from './config.ts';
export async function loadMonitor(cache:QueryClient,client:ApiClient,group:string,id:string,range:Range,signal:AbortSignal){
 try{
  const data=await client.getMonitor(group,id,range,signal);
  if(data.monitor.id!==id||data.monitor.groupId!==group||data.range!==range||data.configVersion!==publicConfig.configVersion)throw new ApiClientError('invalid-response');
  return data;
 }catch(error){
  if(error instanceof ApiClientError&&error.code==='not-found'){
   const queries=cache.getQueryCache().findAll({queryKey:['monitor',publicConfig.configVersion,group,id]});
   // Clear data even in active observers; denied ranges must not remain available in memory.
   for(const query of queries)query.setState({data:undefined,status:'pending',isInvalidated:true});
  }
  throw error;
 }
}
