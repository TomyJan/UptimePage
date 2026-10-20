import type {MonitorDetail} from '../../shared/contracts.ts';
import {useCopy} from '../preferences/copy.ts';
import {useFormatTime} from '../status/HistoryBars.tsx';
export function MonitorEvents({detail:d}:{detail:MonitorDetail}){
 const t=useCopy(),time=useFormatTime();
 return <section className="panel"><div className="panel-top"><h2>{t('events')}</h2></div>{d.capabilities.events!=='available'?<p className="muted">{t(d.capabilities.events==='unsupported'?'unsupported':'noData')}</p>:d.events.length?d.events.map(e=><div className="event" key={e.id}><time dateTime={e.from}>{time(e.from,true)}</time><div>{t(e.state)}{e.until&&<p>→ {time(e.until,true)}</p>}</div></div>):<p className="muted">{t('noEvents')}</p>}</section>;
}
