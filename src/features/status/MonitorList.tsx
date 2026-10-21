import type { MonitorSummary } from '../../shared/contracts.ts';
import { MonitorCard } from '../../components/MonitorCard.tsx';
import { useCopy } from '../preferences/copy.ts';
import { HistoryLoading, Skeleton } from '../../components/Loading.tsx';
export function MonitorList({
  monitors,
  until,
  searching,
  loading = false,
  refreshing = false,
}: {
  monitors: MonitorSummary[];
  until: string;
  searching: boolean;
  loading?: boolean;
  refreshing?: boolean;
}) {
  const t = useCopy();
  return (
    <>
      <div className="column-head" aria-hidden="true">
        <span />
        <span>{t('title')}</span>
        <span className="legend">
          {t('history')}
          <i />
          <i className="bad" />
          <i className="none" />
        </span>
        <span>{t('uptime')}</span>
        <span>{t('response')}</span>
        <span />
      </div>
      <div
        className="monitors"
        id="monitor-content"
        role="tabpanel"
        aria-label={t('title')}
        aria-busy={loading || refreshing}
      >
        {loading ? (
          Array.from({ length: 6 }, (_, i) => (
            <article className="monitor monitor-loading" key={i} aria-hidden="true">
              <div className="monitor-identity">
                <Skeleton className="service-logo" />
                <div className="identity-text">
                  <Skeleton className="skeleton-name" />
                </div>
              </div>
              <Skeleton className="state skeleton-badge" />
              <div className="history">
                <HistoryLoading labels={false} />
              </div>
              <div className="metric uptime">
                <Skeleton />
              </div>
              <div className="metric latency">
                <Skeleton />
                <small>{t('response')}</small>
              </div>
              <span className="arrow" />
            </article>
          ))
        ) : monitors.length ? (
          monitors.map((m) => (
            <MonitorCard key={m.id} monitor={m} until={until} refreshing={refreshing} />
          ))
        ) : (
          <div className="empty">{t(searching ? 'noResults' : 'empty')}</div>
        )}
      </div>
      <span className="sr-only" role="status">
        {loading ? t('loading') : monitors.length}
      </span>
    </>
  );
}
