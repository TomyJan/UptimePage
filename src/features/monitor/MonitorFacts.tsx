import type { MonitorDetail } from '../../shared/contracts.ts';
import { AnimatedHeight } from '../../components/AnimatedHeight.tsx';
import { formatInterval } from '../status/duration.ts';
import { usePreferences } from '../preferences/store.ts';
import { useCopy } from '../preferences/copy.ts';
import { useFormatTime } from '../status/HistoryBars.tsx';
export function MonitorFacts({
  detail: d,
  refreshing = false,
}: {
  detail: MonitorDetail;
  refreshing?: boolean;
}) {
  const { locale } = usePreferences();
  const t = useCopy(),
    time = useFormatTime();
  return (
    <section className="panel loading-surface" aria-busy={refreshing}>
      <div className="panel-top">
        <h2>{t('information')}</h2>
      </div>
      <AnimatedHeight>
        <dl className="facts">
          <dt>{t('type')}</dt>
          <dd>{d.type ?? '—'}</dd>
          <dt>{t('interval')}</dt>
          <dd>{formatInterval(d.intervalSeconds, locale)}</dd>
          <dt>{t('source')}</dt>
          <dd>{d.sourceName ?? '—'}</dd>
          <dt>{t('lastCheck')}</dt>
          <dd>
            <time dateTime={d.monitor.observedAt ?? undefined}>
              {time(d.monitor.observedAt, true)}
            </time>
          </dd>
        </dl>
      </AnimatedHeight>
    </section>
  );
}
