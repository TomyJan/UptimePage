import type { GroupSnapshot,MonitorSummary } from '../../shared/contracts.ts';
import { localize } from '../preferences/locale.ts';
function unique(monitors:MonitorSummary[]){const seen=new Set<string>();return monitors.filter(m=>{if(seen.has(m.id))return false;seen.add(m.id);return true})}
export function selectMonitors(snapshot:GroupSnapshot,subgroupId:string,query:string,pinAbnormal:boolean):MonitorSummary[]{
 const byId=new Map(snapshot.monitors.map(m=>[m.id,m]));
 const source=subgroupId==='all'?snapshot.monitors:(snapshot.subgroups.find(s=>s.id===subgroupId)?.monitorIds??[]).flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);
 const needle=query.trim().toLocaleLowerCase();
 const result=unique(source).filter(m=>[m.name,m.description].filter(x=>x!==null).flatMap(x=>[localize(x,'en'),localize(x,'zh-CN')]).join(' ').toLocaleLowerCase().includes(needle));
 const priority=(m:MonitorSummary)=>m.state==='down'?0:m.state==='pending'?1:m.freshness!=='fresh'||m.state==='unknown'?2:3;
 return pinAbnormal?result.sort((a,b)=>priority(a)-priority(b)):result;
}
export function summarize(snapshot:GroupSnapshot){
 const monitors=unique(snapshot.monitors);let up=0,down=0;
 for(const m of monitors){if(snapshot.freshness!=='fresh'||m.freshness!=='fresh')continue;if(m.state==='operational')up++;if(m.state==='down')down++}
 return {up,down,other:monitors.length-up-down,total:monitors.length,healthy:monitors.length>0&&up===monitors.length&&snapshot.subgroupErrors.length===0};
}
