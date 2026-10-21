import type { ReactNode } from 'react';
import { rangeMilliseconds } from '../../shared/ranges.ts';
import type { MonitorDetail, Range } from '../../shared/contracts.ts';
import { Skeleton } from '../../components/Loading.tsx';
import { useCopy } from '../preferences/copy.ts';
import { formatMetric } from '../status/history.ts';
import { DataTooltip } from '../../components/DataTooltip.tsx';
import { AnimatedHeight } from '../../components/AnimatedHeight.tsx';
import { useFormatTime } from '../status/HistoryBars.tsx';
export function MetricGrid({
  detail: d,
  loadingRange,
  refreshing = false,
}: {
  detail?: MonitorDetail;
  loadingRange?: Range;
  refreshing?: boolean;
}) {
  const t = useCopy(),
    time = useFormatTime();
  const days =
    d && d.certificateExpiresAt !== null && d.capabilities.certificate === 'available'
      ? Math.ceil((Date.parse(d.certificateExpiresAt) - Date.now()) / 86400000)
      : null;
  const uptime = d?.periodUptime ?? {
    value: null,
    from: null,
    until: null,
    basis: 'provider' as const,
  };
  const partial =
    d &&
    uptime &&
    uptime.from !== null &&
    uptime.until !== null &&
    (Date.parse(uptime.from) > Date.parse(d.fetchedAt) - rangeMilliseconds(d.range) ||
      Date.parse(uptime.until) < Date.parse(d.fetchedAt));
  return (
    <div className="detail-metrics">
      <MetricCard
        busy={!d || Boolean(loadingRange) || refreshing}
        state={!d || loadingRange ? 'loading' : 'loaded'}
      >
        <small>
          {loadingRange ?? d?.range ?? '24h'} {t('uptime')}
        </small>
        {!d || loadingRange ? (
          <strong>
            <Skeleton className="skeleton-value" />
          </strong>
        ) : (
          <DataTooltip
            content={
              <>
                <div>
                  {t('coverage')}: {time(uptime.from, true)} – {time(uptime.until, true)}
                </div>
                <div className="tip-note">
                  {t(uptime.basis === 'provider' ? 'provider' : 'samples')}
                </div>
              </>
            }
          >
            <button
              className="metric-detail"
              aria-label={`${t('uptime')} ${formatMetric(uptime.value, '%')}`}
            >
              <strong>{formatMetric(uptime.value, '%')}</strong>
            </button>
          </DataTooltip>
        )}
        <span className="metric-note">
          {!d || loadingRange ? (
            <Skeleton className="skeleton-caption" />
          ) : (
            t(partial ? 'partial' : uptime.basis === 'provider' ? 'provider' : 'samples')
          )}
        </span>
      </MetricCard>
      <MetricCard busy={!d || refreshing} state={d ? 'loaded' : 'loading'}>
        <small>{t('latestResponse')}</small>
        <strong>
          {d ? formatMetric(d.monitor.responseMs, ' ms') : <Skeleton className="skeleton-value" />}
        </strong>
        {!d ? (
          <span className="metric-note">
            <Skeleton className="skeleton-caption" />
          </span>
        ) : (
          d.monitor.responseMs !== null &&
          d.monitor.observedAt !== null && (
            <span className="metric-note">
              <time dateTime={d.monitor.observedAt ?? undefined}>
                {time(d.monitor.observedAt, true)}
              </time>
            </span>
          )
        )}
      </MetricCard>
      <MetricCard
        busy={!d || Boolean(loadingRange) || refreshing}
        state={!d || loadingRange ? 'loading' : 'loaded'}
      >
        <small>
          {loadingRange ?? d?.range ?? '24h'} {t('average')}
        </small>
        {!d || loadingRange ? (
          <strong>
            <Skeleton className="skeleton-value" />
          </strong>
        ) : (
          <DataTooltip
            content={
              <>
                <div>{t(d.averageResponse.basis === 'provider' ? 'provider' : 'samples')}</div>
                <div className="tip-note">
                  {time(d.averageResponse.from, true)} – {time(d.averageResponse.until, true)}
                </div>
              </>
            }
          >
            <button
              className="metric-detail"
              aria-label={`${t('average')} ${formatMetric(d.averageResponse.value, ' ms')}`}
            >
              <strong>{formatMetric(d.averageResponse.value, ' ms')}</strong>
            </button>
          </DataTooltip>
        )}
      </MetricCard>
      <MetricCard busy={!d || refreshing} state={d ? 'loaded' : 'loading'}>
        <small>{t('certificate')}</small>
        <strong>
          {!d ? (
            <Skeleton className="skeleton-value" />
          ) : d.capabilities.certificate === 'unsupported' ? (
            t('unsupported')
          ) : days === null ? (
            '—'
          ) : Date.parse(d.certificateExpiresAt!) <= Date.now() ? (
            t('expired')
          ) : (
            `${days} ${t('days')}`
          )}
        </strong>
        {d && days === null && d.capabilities.certificate !== 'unsupported' && (
          <span className="metric-note">{t('noData')}</span>
        )}
        {d && days !== null && (
          <span className="metric-note">
            {t('expiresAt')}{' '}
            <time dateTime={d.certificateExpiresAt!}>{time(d.certificateExpiresAt, true)}</time>
          </span>
        )}
      </MetricCard>
    </div>
  );
}

function MetricCard({
  children,
  busy,
  state,
}: {
  children: ReactNode;
  busy: boolean;
  state: string;
}) {
  return (
    <div className="loading-surface" aria-busy={busy}>
      <AnimatedHeight contentKey={state}>{children}</AnimatedHeight>
    </div>
  );
}
