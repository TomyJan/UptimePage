import { CircleAlert, RefreshCw } from 'lucide-react';
import type { PublicGroup } from '../../shared/config.ts';
import type { GroupSnapshot } from '../../shared/contracts.ts';
import { SnapshotLoadError } from '../../data/snapshot.ts';
import { AnimatedHeight } from '../../components/AnimatedHeight.tsx';
import { useCopy } from '../preferences/copy.ts';
import { localize } from '../preferences/locale.ts';
import { usePreferences } from '../preferences/store.ts';
import { errorMessage } from './feedback.ts';
import type { SnapshotRefresh } from './useSnapshotRefresh.ts';

export function LoadNotice({
  state,
  group,
  snapshot,
}: {
  state: SnapshotRefresh;
  group?: PublicGroup;
  snapshot?: GroupSnapshot | null;
}) {
  const t = useCopy();
  const { locale } = usePreferences();
  const error = state.error;
  const names =
    error instanceof SnapshotLoadError
      ? [
          ...(group?.subgroups ?? [])
            .filter((subgroup) => error.subgroupIds.includes(subgroup.id))
            .map((subgroup) => localize(subgroup.name, locale)),
          ...(snapshot?.monitors ?? [])
            .filter((monitor) => error.monitorIds.includes(monitor.id))
            .map((monitor) => localize(monitor.name, locale)),
        ]
      : [];
  const targets = [...new Set(names)];
  return (
    <AnimatedHeight className="load-notice-frame" contentKey={error ? 'error' : 'clear'}>
      {error && (
        <div className="load-notice" role="status">
          <CircleAlert size={17} aria-hidden="true" />
          <div className="load-notice-copy">
            <strong>
              {t(error instanceof SnapshotLoadError ? 'partialLoadFailed' : 'refreshFailed')}
            </strong>
            {targets.length > 0 && (
              <span className="load-notice-targets">
                {targets.join(locale === 'zh-CN' ? '、' : ', ')}
              </span>
            )}
            <span>{errorMessage(error, t)}</span>
          </div>
          <button
            type="button"
            className="load-notice-retry"
            disabled={state.busy}
            onClick={() => void state.run()}
          >
            <RefreshCw size={13} aria-hidden="true" />
            {t('retry')}
          </button>
        </div>
      )}
    </AnimatedHeight>
  );
}
