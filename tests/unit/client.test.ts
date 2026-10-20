import { expect,it } from 'vitest';
import { createHttpClient,ApiClientError } from '../../src/data/client.ts';
import { groupKey,monitorKey } from '../../src/data/queries.ts';
it('encodes opaque IDs and passes cancellation to fetch',async()=>{
 const controller=new AbortController();let actual='';let signal:AbortSignal|null|undefined;
 const client=createHttpClient('/api/v1',async(url,init)=>{actual=String(url);signal=init?.signal;return new Response('{}',{status:404})});
 await expect(client.getMonitor('a','id/with space','7d',controller.signal)).rejects.toMatchObject({code:'not-found'});
 expect(actual).toBe('/api/v1/groups/a/monitors/id%2Fwith%20space?range=7d');expect(signal).toBe(controller.signal);
});
it('separates identical IDs in different groups and ranges',()=>{
 expect(monitorKey('v','a','same','24h')).not.toEqual(monitorKey('v','b','same','24h'));
 expect(monitorKey('v','a','same','24h')).not.toEqual(monitorKey('v','a','same','7d'));
 expect(groupKey('v1','a')).not.toEqual(groupKey('v2','a'));
});
it('rejects invalid responses and sanitizes upstream failures',async()=>{
 const client=createHttpClient('/api/v1',async()=>new Response('{"secret":"private"}'));
 await expect(client.getGroup('a',new AbortController().signal)).rejects.toEqual(new ApiClientError('invalid-response'));
 const limited=createHttpClient('/api/v1',async()=>new Response('{"error":{"code":"rate-limited","retryAt":"2026-10-21T08:00:00Z"}}',{status:429}));
 await expect(limited.getGroup('a',new AbortController().signal)).rejects.toMatchObject({code:'rate-limited',retryAt:'2026-10-21T08:00:00Z'});
});
