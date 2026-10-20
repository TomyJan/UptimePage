import { z } from 'zod';
import { apiErrorCodeSchema,groupSnapshotSchema,monitorDetailSchema,type ApiClient,type ApiErrorCode } from '../shared/contracts.ts';
export class ApiClientError extends Error {
 code:ApiErrorCode;retryAt:string|null;
 constructor(code:ApiErrorCode,retryAt:string|null=null){super(code);this.name='ApiClientError';this.code=code;this.retryAt=retryAt}
}
const errorSchema=z.object({error:z.object({code:apiErrorCodeSchema,retryAt:z.iso.datetime().nullable()})});
export function createHttpClient(basePath='/api/v1',fetcher:typeof fetch=fetch):ApiClient {
 async function request<T>(path:string,schema:z.ZodType<T>,signal:AbortSignal):Promise<T>{
  let response:Response;
  try{response=await fetcher(basePath+path,{signal,headers:{Accept:'application/json'},credentials:'same-origin'})}catch(e){if(signal.aborted)throw e;throw new ApiClientError('unavailable')}
  if([401,403,404].includes(response.status))throw new ApiClientError('not-found');
  let data:unknown;try{data=await response.json()}catch{throw new ApiClientError(response.ok?'invalid-response':'unavailable')}
  if(!response.ok){const parsed=errorSchema.safeParse(data);throw new ApiClientError(response.status===429?'rate-limited':parsed.success?parsed.data.error.code:'unavailable',parsed.success?parsed.data.error.retryAt:null)}
  const parsed=schema.safeParse(data);if(!parsed.success)throw new ApiClientError('invalid-response');return parsed.data;
 }
 return {getGroup:(id,signal)=>request(`/groups/${encodeURIComponent(id)}`,groupSnapshotSchema,signal),getMonitor:(group,id,range,signal)=>request(`/groups/${encodeURIComponent(group)}/monitors/${encodeURIComponent(id)}?range=${range}`,monitorDetailSchema,signal)};
}
