import { expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { loadMonitor, loadGroup } from '../../src/data/loaders.ts';
import { monitorKey, groupKey } from '../../src/data/queries.ts';
import { ApiClientError } from '../../src/data/client.ts';
import { detailFixture, groupFixture } from '../../src/demo/fixtures.ts';
import { publicConfig } from '../../src/data/config.ts';

it('validates and caches preview snapshots against the supplied configuration version', async () => {
  const cache = new QueryClient();
  const data = { ...groupFixture('core'), configVersion: 'preview-version' };
  const client: ApiClient = {
    getGroup: async () => data,
    getMonitor: async () => {
      throw new Error('unused');
    },
  };
  const result = await loadGroup(
    cache,
    client,
    'core',
    new AbortController().signal,
    'preview-version',
  );
  expect(result.configVersion).toBe('preview-version');
});
import type { ApiClient, GroupSnapshot } from '../../src/shared/contracts.ts';
it('updates an incomplete snapshot with newer partial states and recovered members', async () => {
  const cache = new QueryClient();
  const key = groupKey(publicConfig.configVersion, 'core');
  const initial = groupFixture('core', 1);
  initial.freshness = 'stale';
  initial.subgroupErrors = [{ subgroupId: 'api', code: 'unavailable' }];
  cache.setQueryData(key, initial);
  const next = groupFixture('core', 2, Date.parse(initial.fetchedAt) + 60000);
  next.freshness = 'stale';
  next.monitors[0].state = 'down';
  next.subgroupErrors = [
    { subgroupId: 'infra', code: 'rate-limited', retryAt: '2026-10-21T12:10:00Z' },
  ];
  const client = { getGroup: async () => next } as unknown as ApiClient;
  const result = await cache.fetchQuery({
    queryKey: key,
    queryFn: ({ signal }) => loadGroup(cache, client, 'core', signal),
  });
  expect(result.monitors.map((m) => [m.id, m.state])).toEqual([
    ['m1', 'down'],
    ['m2', 'down'],
  ]);
  expect(result.freshness).toBe('stale');
  expect(result.subgroupErrors).toEqual(next.subgroupErrors);
  expect(cache.getQueryData<GroupSnapshot>(key)?.fetchedAt).toBe('2026-10-21T12:01:00.000Z');
  cache.clear();
});

it('does not replace newer partial observations with an older partial response', async () => {
  const cache = new QueryClient();
  const initial = { ...groupFixture('core', 2), freshness: 'stale' as const };
  cache.setQueryData(groupKey(publicConfig.configVersion, 'core'), initial);
  const older = {
    ...groupFixture('core', 1),
    freshness: 'stale' as const,
    fetchedAt: '2026-10-21T11:59:00Z',
  };
  await expect(
    loadGroup(
      cache,
      { getGroup: async () => older } as unknown as ApiClient,
      'core',
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(cache.getQueryData(groupKey(publicConfig.configVersion, 'core'))).toEqual(initial);
  cache.clear();
});

it('keeps a complete snapshot and its timestamp with partial retry feedback', async () => {
  const cache = new QueryClient();
  const key = groupKey(publicConfig.configVersion, 'core');
  const initial = groupFixture('core', 2);
  cache.setQueryData(key, initial);
  const next = {
    ...groupFixture('core', 1),
    freshness: 'stale' as const,
    fetchedAt: '2026-10-21T12:01:00Z',
    subgroupErrors: [
      {
        subgroupId: 'api',
        code: 'rate-limited' as const,
        retryAt: '2026-10-21T12:10:00Z',
        diagnostic: { reason: 'upstream-http' as const, status: 429 },
      },
    ],
  };
  await expect(
    loadGroup(
      cache,
      { getGroup: async () => next } as unknown as ApiClient,
      'core',
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({
    code: 'rate-limited',
    retryAt: '2026-10-21T12:10:00Z',
    diagnostic: { status: 429 },
  });
  expect(cache.getQueryData(key)).toEqual(initial);
  cache.clear();
});

it('clears revoked details while accepting progress after an incomplete snapshot', async () => {
  const cache = new QueryClient();
  const v = publicConfig.configVersion;
  const initial = { ...groupFixture('core', 2), freshness: 'stale' as const };
  cache.setQueryData(groupKey(v, 'core'), initial);
  cache.setQueryData(monitorKey(v, 'core', 'm1', '24h'), detailFixture('core', 'm1', '24h'));
  const next = {
    ...initial,
    fetchedAt: '2026-10-21T12:01:00Z',
    revokedMonitorIds: ['m1'],
    monitors: initial.monitors.slice(1),
    subgroups: initial.subgroups.map((s) => ({
      ...s,
      monitorIds: s.monitorIds.filter((id) => id !== 'm1'),
    })),
  };
  const result = await loadGroup(
    cache,
    { getGroup: async () => next } as unknown as ApiClient,
    'core',
    new AbortController().signal,
  );
  expect(result.monitors.map((m) => m.id)).toEqual(['m2']);
  expect(result.subgroups.flatMap((s) => s.monitorIds)).not.toContain('m1');
  expect(cache.getQueryData(monitorKey(v, 'core', 'm1', '24h'))).toBeUndefined();
  cache.clear();
});

it('revokes cached details for every range only within the denied group', async () => {
  const cache = new QueryClient(),
    v = publicConfig.configVersion;
  cache.setQueryData(monitorKey(v, 'core', 'm1', '24h'), detailFixture('core', 'm1', '24h'));
  cache.setQueryData(monitorKey(v, 'core', 'm1', '7d'), detailFixture('core', 'm1', '7d'));
  cache.setQueryData(
    monitorKey(v, 'external', 'm1', '24h'),
    detailFixture('external', 'm1', '24h'),
  );
  const client = {
    getMonitor: async () => {
      throw new ApiClientError('not-found');
    },
  } as unknown as ApiClient;
  await expect(
    loadMonitor(cache, client, 'core', 'm1', '24h', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'not-found' });
  expect(cache.getQueryData(monitorKey(v, 'core', 'm1', '24h'))).toBeUndefined();
  expect(cache.getQueryData(monitorKey(v, 'core', 'm1', '7d'))).toBeUndefined();
  expect(cache.getQueryData(monitorKey(v, 'external', 'm1', '24h'))).toBeDefined();
  cache.clear();
});

it('revokes summary and subgroup references only in the denied group', async () => {
  const cache = new QueryClient(),
    v = publicConfig.configVersion;
  cache.setQueryData(groupKey(v, 'core'), groupFixture('core'));
  cache.setQueryData(groupKey(v, 'external'), groupFixture('external'));
  const client = {
    getMonitor: async () => {
      throw new ApiClientError('not-found');
    },
  } as unknown as ApiClient;
  await expect(
    loadMonitor(cache, client, 'core', 'm1', '24h', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'not-found' });
  const core = cache.getQueryData<GroupSnapshot>(groupKey(v, 'core'))!;
  expect(core.monitors.some((m) => m.id === 'm1')).toBe(false);
  expect(core.subgroups.some((s) => s.monitorIds.includes('m1'))).toBe(false);
  expect(
    cache.getQueryData<GroupSnapshot>(groupKey(v, 'external'))!.monitors.some((m) => m.id === 'm1'),
  ).toBe(true);
  cache.clear();
});

it('revokes a confirmed removal from a partial group snapshot even if another member cannot refresh', async () => {
  const { loadGroup } = await import('../../src/data/loaders.ts');
  const { createHttpClient } = await import('../../src/data/client.ts');
  const cache = new QueryClient(),
    v = publicConfig.configVersion;
  const group = groupFixture('core', 2);
  cache.setQueryData(groupKey(v, 'core'), group);
  cache.setQueryData(monitorKey(v, 'core', 'm1', '24h'), detailFixture('core', 'm1', '24h'));
  const { encodeGroupSnapshot } = await import('../../src/server/home.ts');
  const partial = {
    ...group,
    freshness: 'stale' as const,
    revokedMonitorIds: ['m1'],
    monitors: group.monitors.slice(1),
    subgroupErrors: [{ subgroupId: 'api', code: 'unavailable' as const }],
    subgroups: group.subgroups.map((s) => ({
      ...s,
      monitorIds: s.monitorIds.filter((id) => id !== 'm1'),
    })),
  };
  const client = createHttpClient('/api/v1', async () =>
    Response.json(encodeGroupSnapshot(partial)),
  );

  await expect(
    loadGroup(cache, client, 'core', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'unavailable' });
  const remaining = cache.getQueryData<GroupSnapshot>(groupKey(v, 'core'))!;
  expect(remaining.monitors.map((m) => m.id)).toEqual(['m2']);
  expect(remaining.subgroups.flatMap((s) => s.monitorIds)).not.toContain('m1');
  expect(cache.getQueryData(monitorKey(v, 'core', 'm1', '24h'))).toBeUndefined();
  cache.clear();
});
