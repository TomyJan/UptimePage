import { rangeMilliseconds } from '../../shared/ranges.ts';
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
  const uptime = d.periodUptime;
  const partial =
    uptime.from !== null &&
    uptime.until !== null &&
    (Date.parse(uptime.from) > Date.parse(d.fetchedAt) - rangeMilliseconds(d.range) ||
      Date.parse(uptime.until) < Date.parse(d.fetchedAt));
  return (
    <AnimatedHeight>
      <div className="detail-metrics">
        <div>
          <small>
            {d.range} {t('uptime')}
          </small>
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
          <span>
            <time dateTime={d.monitor.observedAt ?? undefined}>
              {time(d.monitor.observedAt, true)}
            </time>
          </span>
        </div>
        <div>
          <small>
            {d.range} {t('average')}
          </small>
          <DataTooltip
            content={
              <>
                <div>{t(d.averageResponse.basis === 'provider' ? 'provider' : 'samples')}</div>
                <div className="tip-note">
                  {time(d.averageResponse.from, true)} – {time(d.averageResponse.until, true)}
                </div>
              </>
            }
          >
            <button
              className="metric-detail"
              aria-label={`${t('average')} ${formatMetric(d.averageResponse.value, ' ms')}`}
            >
              <strong>{formatMetric(d.averageResponse.value, ' ms')}</strong>
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
