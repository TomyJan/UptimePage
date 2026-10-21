import type { ReactNode } from 'react';
import type { MonitorDetail, Range } from '../../shared/contracts.ts';
import { AnimatedHeight } from '../../components/AnimatedHeight.tsx';
import { MetricGrid } from './MetricGrid.tsx';
import { MonitorEvents } from './MonitorEvents.tsx';
import { MonitorFacts } from './MonitorFacts.tsx';
import { ArrowLeft } from 'lucide-react';
import { TransitionLink } from '../../components/TransitionLink.tsx';
import { ChartLoading, HistoryLoading, Skeleton } from '../../components/Loading.tsx';
import { useCopy } from '../preferences/copy.ts';

/** The lazy-module fallback and first data request share the detail page's layout. */
export function MonitorLayout({
  back,
  refreshControl,
  heading,
  detail,
  range = '24h',
  rangeLoading = false,
  rangeError = false,
  refreshing = false,
  tabs,
  chart,
  chartState = 'loading',
  history,
  historyState = 'loading',
}: {
  back?: ReactNode;
  refreshControl?: ReactNode;
  heading?: ReactNode;
  detail?: MonitorDetail;
  range?: Range;
  rangeLoading?: boolean;
  rangeError?: boolean;
  refreshing?: boolean;
  tabs?: ReactNode;
  chart?: ReactNode;
  chartState?: string;
  history?: ReactNode;
  historyState?: string;
}) {
  const t = useCopy();
  return (
    <div className={`detail-content ${detail ? '' : 'detail-loading'}`}>
      {back ?? (
        <TransitionLink className="back" to="/">
          <ArrowLeft size={14} />
          {t('back')}
        </TransitionLink>
      )}
      <AnimatedHeight>
        <section className="detail-heading" aria-busy={!detail}>
          {heading ?? (
            <>
              <div className="detail-title">
                <Skeleton className="service-logo" />
                <div>
                  <h1>
                    <Skeleton className="skeleton-title" />
                  </h1>
                </div>
              </div>
              <Skeleton className="skeleton-badge" />
              {refreshControl ?? <Skeleton className="skeleton-refresh" />}
            </>
          )}
        </section>
      </AnimatedHeight>
      <MetricGrid
        detail={detail}
        loadingRange={rangeLoading ? range : undefined}
        refreshing={refreshing}
      />
      <section
        className="panel chart-panel loading-surface"
        aria-busy={!detail || rangeLoading || refreshing}
      >
        <div className="panel-top">
          <h2>
            {t('response')} <span className="muted mono">ms</span>
          </h2>
          {tabs ?? (
            <div className="window-tabs" aria-label={t('response')}>
              {['24h', '7d', '30d'].map((range) => (
                <button
                  key={range}
                  disabled
                  aria-pressed={range === '24h'}
                  className={range === '24h' ? 'active' : ''}
                >
                  {range}
                </button>
              ))}
            </div>
          )}
        </div>
        <AnimatedHeight className="chart-body" contentKey={`${range}:${chartState}`}>
          {chart ?? <ChartLoading />}
        </AnimatedHeight>
      </section>
      <section
        className="panel checks-panel loading-surface"
        aria-busy={!detail || rangeLoading || refreshing}
      >
        <div className="panel-top">
          <h2>
            {t('checks')} <span className="muted">{range}</span>
          </h2>
        </div>
        <AnimatedHeight contentKey={`${range}:${historyState}`}>
          {history ?? <HistoryLoading />}
        </AnimatedHeight>
      </section>
      <div className="detail-bottom">
        <MonitorEvents
          detail={detail}
          loading={rangeLoading}
          error={rangeError}
          refreshing={refreshing}
        />
        <MonitorFacts detail={detail} refreshing={refreshing} />
      </div>
    </div>
  );
}

export function MonitorLoading() {
  return <MonitorLayout />;
}
