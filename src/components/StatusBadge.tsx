import type { Freshness, MonitorState } from '../shared/contracts.ts';
import { useCopy } from '../features/preferences/copy.ts';
export function StatusBadge({ state }: { state: MonitorState; freshness: Freshness }) {
  const t = useCopy(),
    key = state;
  return (
    <span className={`state ${key}`}>
      <i className="dot" aria-hidden="true" />
      {t(key)}
    </span>
  );
}
