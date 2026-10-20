import { toastStore } from '../toasts/store.ts';
import { TransitionLink } from '../../components/TransitionLink.tsx';
import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { AnimatedHeight } from '../../components/AnimatedHeight.tsx';
import type { MonitorDetail, Range } from '../../shared/contracts.ts';
import { publicConfig } from '../../data/config.ts';
import { useMonitorQuery } from '../../data/hooks.ts';
import { useSnapshotExpired } from '../../data/useSnapshotExpired.ts';
import { ApiClientError } from '../../data/client.ts';
import { Logo } from '../../components/Logo.tsx';
import { StatusBadge } from '../../components/StatusBadge.tsx';
import { localize } from '../preferences/locale.ts';
import { usePreferences } from '../preferences/store.ts';
import { useCopy } from '../preferences/copy.ts';
import { RefreshControl } from '../refresh/RefreshControl.tsx';
import { HistoryBars } from '../status/HistoryBars.tsx';
import { MetricGrid } from './MetricGrid.tsx';
import { ResponseChart } from './ResponseChart.tsx';
import { MonitorEvents } from './MonitorEvents.tsx';
import { MonitorFacts } from './MonitorFacts.tsx';
export function MonitorPage() {
  const { groupId = '', monitorId = '' } = useParams();
  return <MonitorContent key={`${groupId}:${monitorId}`} groupId={groupId} monitorId={monitorId} />;
}
function MonitorContent({ groupId, monitorId }: { groupId: string; monitorId: string }) {
  const [range, setRange] = useState<Range>('24h'),
    q = useMonitorQuery(groupId, monitorId, range),
    t = useCopy(),
    { locale } = usePreferences(),
    location = useLocation();
  const [known, setKnown] = useState<MonitorDetail | null>(null);
  useEffect(() => {
    if (q.data && !q.isPlaceholderData) setKnown(q.data);
  }, [q.data, q.isPlaceholderData]);
  const returnTo =
    typeof location.state?.returnTo === 'string' && location.state.returnTo.startsWith('/?')
      ? location.state.returnTo
      : `/?g=${encodeURIComponent(groupId)}`;
  const back = (
    <TransitionLink className="back" to={returnTo}>
      <ArrowLeft size={14} />
      {t('back')}
    </TransitionLink>
  );
  const denied = q.error instanceof ApiClientError && q.error.code === 'not-found';
  const data = q.data ?? known;
  const expired = useSnapshotExpired(data?.fetchedAt ?? null);
  const refresh = async () => {
    const result = await q.refetch();
    if (result.error) throw result.error;
  };
  const refreshControl = (
    <RefreshControl
      fetchedAt={data?.fetchedAt ?? null}
      identity={`${groupId}:${monitorId}:${range}`}
      error={q.error}
      retryAt={data?.retryAt}
      refresh={refresh}
      onResult={(ok) =>
        toastStore.push(t(ok ? 'refreshDone' : 'refreshFailed'), 5000, ok ? 'success' : 'warning')
      }
    />
  );
  if (!publicConfig.groups.some((g) => g.id === groupId) || denied)
    return (
      <>
        {back}
        <div className="empty">{t('notFound')}</div>
      </>
    );
  if (!data)
    return (
      <>
        {back}
        <section className="intro">{refreshControl}</section>
        {q.isError ? (
          <div className="empty">
            <p>{t('loadError')}</p>
            <button className="retry" onClick={() => void q.refetch()}>
              {t('retry')}
            </button>
          </div>
        ) : (
          <div className="skeleton" aria-busy="true">
            <div />
            <div />
            <div />
          </div>
        )}
      </>
    );
  const d =
      q.isError || expired
        ? { ...data, monitor: { ...data.monitor, freshness: 'stale' as const } }
        : data,
    name = localize(d.monitor.name, locale);
  const chartState =
    q.isError && (!q.data || data.range !== range)
      ? 'error'
      : q.isPlaceholderData || data.range !== range
        ? 'loading'
        : d.capabilities.response;
  return (
    <div className="detail-content">
      {back}
      <section className="detail-heading">
        <div className="detail-title">
          <Logo src={d.monitor.logo} name={name} className="service-logo" />
          <div>
            <h1>{name}</h1>
            {d.monitor.description && <p>{localize(d.monitor.description, locale)}</p>}
          </div>
        </div>
        <StatusBadge state={d.monitor.state} freshness={d.monitor.freshness} />
        {refreshControl}
      </section>
      {d.monitor.freshness !== 'fresh' && (
        <div className="detail-alert" role="status">
          {t('staleNote')}
        </div>
      )}
      <MetricGrid detail={d} />
      <section className="panel chart-panel">
        <div className="panel-top">
          <h2>
            {t('response')} <span className="muted mono">ms</span>
          </h2>
          <div className="window-tabs" aria-label={t('response')}>
            {(['24h', '7d', '30d'] as Range[]).map((r) => (
              <button
                key={r}
                aria-pressed={r === range}
                disabled={!d.supportedRanges.includes(r)}
                className={r === range ? 'active' : ''}
                onClick={() => setRange(r)}
                aria-label={r}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <AnimatedHeight className="chart-body" contentKey={`${range}:${chartState}`}>
          {chartState === 'error' ? (
            <div className="empty" role="status">
              <p>{t('loadError')}</p>
              <button className="retry" onClick={() => void refresh().catch(() => {})}>
                {t('retry')}
              </button>
            </div>
          ) : chartState === 'loading' ? (
            <div className="chart-loading" aria-busy="true" />
          ) : chartState === 'available' ? (
            <ResponseChart points={d.response} animationKey={`${groupId}:${monitorId}:${range}`} />
          ) : (
            <div className="empty">
              {t(d.capabilities.response === 'unsupported' ? 'unsupported' : 'noData')}
            </div>
          )}
        </AnimatedHeight>
      </section>
      <section className="panel">
        <div className="panel-top">
          <h2>
            {t('checks')} <span className="muted">{t('history')}</span>
          </h2>
        </div>
        <AnimatedHeight contentKey={d.capabilities.history}>
          {d.capabilities.history === 'available' ? (
            <>
              <HistoryBars history={d.monitor.history} until={d.fetchedAt} />
              <div className="history-meta">
                <span>{t('ago')}</span>
                <span>{t('now')}</span>
              </div>
            </>
          ) : (
            <p className="muted">
              {t(d.capabilities.history === 'unsupported' ? 'unsupported' : 'noData')}
            </p>
          )}
        </AnimatedHeight>
      </section>
      <div className="detail-bottom">
        <MonitorEvents detail={d} />
        <MonitorFacts detail={d} />
      </div>
    </div>
  );
}
