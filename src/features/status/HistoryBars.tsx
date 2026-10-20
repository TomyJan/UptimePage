import { useState } from 'react';
import type { HistoryBucket, Metric } from '../../shared/contracts.ts';
import { DataTooltip } from '../../components/DataTooltip.tsx';
import { usePreferences } from '../preferences/store.ts';
import { useCopy } from '../preferences/copy.ts';
import { buildHistorySegments, formatMetric } from './history.ts';
export function useFormatTime() {
  const { locale, timeZone } = usePreferences();
  return (value: string | null, full = false) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          timeZone,
          ...(full ? { month: '2-digit', day: '2-digit' } : {}),
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(value))
      : '—';
}
export function HistoryBars({ history, until }: { history: HistoryBucket[]; until: string }) {
  const t = useCopy(),
    time = useFormatTime(),
    [active, setActive] = useState(0);
  const segments = buildHistorySegments(
      history,
      new Date(Date.parse(until) - 86400000).toISOString(),
      until,
    ),
    selected = segments[Math.min(active, segments.length - 1)];
  if (!selected) return <span>{t('noData')}</span>;
  return (
    <DataTooltip
      content={
        <>
          <div className="tip-time">
            {time(selected.from, true)} – {time(selected.until, true)}
          </div>
          <div className="tip-content">
            <span>{t(selected.state)}</span>
            <span className="mono">{formatMetric(selected.responseMs, ' ms')}</span>
          </div>
        </>
      }
    >
      <div
        className="bars"
        role="slider"
        tabIndex={0}
        aria-label={`${t('checks')} · ${t('focusHistory')}`}
        aria-valuemin={0}
        aria-valuemax={segments.length - 1}
        aria-valuenow={Math.min(active, segments.length - 1)}
        aria-valuetext={`${time(selected.from)} ${t(selected.state)}`}
        onKeyDown={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            setActive((i) =>
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? segments.length - 1
                  : Math.max(
                      0,
                      Math.min(segments.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)),
                    ),
            );
          }
        }}
      >
        {segments.map((s, i) => (
          <span
            key={`${s.from}-${s.until}`}
            className={`bar ${s.state === 'no-data' || s.state === 'unknown' || s.state === 'paused' ? 'none' : s.state}`}
            style={{ flex: s.duration }}
            data-state={s.state}
            onPointerEnter={() => setActive(i)}
            onPointerDown={() => setActive(i)}
            aria-hidden="true"
          />
        ))}
      </div>
    </DataTooltip>
  );
}
export function UptimeMetric({ metric }: { metric: Metric }) {
  const t = useCopy(),
    time = useFormatTime();
  return (
    <DataTooltip
      content={
        <>
          <div className="tip-content">
            <span>{t('period')}</span>
            <span className="mono">{formatMetric(metric.value, '%')}</span>
          </div>
          <div className="tip-note">
            {metric.from && metric.until
              ? `${t('coverage')}: ${time(metric.from, true)} – ${time(metric.until, true)}`
              : t('noData')}
          </div>
          <div className="tip-note">{t(metric.basis === 'provider' ? 'provider' : 'samples')}</div>
        </>
      }
    >
      <button
        className="metric uptime"
        aria-label={`${t('periodUptime')} ${formatMetric(metric.value, '%')}`}
      >
        <strong>{formatMetric(metric.value, '%')}</strong>
        <small>{t('uptime')}</small>
      </button>
    </DataTooltip>
  );
}
