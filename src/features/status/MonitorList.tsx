import type { MonitorSummary } from '../../shared/contracts.ts';
import { MonitorCard } from '../../components/MonitorCard.tsx';
import { useCopy } from '../preferences/copy.ts';
export function MonitorList({
  monitors,
  until,
  searching,
}: {
  monitors: MonitorSummary[];
  until: string;
  searching: boolean;
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
      <div className="monitors" id="monitor-content" role="tabpanel" aria-label={t('title')}>
        {monitors.length ? (
          monitors.map((m) => <MonitorCard key={m.id} monitor={m} until={until} />)
        ) : (
          <div className="empty">{t(searching ? 'noResults' : 'empty')}</div>
        )}
      </div>
      <span className="sr-only" role="status">
        {monitors.length}
      </span>
    </>
  );
}
