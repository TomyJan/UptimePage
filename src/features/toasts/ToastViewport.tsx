import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {CheckCircle2,Info,TriangleAlert,X} from 'lucide-react';
import {toastStore,type Toast} from './store.ts';
import {useCopy} from '../preferences/copy.ts';
interface Exit {toast:Toast;offset:number}
export function ToastViewport({topVisible}:{topVisible:boolean}){
 const t=useCopy(),items=useSyncExternalStore(toastStore.subscribe,toastStore.getSnapshot),host=useRef<HTMLDivElement>(null),previous=useRef<Toast[]>([]),positions=useRef(new Map<number,number>());
 const [offsets,setOffsets]=useState<Record<number,number>>({}),[exits,setExits]=useState<Exit[]>([]),exitTimers=useRef(new Set<ReturnType<typeof setTimeout>>());
 useEffect(()=>{
  const visibility=()=>toastStore.setHidden(document.hidden);visibility();document.addEventListener('visibilitychange',visibility);
  const unsubscribe=toastStore.subscribe(()=>{const active=document.activeElement?.closest<HTMLElement>('[data-toast-id]');if(!active)return;const live=toastStore.getSnapshot();if(live.some(t=>t.id===Number(active.dataset.toastId)))return;const other=Array.from(host.current?.querySelectorAll<HTMLButtonElement>('.toast-close')??[]).find(b=>live.some(t=>t.id===Number(b.closest<HTMLElement>('[data-toast-id]')?.dataset.toastId)));(other??document.querySelector<HTMLButtonElement>('.refresh-main')??document.getElementById('main'))?.focus({preventScroll:true})});
  return()=>{document.removeEventListener('visibilitychange',visibility);unsubscribe();exitTimers.current.forEach(clearTimeout)};
 },[]);
 useLayoutEffect(()=>{
  const removed=previous.current.filter(old=>!items.some(item=>item.id===old.id));
  if(removed.length){const leaving=removed.map(toast=>({toast,offset:positions.current.get(toast.id)??0}));setExits(old=>[...old,...leaving]);const timer=setTimeout(()=>{setExits(old=>old.filter(x=>!removed.some(r=>r.id===x.toast.id)));exitTimers.current.delete(timer)},200);exitTimers.current.add(timer)}
  previous.current=items;
 },[items]);
 useLayoutEffect(()=>{
  function measure(){
   const bottom=(innerWidth<=600?12:24)+(topVisible?56:0),available=innerHeight-bottom-88;let used=0,count=0,latestHeight=64;const next:Record<number,number>={};
   for(const item of [...items].reverse()){
    const el=host.current?.querySelector<HTMLElement>(`.toast-position[data-toast-id="${item.id}"]`),height=el?.getBoundingClientRect().height??64;
    if(used===0)latestHeight=height;next[item.id]=used;used+=height+10;if(used-10<=available||count===0)count++;
   }
   setOffsets(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);positions.current=new Map(Object.entries(next).map(([id,n])=>[Number(id),n]));
   const spare=count===items.length?Math.max(0,Math.floor((available-used)/(latestHeight+10))):0;
   toastStore.setCapacity(items.length?Math.max(1,count+spare):Math.min(5,Math.max(1,Math.floor(available/74))));
  }
  const observer=new ResizeObserver(measure);host.current?.querySelectorAll('.toast-card').forEach(el=>observer.observe(el));window.addEventListener('resize',measure);measure();
  return()=>{observer.disconnect();window.removeEventListener('resize',measure)};
 },[items,topVisible]);
 const card=(toast:Toast,exiting=false)=><div className="toast-card" data-tone={toast.tone} onPointerEnter={()=>!exiting&&toastStore.pause(toast.id,'hover',true)} onPointerLeave={()=>!exiting&&toastStore.pause(toast.id,'hover',false)} onFocusCapture={()=>!exiting&&toastStore.pause(toast.id,'focus',true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))toastStore.pause(toast.id,'focus',false)}}><span className="toast-icon">{toast.tone==='success'?<CheckCircle2 size={19}/>:toast.tone==='warning'?<TriangleAlert size={19}/>:<Info size={19}/>}</span><span className="toast-message">{toast.message}</span><button className="toast-close" aria-label={t('dismiss')} onClick={()=>toastStore.dismiss(toast.id)} tabIndex={exiting?-1:0}><X size={15}/></button></div>;
 return createPortal(<div ref={host} className="toast-viewport" role="region" aria-label={t('notifications')} style={{'--toast-lift':topVisible?'56px':'0px'} as React.CSSProperties}><div className="sr-only" role="status">{items.at(-1)?.message}</div>{items.map(toast=><div className="toast-position" data-toast-id={toast.id} key={toast.id} style={{transform:`translateY(-${offsets[toast.id]??0}px)`}}>{card(toast)}</div>)}{exits.map(({toast,offset})=><div className="toast-position is-exiting" key={`exit-${toast.id}`} aria-hidden="true" inert style={{transform:`translateY(-${offset}px)`}}>{card(toast,true)}</div>)}</div>,document.body);
}
