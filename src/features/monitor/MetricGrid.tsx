import type { MonitorDetail } from '../../shared/contracts.ts';
import { useCopy } from '../preferences/copy.ts';
import { formatMetric } from '../status/history.ts';
import { DataTooltip } from '../../components/DataTooltip.tsx';
import { AnimatedHeight } from '../../components/AnimatedHeight.tsx';
import { useFormatTime } from '../status/HistoryBars.tsx';
export function MetricGrid({ detail: d }: { detail: MonitorDetail }) {
  const t = useCopy(),
    time = useFormatTime();
  const days =
    d.certificateExpiresAt !== null && d.capabilities.certificate === 'available'
      ? Math.ceil((Date.parse(d.certificateExpiresAt) - Date.now()) / 86400000)
      : null;
  const uptime = d.monitor.uptime24h;
  const partial =
    uptime.from !== null &&
    uptime.until !== null &&
    (Date.parse(uptime.from) > Date.parse(d.fetchedAt) - 86400000 ||
      Date.parse(uptime.until) < Date.parse(d.fetchedAt));
  return (
    <AnimatedHeight>
      <div className="detail-metrics">
        <div>
          <small>{t(partial ? 'uptime' : 'periodUptime')}</small>
          <DataTooltip
            content={
              <>
                <div>
                  {t('coverage')}: {time(uptime.from, true)} – {time(uptime.until, true)}
                </div>
                <div className="tip-note">
                  {t(uptime.basis === 'provider' ? 'provider' : 'samples')}
                </div>
              </>
            }
          >
            <button
              className="metric-detail"
              aria-label={`${t('uptime')} ${formatMetric(uptime.value, '%')}`}
            >
              <strong>{formatMetric(uptime.value, '%')}</strong>
            </button>
          </DataTooltip>
          <span>
            {t(partial ? 'partial' : uptime.basis === 'provider' ? 'provider' : 'samples')}
          </span>
        </div>
        <div>
          <small>{t('latestResponse')}</small>
          <strong>{formatMetric(d.monitor.responseMs, ' ms')}</strong>
        </div>
        <div>
          <small>{t('average')}</small>
          <DataTooltip
            content={
              <>
                <div>{t(d.averageResponse24h.basis === 'provider' ? 'provider' : 'samples')}</div>
                <div className="tip-note">
                  {time(d.averageResponse24h.from, true)} – {time(d.averageResponse24h.until, true)}
                </div>
              </>
            }
          >
            <button
              className="metric-detail"
              aria-label={`${t('average')} ${formatMetric(d.averageResponse24h.value, ' ms')}`}
            >
              <strong>{formatMetric(d.averageResponse24h.value, ' ms')}</strong>
            </button>
          </DataTooltip>
        </div>
        <div>
          <small>{t('certificate')}</small>
          <strong>{days === null ? '—' : `${days} ${t('days')}`}</strong>
          {days === null && (
            <span>
              {t(d.capabilities.certificate === 'unsupported' ? 'unsupported' : 'noData')}
            </span>
          )}
        </div>
      </div>
    </AnimatedHeight>
  );
}
