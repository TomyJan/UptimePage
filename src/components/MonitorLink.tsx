import { ExternalLink } from 'lucide-react';
import { DataTooltip } from './DataTooltip.tsx';
import { usePublicConfig } from '../data/config.ts';
import { useCopy } from '../features/preferences/copy.ts';
import { monitorLinkVisible, normalizeMonitorUrl } from '../shared/monitor-links.ts';
import type { MonitorSummary } from '../shared/contracts.ts';

export function MonitorLink({
  monitor,
  name,
  subgroup = 'all',
}: {
  monitor: Pick<MonitorSummary, 'url' | 'groupId' | 'subgroupIds'>;
  name: string;
  subgroup?: string;
}) {
  const config = usePublicConfig(),
    t = useCopy();
  const group = config.groups.find((g) => g.id === monitor.groupId);
  const url = normalizeMonitorUrl(monitor.url);
  if (
    !group ||
    !url ||
    !monitorLinkVisible(group, monitor.subgroupIds, subgroup, config.site.showLinks)
  )
    return null;
  return (
    <DataTooltip
      toggleOnClick={false}
      content={
        <>
          <div className="tip-content">
            <span>{t('openWebsite')}</span>
            <ExternalLink size={12} aria-hidden="true" />
          </div>
          <div className="monitor-link-host">{new URL(url).host}</div>
        </>
      }
    >
      <a
        className="monitor-visit"
        href={url}
        target="_blank"
        rel="noopener"
        aria-label={`${t('openWebsite')}: ${name} (${t('opensNewTab')})`}
      >
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </DataTooltip>
  );
}
