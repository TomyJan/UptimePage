import { toastStore } from '../toasts/store.ts';
import { TransitionLink } from '../../components/TransitionLink.tsx';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { Range } from '../../shared/contracts.ts';
import { publicConfig } from '../../data/config.ts';
import { useMonitorQuery } from '../../data/hooks.ts';
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
  if (!publicConfig.groups.some((g) => g.id === groupId) || denied)
    return (
      <>
        {back}
        <div className="empty">{t('notFound')}</div>
      </>
    );
  if (!q.data)
    return (
      <>
        {back}
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
  const d = q.isError
      ? { ...q.data, monitor: { ...q.data.monitor, freshness: 'stale' as const } }
      : q.data,
    name = localize(d.monitor.name, locale);
  const refresh = async () => {
    const result = await q.refetch();
    if (result.error) throw result.error;
  };
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
        <RefreshControl
          fetchedAt={d.fetchedAt}
          identity={`${groupId}:${monitorId}:${range}`}
          error={q.error}
          refresh={refresh}
          onResult={(ok) =>
            toastStore.push(
              t(ok ? 'refreshDone' : 'refreshFailed'),
              5000,
              ok ? 'success' : 'warning',
            )
          }
        />
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
        {q.isPlaceholderData ? (
          <div className="chart-loading" aria-busy="true" />
        ) : d.capabilities.response === 'available' ? (
          <ResponseChart points={d.response} animationKey={`${groupId}:${monitorId}:${range}`} />
        ) : (
          <div className="empty">
            {t(d.capabilities.response === 'unsupported' ? 'unsupported' : 'noData')}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-top">
          <h2>
            {t('checks')} <span className="muted">{t('history')}</span>
          </h2>
        </div>
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
      </section>
      <div className="detail-bottom">
        <MonitorEvents detail={d} />
        <MonitorFacts detail={d} />
      </div>
    </div>
  );
}
