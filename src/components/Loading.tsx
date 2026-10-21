import { LoaderCircle } from 'lucide-react';
import { useCopy } from '../features/preferences/copy.ts';

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton-piece ${className}`} aria-hidden="true" />;
}

export function LoadingIndicator() {
  const t = useCopy();
  return (
    <span className="loading-indicator" role="status">
      <LoaderCircle size={20} className="loading-spinner" aria-hidden="true" />
      <span className="sr-only">{t('loading')}</span>
    </span>
  );
}

export function ChartLoading() {
  return (
    <div className="chart-loading">
      <div className="loading-plot">
        <LoadingIndicator />
      </div>
      <div className="chart-labels">
        <Skeleton />
        <Skeleton />
      </div>
    </div>
  );
}

export function HistoryLoading({ labels = true }: { labels?: boolean }) {
  const t = useCopy();
  return (
    <div className="history-loading">
      <div className="history-loading-track" aria-hidden="true">
        {Array.from({ length: 48 }, (_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
      {labels && (
        <div className="history-meta">
          <Skeleton /> <span>{t('now')}</span>
        </div>
      )}
    </div>
  );
}

export function EventsLoading() {
  return (
    <div className="events-empty">
      <LoadingIndicator />
      <Skeleton className="skeleton-caption" />
    </div>
  );
}
