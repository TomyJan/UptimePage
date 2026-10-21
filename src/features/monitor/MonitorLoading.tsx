import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { TransitionLink } from '../../components/TransitionLink.tsx';
import {
  ChartLoading,
  EventsLoading,
  HistoryLoading,
  Skeleton,
} from '../../components/Loading.tsx';
import { useCopy } from '../preferences/copy.ts';

/** The lazy-module fallback and first data request share the detail page's layout. */
export function MonitorLoading({
  back,
  refreshControl,
}: {
  back?: ReactNode;
  refreshControl?: ReactNode;
}) {
  const t = useCopy();
  return (
    <div className="detail-content detail-loading">
      {back ?? (
        <TransitionLink className="back" to="/">
          <ArrowLeft size={14} />
          {t('back')}
        </TransitionLink>
      )}
      <section className="detail-heading" aria-busy="true" aria-label={t('loading')}>
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
      </section>
      <div className="detail-metrics">
        {[`24h ${t('uptime')}`, t('latestResponse'), `24h ${t('average')}`, t('certificate')].map(
          (label, i) => (
            <div key={label} aria-busy="true">
              <small>{label}</small>
              <strong>
                <Skeleton className="skeleton-value" />
              </strong>
              {i < 2 && (
                <span>
                  <Skeleton className="skeleton-caption" />
                </span>
              )}
            </div>
          ),
        )}
      </div>
      <section className="panel chart-panel" aria-busy="true">
        <div className="panel-top">
          <h2>
            {t('response')} <span className="muted mono">ms</span>
          </h2>
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
        </div>
        <div className="chart-body">
          <ChartLoading />
        </div>
      </section>
      <section className="panel checks-panel" aria-busy="true">
        <div className="panel-top">
          <h2>
            {t('checks')} <span className="muted">24h</span>
          </h2>
        </div>
        <HistoryLoading />
      </section>
      <div className="detail-bottom">
        <section className="panel events-panel" aria-busy="true">
          <div className="panel-top">
            <h2>{t('events')}</h2>
          </div>
          <EventsLoading />
        </section>
        <section className="panel" aria-busy="true">
          <div className="panel-top">
            <h2>{t('information')}</h2>
          </div>
          <dl className="facts">
            {(['type', 'interval', 'source', 'lastCheck'] as const).map((key) => (
              <div className="loading-fact" key={key}>
                <dt>{t(key)}</dt>
                <dd>
                  <Skeleton />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
