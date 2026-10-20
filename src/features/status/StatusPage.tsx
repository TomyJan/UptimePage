import { transition } from '../../app/transitions.ts';
import { toastStore } from '../toasts/store.ts';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import { AnimatedHeight } from '../../components/AnimatedHeight.tsx';
import { useGroupQuery } from '../../data/hooks.ts';
import { useSnapshotExpired } from '../../data/useSnapshotExpired.ts';
import { publicConfig } from '../../data/config.ts';
import { useCopy } from '../preferences/copy.ts';
import { RefreshControl } from '../refresh/RefreshControl.tsx';
import { GroupTabs } from './GroupTabs.tsx';
import { StatusSummary } from './StatusSummary.tsx';
import { MonitorList } from './MonitorList.tsx';
import { selectMonitors } from './selectors.ts';
export function StatusPage() {
  const t = useCopy(),
    [params, setParams] = useSearchParams(),
    [pinned, setPinned] = useState(publicConfig.site.pinAbnormal);
  const group = publicConfig.groups.find((g) => g.id === params.get('g')) ?? publicConfig.groups[0],
    id = group.id;
  const sub = group.subgroups.some((s) => s.id === params.get('s')) ? params.get('s')! : 'all',
    search = params.get('q') ?? '';
  const q = useGroupQuery(id),
    expired = useSnapshotExpired(q.data?.fetchedAt ?? null),
    snapshot = q.data
      ? {
          ...q.data,
          freshness: q.isError || expired ? ('stale' as const) : q.data.freshness,
          monitors:
            q.isError || expired
              ? q.data.monitors.map((m) => ({ ...m, freshness: 'stale' as const }))
              : q.data.monitors,
        }
      : null;
  const update = (patch: Record<string, string>) =>
    setParams(
      (prev) => {
        for (const [k, v] of Object.entries(patch)) v ? prev.set(k, v) : prev.delete(k);
        return prev;
      },
      { replace: true },
    );
  const refresh = async () => {
    const result = await q.refetch();
    if (result.error) throw result.error;
  };
  const monitors = snapshot ? selectMonitors(snapshot, sub, search, pinned) : [];
  return (
    <>
      <section className="intro">
        <h1>{t('title')}</h1>
        <RefreshControl
          fetchedAt={q.data?.fetchedAt ?? null}
          identity={id}
          error={q.error}
          retryAt={snapshot?.subgroupErrors
            .flatMap((e) => (e.code === 'rate-limited' && e.retryAt ? [e.retryAt] : []))
            .sort()
            .at(-1)}
          refresh={refresh}
          onResult={(ok) =>
            toastStore.push(
              t(ok ? 'refreshDone' : 'refreshFailed'),
              5000,
              ok ? 'success' : 'warning',
            )
          }
        />
      </section>
      <GroupTabs
        items={publicConfig.groups}
        selected={id}
        onChange={(g) => update({ g, s: '', q: '' })}
        label={t('groups')}
        counts={{ [id]: snapshot?.monitors.length }}
      />
      <AnimatedHeight
        className="status-body"
        contentKey={`${id}:${snapshot ? 'loaded' : q.isError ? 'error' : 'loading'}`}
      >
        {snapshot ? (
          <>
            <StatusSummary
              snapshot={snapshot}
              pinned={pinned}
              onPin={() => transition('monitor-list', () => setPinned((v) => !v))}
            />
            {(q.isError || snapshot.freshness !== 'fresh') && (
              <p className="detail-alert" role="status">
                {t('staleNote')}
              </p>
            )}
            {snapshot.subgroupErrors.length > 0 && (
              <p className="detail-alert" role="status">
                {t('partialError')}
              </p>
            )}
            <div className="sub-row">
              <GroupTabs
                sub
                items={[
                  { id: 'all', name: { en: 'All', 'zh-CN': '全部' }, logo: null },
                  ...group.subgroups,
                ]}
                selected={sub}
                onChange={(s) => transition('monitor-list', () => update({ s }))}
                label={t('subgroups')}
                counts={Object.fromEntries([
                  ['all', snapshot.monitors.length],
                  ...snapshot.subgroups.map((s) => [s.id, new Set(s.monitorIds).size]),
                ])}
              />
              <label className="search">
                <Search size={14} />
                <input
                  type="search"
                  value={search}
                  aria-label={t('search')}
                  placeholder={t('search')}
                  onChange={(e) => update({ q: e.target.value })}
                />
              </label>
            </div>
            <MonitorList
              monitors={monitors}
              until={snapshot.fetchedAt}
              searching={Boolean(search.trim())}
            />
          </>
        ) : q.isError ? (
          <div className="empty">
            <p>{t('loadError')}</p>
            <button className="retry" onClick={() => void refresh().catch(() => {})}>
              {t('retry')}
            </button>
          </div>
        ) : (
          <div className="skeleton" aria-busy="true">
            <div />
            <div />
            <div />
          </div>
        )}
      </AnimatedHeight>
    </>
  );
}
