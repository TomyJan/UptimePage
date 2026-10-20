export interface Toast {id:number;message:string;tone:'success'|'warning'|'info'}
interface Timer {remaining:number;started:number;handle?:ReturnType<typeof setTimeout>;reasons:Set<string>}
export function createToastStore(){
 let items:Toast[]=[],nextId=0,capacity=5,hidden=false;const listeners=new Set<()=>void>(),timers=new Map<number,Timer>();
 const emit=()=>listeners.forEach(fn=>fn());
 function dismiss(id:number){const timer=timers.get(id);if(timer)clearTimeout(timer.handle);timers.delete(id);items=items.filter(t=>t.id!==id);emit()}
 function schedule(id:number,timer:Timer){clearTimeout(timer.handle);if(!hidden&&!timer.reasons.size){timer.started=Date.now();timer.handle=setTimeout(()=>dismiss(id),timer.remaining)}}
 function stop(timer:Timer){if(timer.handle!==undefined){clearTimeout(timer.handle);timer.handle=undefined;timer.remaining=Math.max(0,timer.remaining-(Date.now()-timer.started))}}
 function trim(){while(items.length>capacity){const id=items[0].id;clearTimeout(timers.get(id)?.handle);timers.delete(id);items=items.slice(1)}}
 return {
  getSnapshot:()=>items,
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
  push(message:string,duration=5000,tone:Toast['tone']='info'){const id=++nextId;items=[...items,{id,message,tone}];const timer:Timer={remaining:duration,started:Date.now(),reasons:new Set()};timers.set(id,timer);schedule(id,timer);trim();emit();return id},
  dismiss,
  setCapacity(value:number){capacity=Math.max(1,Math.min(5,value));const before=items.length;trim();if(items.length!==before)emit()},
  pause(id:number,reason:string,paused:boolean){const timer=timers.get(id);if(!timer)return;stop(timer);if(paused)timer.reasons.add(reason);else timer.reasons.delete(reason);schedule(id,timer)},
  setHidden(value:boolean){if(value===hidden)return;for(const timer of timers.values())stop(timer);hidden=value;for(const [id,timer]of timers)schedule(id,timer)},
 };
}
export const toastStore=createToastStore();
