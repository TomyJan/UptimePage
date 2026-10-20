import type { ApiClient } from '../shared/contracts.ts';
import { publicConfig } from '../data/config.ts';
import { ApiClientError } from '../data/client.ts';
import { detailFixture, groupFixture, marker } from './fixtures.ts';
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
export const demoClient: ApiClient = {
  async getGroup(id, signal) {
    await delay(280, signal);
    if (!publicConfig.groups.some((g) => g.id === id)) throw new ApiClientError('not-found');
    const data = groupFixture(
      id,
      Number(new URLSearchParams(location.search).get('demoCount')) || 10,
    );
    if (new URLSearchParams(location.search).has('demoPartial'))
      data.subgroupErrors = [{ subgroupId: data.subgroups.at(-1)!.id, code: 'unavailable' }];
    return data;
  },
  async getMonitor(group, id, range, signal) {
    await delay(range === '7d' ? 650 : 260, signal);
    if (!publicConfig.groups.some((g) => g.id === group)) throw new ApiClientError('not-found');
    if (id === marker)
      throw new ApiClientError('rate-limited', new Date(Date.now() + 60000).toISOString());
    const data = detailFixture(group, id, range);
    if (!data) throw new ApiClientError('not-found');
    return data;
  },
};
