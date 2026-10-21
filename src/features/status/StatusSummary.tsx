import { ArrowDownWideNarrow, Check, TriangleAlert } from 'lucide-react';
import type { GroupSnapshot } from '../../shared/contracts.ts';
import { useCopy } from '../preferences/copy.ts';
import { summarize } from './selectors.ts';
import { LoadingIndicator, Skeleton } from '../../components/Loading.tsx';

export function StatusSummaryLoading() {
  const t = useCopy();
  return (
    <section className="overview overview-loading" aria-busy="true" aria-label={t('loading')}>
      <span className="status-icon">
        <LoadingIndicator />
      </span>
      <div className="overview-heading">
        <Skeleton className="skeleton-title" />
        <Skeleton className="skeleton-pin" />
      </div>
      <div className="overview-counts">
        {(['normalCount', 'faultCount', 'otherCount'] as const).map((key) => (
          <div key={key}>
            <Skeleton className="skeleton-count" />
            <small>{t(key)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
export function StatusSummary({
  snapshot,
  pinned,
  onPin,
}: {
  snapshot: GroupSnapshot;
  pinned: boolean;
  onPin: () => void;
}) {
  const t = useCopy(),
    s = summarize(snapshot),
    key = s.healthy ? 'healthy' : s.down ? 'some' : 'uncertain';
  return (
    <section className={`overview ${s.healthy ? 'ok' : ''}`} aria-label={t(key)}>
      <span className="status-icon" aria-hidden="true">
        {s.healthy ? <Check size={20} /> : <TriangleAlert size={20} />}
      </span>
      <div className="overview-heading">
        <h2 className="overview-title">{t(key)}</h2>
        <button className="pin-toggle" role="switch" aria-checked={pinned} onClick={onPin}>
          <ArrowDownWideNarrow size={13} />
          {t('pin')}
        </button>
      </div>
      <div className="overview-counts">
        {[
          ['normalCount', s.up],
          ['faultCount', s.down],
          ['otherCount', s.other],
        ].map(([key, n], i) => (
          <div key={key} className={i === 1 ? 'failure' : i === 2 ? 'unknown' : ''}>
            <strong>{n}</strong>
            <small>{t(key as 'normalCount')}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
