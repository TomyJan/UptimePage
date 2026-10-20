import type { HistoryBucket } from '../../shared/contracts.ts';
export type HistorySegment=HistoryBucket&{duration:number};
export function buildHistorySegments(buckets:HistoryBucket[],from:string,until:string):HistorySegment[]{
 const start=Date.parse(from),end=Date.parse(until);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return [];
 const result:HistorySegment[]=[];let cursor=start;
 const push=(a:number,b:number,bucket?:HistoryBucket)=>{if(b>a)result.push({from:new Date(a).toISOString(),until:new Date(b).toISOString(),state:bucket?.state??'no-data',responseMs:bucket?.responseMs??null,duration:b-a})};
 for(const bucket of [...buckets].sort((a,b)=>Date.parse(a.from)-Date.parse(b.from))){const a=Math.max(start,cursor,Date.parse(bucket.from)),b=Math.min(end,Date.parse(bucket.until));if(b<=a)continue;push(cursor,a);push(a,b,bucket);cursor=b}
 push(cursor,end);return result;
}
export function formatMetric(value:number|null,suffix:string){return value===null?'—':`${Number(value.toFixed(2))}${suffix}`}
