import { transition } from '../../app/transitions.ts';
import { useSnapshotRefresh } from '../refresh/useSnapshotRefresh.ts';
import { LoadNotice } from '../refresh/LoadNotice.tsx';
import { SnapshotLoadError } from '../../data/snapshot.ts';
import { errorMessage } from '../refresh/feedback.ts';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import { AnimatedHeight } from '../../components/AnimatedHeight.tsx';
import { useGroupCounts, useGroupQuery } from '../../data/hooks.ts';

import { usePublicConfig } from '../../data/config.ts';
import { useCopy } from '../preferences/copy.ts';
import { RefreshControl } from '../refresh/RefreshControl.tsx';
import { GroupTabs } from './GroupTabs.tsx';
import { StatusSummary } from './StatusSummary.tsx';
import { MonitorList } from './MonitorList.tsx';
import { selectMonitors } from './selectors.ts';
export function StatusPage() {
  const publicConfig = usePublicConfig();
  useEffect(() => setPinned(publicConfig.site.pinAbnormal), [publicConfig.site.pinAbnormal]);
  const t = useCopy(),
    [params, setParams] = useSearchParams(),
    [pinned, setPinned] = useState(publicConfig.site.pinAbnormal);
  const group = publicConfig.groups.find((g) => g.id === params.get('g')) ?? publicConfig.groups[0],
    id = group.id;
  const sub = group.subgroups.some((s) => s.id === params.get('s')) ? params.get('s')! : 'all',
    search = params.get('q') ?? '';
  const q = useGroupQuery(id),
    snapshot = q.data ?? null;
  const counts = useGroupCounts();
  const update = (patch: Record<string, string>) =>
    setParams(
      (prev) => {
        for (const [k, v] of Object.entries(patch)) v ? prev.set(k, v) : prev.delete(k);
        return prev;
      },
      { replace: true },
    );
  const refresh = useSnapshotRefresh(q, id);
  const monitors = snapshot ? selectMonitors(snapshot, sub, search, pinned) : [];
  return (
    <>
      <section className="intro">
        <h1>{t('title')}</h1>
        <RefreshControl {...refresh} />
      </section>
      <GroupTabs
        items={publicConfig.groups}
        selected={id}
        onChange={(g) => update({ g, s: '', q: '' })}
        label={t('groups')}
        counts={counts}
      />
      <AnimatedHeight
        className="status-body"
        contentKey={`${id}:${snapshot || !q.isError ? 'content' : 'error'}`}
      >
        {snapshot || !q.isError ? (
          <>
            <StatusSummary
              snapshot={snapshot}
              pinned={pinned}
              onPin={() => transition('monitor-list', () => setPinned((v) => !v))}
            />
            <LoadNotice state={refresh} group={group} snapshot={snapshot} />
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
                counts={
                  snapshot
                    ? Object.fromEntries([
                        ['all', snapshot.monitors.length],
                        ...snapshot.subgroups.map((s) => [s.id, new Set(s.monitorIds).size]),
                      ])
                    : {}
                }
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
              key={id}
              monitors={monitors}
              subgroup={sub}
              until={snapshot?.fetchedAt ?? ''}
              searching={Boolean(search.trim())}
              loading={!snapshot}
              refreshing={q.isFetching}
              failedMonitorIds={
                refresh.error instanceof SnapshotLoadError ? refresh.error.monitorIds : []
              }
            />
          </>
        ) : (
          <div className="empty">
            <p>{t('loadError')}</p>
            <p>{errorMessage(q.error, t)}</p>
            <button className="retry" disabled={refresh.busy} onClick={() => void refresh.run()}>
              {t('retry')}
            </button>
          </div>
        )}
      </AnimatedHeight>
    </>
  );
}
