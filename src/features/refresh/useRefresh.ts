import { useEffect,useRef,useState } from 'react';
import { publicConfig } from '../../data/config.ts';
import { usePreferences } from '../preferences/store.ts';
import { RefreshScheduler } from './scheduler.ts';
export function useRefresh(refresh:()=>Promise<unknown>,identity:string){
 const {preferences}=usePreferences(),seconds=preferences.refresh==='auto'?publicConfig.site.refreshIntervalSeconds:preferences.refresh;
 const request=useRef(refresh);request.current=refresh;
 const [busy,setBusy]=useState(false),[remaining,setRemaining]=useState(seconds);
 const scheduler=useRef<RefreshScheduler|null>(null);
 useEffect(()=>{
  const s=new RefreshScheduler(async()=>{setBusy(true);try{return await request.current()}finally{setBusy(false)}},seconds);scheduler.current=s;
  s.start();s.setHidden(document.hidden);
  const visibility=()=>s.setHidden(document.hidden);document.addEventListener('visibilitychange',visibility);
  const ticker=setInterval(()=>setRemaining(s.deadline?Math.max(0,Math.ceil((s.deadline-Date.now())/1000)):0),250);
  return()=>{s.stop();scheduler.current=null;clearInterval(ticker);document.removeEventListener('visibilitychange',visibility)};
 },[seconds,identity]);
 return {busy,remaining,seconds,run:()=>scheduler.current?.run(true)};
}
