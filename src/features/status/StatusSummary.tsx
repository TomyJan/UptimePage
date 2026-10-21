import { ArrowDownWideNarrow, Check, TriangleAlert } from 'lucide-react';
import type { GroupSnapshot } from '../../shared/contracts.ts';
import { useCopy } from '../preferences/copy.ts';
import { summarize } from './selectors.ts';
import { LoadingIndicator, Skeleton } from '../../components/Loading.tsx';
import { AnimatedHeight } from '../../components/AnimatedHeight.tsx';

export function StatusSummary({
  snapshot,
  pinned,
  onPin,
}: {
  snapshot: GroupSnapshot | null;
  pinned: boolean;
  onPin: () => void;
}) {
  const t = useCopy();
  const s = snapshot ? summarize(snapshot) : null;
  const key = !s ? 'loading' : s.healthy ? 'healthy' : s.down ? 'some' : 'uncertain';
  return (
    <section
      className={`overview ${!s ? 'overview-loading' : s.healthy ? 'ok' : ''}`}
      aria-label={t(key)}
      aria-busy={!s}
    >
      <AnimatedHeight>
        <div className="overview-content">
          <span className="status-icon">
            {!s ? (
              <LoadingIndicator />
            ) : s.healthy ? (
              <Check size={20} aria-hidden="true" />
            ) : (
              <TriangleAlert size={20} aria-hidden="true" />
            )}
          </span>
          <div className="overview-heading">
            {s ? (
              <h2 className="overview-title">{t(key)}</h2>
            ) : (
              <Skeleton className="skeleton-title" />
            )}
            <button className="pin-toggle" role="switch" aria-checked={pinned} onClick={onPin}>
              <ArrowDownWideNarrow size={13} />
              {t('pin')}
            </button>
          </div>
          <div className="overview-counts">
            {(['normalCount', 'faultCount', 'otherCount'] as const).map((label, i) => (
              <div key={label} className={i === 1 ? 'failure' : i === 2 ? 'unknown' : ''}>
                {s ? (
                  <strong>{[s.up, s.down, s.other][i]}</strong>
                ) : (
                  <Skeleton className="skeleton-count" />
                )}
                <small>{t(label)}</small>
              </div>
            ))}
          </div>
        </div>
      </AnimatedHeight>
    </section>
  );
}
