import { expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { loadMonitor } from '../../src/data/loaders.ts';
import { monitorKey, groupKey } from '../../src/data/queries.ts';
import { ApiClientError } from '../../src/data/client.ts';
import { detailFixture, groupFixture } from '../../src/demo/fixtures.ts';
import { publicConfig } from '../../src/data/config.ts';
import type { ApiClient, GroupSnapshot } from '../../src/shared/contracts.ts';
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
