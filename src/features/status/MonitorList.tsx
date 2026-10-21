import type { MonitorSummary } from '../../shared/contracts.ts';
import { MonitorCard } from '../../components/MonitorCard.tsx';
import { useCopy } from '../preferences/copy.ts';
import { useLayoutEffect, useRef } from 'react';
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
  const list = useRef<HTMLDivElement>(null);
  const loadingHeights = useRef<number[]>([]);
  const wasLoading = useRef(loading);
  useLayoutEffect(() => {
    if (!loading) {
      wasLoading.current = false;
      return;
    }
    wasLoading.current = true;
    const measure = () => {
      loadingHeights.current = Array.from(
        list.current!.querySelectorAll('.monitor .resize-content'),
        (el) => el.getBoundingClientRect().height,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list.current!);
    return () => observer.disconnect();
  }, [loading]);
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
        ref={list}
        className="monitors"
        id="monitor-content"
        role="tabpanel"
        aria-label={t('title')}
        aria-busy={loading || refreshing}
      >
        {loading ? (
          Array.from({ length: 6 }, (_, i) => <MonitorCard key={i} until={until} />)
        ) : monitors.length ? (
          monitors.map((m, i) => (
            <MonitorCard
              key={m.id}
              monitor={m}
              until={until}
              refreshing={refreshing}
              initialHeight={
                wasLoading.current
                  ? (loadingHeights.current[i] ?? loadingHeights.current[0])
                  : undefined
              }
            />
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
