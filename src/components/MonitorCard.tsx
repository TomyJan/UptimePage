import { TransitionLink } from './TransitionLink.tsx';
import { Link, useLocation } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { MonitorSummary } from '../shared/contracts.ts';
import { Logo } from './Logo.tsx';
import { StatusBadge } from './StatusBadge.tsx';
import { localize } from '../features/preferences/locale.ts';
import { usePreferences } from '../features/preferences/store.ts';
import { useCopy } from '../features/preferences/copy.ts';
import { HistoryBars, UptimeMetric } from '../features/status/HistoryBars.tsx';
import { formatMetric } from '../features/status/history.ts';
export function MonitorCard({ monitor: m, until }: { monitor: MonitorSummary; until: string }) {
  const { locale } = usePreferences(),
    t = useCopy(),
    location = useLocation(),
    name = localize(m.name, locale);
  return (
    <article className="monitor" data-status={m.state}>
      <TransitionLink
        className="monitor-identity card-link"
        to={`/services/${encodeURIComponent(m.groupId)}/${encodeURIComponent(m.id)}`}
        state={{ returnTo: location.pathname + location.search }}
        aria-label={name}
      >
        <Logo src={m.logo} name={name} className="service-logo" />
        <div className="identity-text">
          <div className="monitor-name">{name}</div>
          {m.description && (
            <div className="monitor-description">{localize(m.description, locale)}</div>
          )}
        </div>
      </TransitionLink>
      <StatusBadge state={m.state} freshness={m.freshness} />
      <div className="history">
        <HistoryBars history={m.history} until={until} />
      </div>
      <UptimeMetric metric={m.uptime24h} />
      <div className="metric latency">
        <strong>{formatMetric(m.responseMs, ' ms')}</strong>
        <small>{t('response')}</small>
      </div>
      <ChevronRight size={14} className="arrow" aria-hidden="true" />
    </article>
  );
}
