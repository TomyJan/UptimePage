import type {MonitorDetail} from '../../shared/contracts.ts';
import {useCopy} from '../preferences/copy.ts';
import {formatMetric} from '../status/history.ts';
import {DataTooltip} from '../../components/DataTooltip.tsx';
import {useFormatTime} from '../status/HistoryBars.tsx';
export function MetricGrid({detail:d}:{detail:MonitorDetail}){
 const t=useCopy(),time=useFormatTime();
 const days=d.certificateExpiresAt!==null&&d.capabilities.certificate==='available'?Math.ceil((Date.parse(d.certificateExpiresAt)-Date.now())/86400000):null;
 return <div className="detail-metrics"><div><small>{t('periodUptime')}</small><strong>{formatMetric(d.monitor.uptime24h.value,'%')}</strong><span>{t(d.monitor.uptime24h.basis==='provider'?'provider':'samples')}</span></div><div><small>{t('latestResponse')}</small><strong>{formatMetric(d.monitor.responseMs,' ms')}</strong>{d.monitor.freshness!=='fresh'&&<span>{t('lastKnown')}</span>}</div><div><small>{t('average')}</small><DataTooltip content={<><div>{t(d.averageResponse24h.basis==='provider'?'provider':'samples')}</div><div className="tip-note">{time(d.averageResponse24h.from,true)} – {time(d.averageResponse24h.until,true)}</div></>}><button className="metric-detail"><strong>{formatMetric(d.averageResponse24h.value,' ms')}</strong></button></DataTooltip></div><div><small>{t('certificate')}</small><strong>{days===null?'—':`${days} ${t('days')}`}</strong>{days===null&&<span>{t(d.capabilities.certificate==='unsupported'?'unsupported':'noData')}</span>}</div></div>;
}
