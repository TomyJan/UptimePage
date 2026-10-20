import {useEffect,useRef,useState} from 'react';
export function useScrollChrome(){
 const nav=useRef<HTMLElement>(null),[topVisible,setTopVisible]=useState(false),returning=useRef(false);
 useEffect(()=>{
  const el=nav.current!;let last=Math.max(0,scrollY),direction=0,shift=0,frame=0,settle:ReturnType<typeof setTimeout>|undefined,animation:Animation|null=null;
  const height=()=>el.getBoundingClientRect().height;
  function readShift(){const transform=getComputedStyle(el).transform;return transform==='none'?0:Math.max(0,-new DOMMatrixReadOnly(transform).m42)}
  function paint(value:number){shift=Math.max(0,Math.min(height(),value));el.style.transform=`translate3d(0,-${shift}px,0)`;el.dataset.hidden=String(shift>height()*.8);el.classList.toggle('is-scrolled',scrollY>0)}
  function cancel(){if(animation){const actual=readShift();animation.cancel();animation=null;paint(actual)}}
  function tick(){
   frame=0;const y=Math.max(0,Math.min(scrollY,Math.max(0,document.documentElement.scrollHeight-innerHeight))),delta=y-last;last=y;
   if(Math.abs(delta)<.5)return;cancel();clearTimeout(settle);direction=delta>0?1:-1;
   if(y<=1){paint(0);setTopVisible(false);if(returning.current){returning.current=false;document.getElementById('main')?.focus({preventScroll:true})}return}
   paint(shift+delta);setTopVisible(direction<0&&!returning.current);
   settle=setTimeout(()=>{const target=direction>0?height():0;animation=el.animate([{transform:`translate3d(0,-${shift}px,0)`},{transform:`translate3d(0,-${target}px,0)`}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:320,easing:'cubic-bezier(.22,.75,.25,1)',fill:'forwards'});animation.onfinish=()=>{paint(target);animation?.cancel();animation=null}},140);
  }
  const scroll=()=>{if(!frame)frame=requestAnimationFrame(tick)},intent=()=>{returning.current=false};
  window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('wheel',intent,{passive:true});window.addEventListener('touchstart',intent,{passive:true});
  const focus=()=>{cancel();clearTimeout(settle);paint(0)};el.addEventListener('focusin',focus);paint(0);
  return()=>{window.removeEventListener('scroll',scroll);window.removeEventListener('wheel',intent);window.removeEventListener('touchstart',intent);el.removeEventListener('focusin',focus);cancelAnimationFrame(frame);clearTimeout(settle);animation?.cancel()};
 },[]);
 function toTop(){returning.current=true;setTopVisible(false);scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}
 return {nav,topVisible,toTop};
}
