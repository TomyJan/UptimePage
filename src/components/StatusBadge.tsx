import type { Freshness, MonitorState } from '../shared/contracts.ts';
import { useCopy } from '../features/preferences/copy.ts';
export function StatusBadge({state,freshness}:{state:MonitorState;freshness:Freshness}){
 const t=useCopy(),key=freshness==='fresh'?state:freshness;
 return <span className={`state ${key}`}><i className="dot" aria-hidden="true"/>{t(key)}</span>;
}
