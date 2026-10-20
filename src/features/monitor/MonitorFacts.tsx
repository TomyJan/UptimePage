import type { MonitorDetail } from '../../shared/contracts.ts';
import { useCopy } from '../preferences/copy.ts';
import { useFormatTime } from '../status/HistoryBars.tsx';
export function MonitorFacts({ detail: d }: { detail: MonitorDetail }) {
  const t = useCopy(),
    time = useFormatTime();
  return (
    <section className="panel">
      <div className="panel-top">
        <h2>{t('information')}</h2>
      </div>
      <dl className="facts">
        <dt>{t('type')}</dt>
        <dd>{d.type ?? '—'}</dd>
        <dt>{t('interval')}</dt>
        <dd>{d.intervalSeconds === null ? '—' : `${d.intervalSeconds} ${t('seconds')}`}</dd>
        <dt>{t('source')}</dt>
        <dd>{d.sourceName ?? '—'}</dd>
        <dt>{t('lastCheck')}</dt>
        <dd>
          <time dateTime={d.monitor.observedAt ?? undefined}>
            {time(d.monitor.observedAt, true)}
          </time>
        </dd>
      </dl>
    </section>
  );
}
