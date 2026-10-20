import {useEffect,useId,useRef,useState} from 'react';
import {buildResponsePaths,type ResponsePoint} from './chartGeometry.ts';
import {useCopy} from '../preferences/copy.ts';
import {useFormatTime} from '../status/HistoryBars.tsx';
export function ResponseChart({points,animationKey}:{points:ResponsePoint[];animationKey:string}){
 const t=useCopy(),time=useFormatTime(),host=useRef<HTMLDivElement>(null),[width,setWidth]=useState(600),id=useId();
 useEffect(()=>{const el=host.current!;const observer=new ResizeObserver(entries=>setWidth(Math.max(100,entries[0].contentRect.width)));observer.observe(el);return()=>observer.disconnect()},[]);
 const g=buildResponsePaths(points,width);
 return <div ref={host} className="chart-host">{g.segments.length?<><svg className="chart" viewBox={`0 0 ${width} 190`} role="img" aria-label={t('response')}><defs><clipPath id={id}><rect key={animationKey} className="chart-reveal" x={g.left-3} y="0" width={g.right-g.left+6} height="190"/></clipPath></defs>{[0,1,2,3].map(i=>{const y=g.top+(g.bottom-g.top)*i/3;return <g key={i}><line className="grid" x1={g.left} x2={g.right} y1={y} y2={y}/><text x="0" y={y+4}>{Math.round(g.max*(3-i)/3)}</text></g>})}<g clipPath={`url(#${id})`}>{g.segments.map((s,i)=><g key={i}><path className="chart-area" d={s.area}/><path className="chart-line" d={s.line} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>{s.points.length===1&&<circle cx={s.points[0].x} cy={s.points[0].y} r="2" fill="currentColor"/>}</g>)}</g></svg><div className="chart-labels"><span>{time(points[0]?.at??null,true)}</span><span>{time(points.at(-1)?.at??null,true)}</span></div></>:<div className="empty">{t('noData')}</div>}</div>;
}
