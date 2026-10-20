import { ChevronDown, RefreshCw } from 'lucide-react';
import { Dropdown } from '../../components/Dropdown.tsx';
import { useCopy } from '../preferences/copy.ts';
import { setPreferences, usePreferences, type Preferences } from '../preferences/store.ts';
import { useRefresh } from './useRefresh.ts';
import { ApiClientError } from '../../data/client.ts';
export function RefreshControl({
  fetchedAt,
  refresh,
  identity,
  onResult,
  error,
  retryAt,
}: {
  fetchedAt: string | null;
  refresh: () => Promise<unknown>;
  identity: string;
  onResult?: (ok: boolean) => void;
  error?: unknown;
  retryAt?: string | null;
}) {
  const t = useCopy(),
    { preferences, timeZone, locale } = usePreferences(),
    { busy, remaining, seconds, run } = useRefresh(
      refresh,
      identity,
      [
        retryAt,
        error instanceof ApiClientError && error.code === 'rate-limited' ? error.retryAt : null,
      ]
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
    );
  const time = fetchedAt
    ? new Intl.DateTimeFormat(locale, {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(fetchedAt))
    : '—';
  return (
    <div
      className={`refresh-control ${busy ? 'is-refreshing' : ''}`}
      data-mode={seconds ? 'auto' : 'manual'}
    >
      <button
        className="refresh-main"
        aria-label={t('refresh')}
        aria-busy={busy}
        disabled={busy}
        onClick={async () => {
          const result = await run();
          if (result) onResult?.(result.ok);
        }}
      >
        <RefreshCw size={14} />
        <span className="refresh-prefix">{t(busy ? 'refreshing' : 'updated')}</span>
        <time dateTime={fetchedAt ?? undefined}>{time}</time>
        <span className="refresh-cycle">
          {busy ? '—' : seconds ? `${remaining}s` : t('manual')}
        </span>
      </button>
      <Dropdown
        className="refresh-options"
        label={t('refreshSettings')}
        value={String(preferences.refresh)}
        options={[
          { value: 'auto', label: t('siteDefault') },
          { value: '0', label: t('manual') },
          { value: '30', label: t('every30') },
          { value: '60', label: t('every60') },
          { value: '300', label: t('every300') },
        ]}
        onChange={(v) =>
          setPreferences({ refresh: (v === 'auto' ? 'auto' : Number(v)) as Preferences['refresh'] })
        }
      >
        <ChevronDown size={13} />
      </Dropdown>
    </div>
  );
}
