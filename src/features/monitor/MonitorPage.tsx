import { rangeMilliseconds } from '../../shared/ranges.ts';
import { useRefreshFeedback } from '../refresh/useRefreshFeedback.ts';
import { errorMessage } from '../refresh/feedback.ts';
import { TransitionLink } from '../../components/TransitionLink.tsx';
import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { DataTooltip } from '../../components/DataTooltip.tsx';
import type { MonitorDetail, Range } from '../../shared/contracts.ts';
import { publicConfig } from '../../data/config.ts';
import { useMonitorQuery } from '../../data/hooks.ts';

import { ApiClientError } from '../../data/client.ts';
import { Logo } from '../../components/Logo.tsx';
import { StatusBadge } from '../../components/StatusBadge.tsx';
import { localize } from '../preferences/locale.ts';
import { usePreferences } from '../preferences/store.ts';
import { useCopy } from '../preferences/copy.ts';
import { RefreshControl } from '../refresh/RefreshControl.tsx';
import { HistoryBars, useFormatTime } from '../status/HistoryBars.tsx';
import { ResponseChart } from './ResponseChart.tsx';
import { MonitorLayout } from './MonitorLayout.tsx';
import { ChartLoading, HistoryLoading } from '../../components/Loading.tsx';
export function MonitorPage() {
  const { groupId = '', monitorId = '' } = useParams();
  return <MonitorContent key={`${groupId}:${monitorId}`} groupId={groupId} monitorId={monitorId} />;
}
function MonitorContent({ groupId, monitorId }: { groupId: string; monitorId: string }) {
  const time = useFormatTime();
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

  const refresh = useRefreshFeedback(async () => {
    const result = await q.refetch();
    if (result.error) throw result.error;
    const data = result.data;
    if (data && (data.diagnostic || data.monitor.freshness !== 'fresh'))
      throw new ApiClientError(
        data.diagnostic?.status === 429 ? 'rate-limited' : 'unavailable',
        data.retryAt ?? null,
        data.diagnostic,
      );
  }, `${groupId}:${monitorId}:${range}`);
  const refreshControl = (
    <RefreshControl
      fetchedAt={
        data && !data.diagnostic && data.monitor.freshness === 'fresh' ? data.fetchedAt : null
      }
      identity={`${groupId}:${monitorId}:${range}`}
      error={q.error}
      retryAt={data?.retryAt}
      refresh={refresh}
    />
  );
  if (!publicConfig.groups.some((g) => g.id === groupId) || denied)
    return (
      <>
        {back}
        <div className="empty">{t('notFound')}</div>
      </>
    );
  if (!data && q.isError)
    return (
      <>
        {back}
        <section className="intro">{refreshControl}</section>
        <div className="empty">
          <p>{t('loadError')}</p>
          <p>{errorMessage(q.error, t)}</p>
          <button className="retry" onClick={() => void refresh().catch(() => {})}>
            {t('retry')}
          </button>
        </div>
      </>
    );
  const d = data,
    windowFrom = data
      ? new Date(Date.parse(data.fetchedAt) - rangeMilliseconds(data.range)).toISOString()
      : '',
    name = d ? localize(d.monitor.name, locale) : '';
  const rangeError = q.isError && (!q.data || data?.range !== range);
  const rangeLoading = !rangeError && (q.isPlaceholderData || data?.range !== range);
  const chartState = rangeError
    ? 'error'
    : rangeLoading
      ? 'loading'
      : (d?.capabilities.response ?? 'loading');
  return (
    <MonitorLayout
      back={back}
      refreshControl={refreshControl}
      detail={d ?? undefined}
      range={range}
      rangeLoading={rangeLoading}
      rangeError={rangeError}
      refreshing={q.isFetching}
      heading={
        d ? (
          <>
            <div className="detail-title">
              <Logo src={d.monitor.logo} name={name} className="service-logo" />
              <div>
                <h1>{name}</h1>
                {d.monitor.description && <p>{localize(d.monitor.description, locale)}</p>}
              </div>
            </div>
            <StatusBadge state={d.monitor.state} freshness={d.monitor.freshness} />
            {refreshControl}
          </>
        ) : undefined
      }
      tabs={
        d ? (
          <div className="window-tabs" aria-label={t('response')}>
            {(['24h', '7d', '30d'] as Range[]).map((r) => {
              const supported = d.supportedRanges.includes(r);
              const button = (
                <button
                  key={r}
                  aria-pressed={r === range}
                  aria-disabled={!supported}
                  className={r === range ? 'active' : ''}
                  onClick={() => supported && setRange(r)}
                  aria-label={r}
                >
                  {r}
                </button>
              );
              return supported ? (
                button
              ) : (
                <DataTooltip key={r} content={t('rangeUnsupported')}>
                  {button}
                </DataTooltip>
              );
            })}
          </div>
        ) : undefined
      }
      chartState={chartState}
      chart={
        chartState === 'error' ? (
          <div className="empty" role="status">
            <p>{t('loadError')}</p>
            <p>{errorMessage(q.error, t)}</p>
            <button className="retry" onClick={() => void refresh().catch(() => {})}>
              {t('retry')}
            </button>
          </div>
        ) : chartState === 'loading' ? (
          <ChartLoading />
        ) : chartState === 'available' && d ? (
          <ResponseChart
            points={d.response}
            from={windowFrom}
            until={d.fetchedAt}
            animationKey={`${groupId}:${monitorId}:${range}`}
          />
        ) : (
          <div className="empty">
            {t(d?.capabilities.response === 'unsupported' ? 'unsupported' : 'noData')}
          </div>
        )
      }
      historyState={
        rangeLoading ? 'loading' : rangeError ? 'error' : (d?.capabilities.history ?? 'loading')
      }
      history={
        rangeLoading ? (
          <HistoryLoading />
        ) : rangeError ? (
          <p className="muted" role="status">
            {t('loadError')}
          </p>
        ) : d && d.capabilities.history === 'available' ? (
          <>
            <HistoryBars
              history={d.monitor.history}
              from={windowFrom}
              until={d.fetchedAt}
              sampleIntervalSeconds={d.monitor.sampleIntervalSeconds}
            />
            <div className="history-meta">
              <span>{time(windowFrom, true)}</span>
              <span>{t('now')}</span>
            </div>
          </>
        ) : (
          <p className="muted">
            {t(d?.capabilities.history === 'unsupported' ? 'unsupported' : 'noData')}
          </p>
        )
      }
    />
  );
}
