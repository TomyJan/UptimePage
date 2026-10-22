import { mapConcurrent } from './concurrency.ts';
import { z } from 'zod';
import { readCache, writeCache, type ResponseCache } from './cache.ts';
import { credentialCacheVersion, requireSecret, type ServerConfig } from './config.ts';
import { fetchPeekapingMonitors, peekapingData } from './sources/peekaping.ts';
import { SourceRequestError, type JsonFetcher } from './sources/http.ts';
import type { GroupSnapshot } from '../shared/contracts.ts';

const entrySchema = z.object({
  fetchedAt: z.iso.datetime(),
  monitorIds: z.array(z.string().min(1)),
});
export type PeekapingMembership = {
  generation: string;
  subgroups: { id: string; monitorIds: string[] }[];
  errors: GroupSnapshot['subgroupErrors'];
};
export const membershipTtlMs = 600_000;

export async function loadPeekapingMembership(
  config: ServerConfig,
  groupId: string,
  environment: Record<string, string | undefined>,
  fetcher: JsonFetcher = fetch,
  now = new Date(),
  cache?: ResponseCache,
  origin = 'https://uptimepage.internal',
): Promise<PeekapingMembership> {
  const group = config.groups.find((g) => g.id === groupId)!;
  if (group.source.type !== 'peekaping') throw new Error('Invalid membership source');
  const baseUrl = group.source.baseUrl;
  const key = requireSecret(environment, group.source.apiKeyEnv);
  const version = credentialCacheVersion(config.configVersion, 'membership-v2', key);
  const results = await mapConcurrent(group.subgroups, 4, async (subgroup) => {
    let failure: PeekapingMembership['errors'][number] | undefined;
    const request = new Request(
      `${origin}/membership/${encodeURIComponent(group.id)}/${encodeURIComponent(subgroup.id)}`,
    );
    let entry: z.infer<typeof entrySchema> | null = null;
    try {
      const cached = await readCache(cache, request, version);
      const result = cached ? entrySchema.safeParse(await cached.json()) : null;
      if (result?.success) {
        const age = now.getTime() - Date.parse(result.data.fetchedAt);
        if (age >= 0 && age < membershipTtlMs) entry = result.data;
      }
    } catch {
      /* Corrupt optional cache is a miss. */
    }
    if (!entry) {
      try {
        const raw = peekapingData(
          await fetchPeekapingMonitors(baseUrl, subgroup.slug!, key, fetcher),
        );
        if (!Array.isArray(raw)) throw new SourceRequestError('Invalid Peekaping membership');
        const ids = raw.map((item) => {
          if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id)
            throw new SourceRequestError('Invalid Peekaping member');
          return item.id as string;
        });
        const rank = new Map((subgroup.order ?? []).map((id, i) => [id, i]));
        entry = {
          fetchedAt: now.toISOString(),
          monitorIds: [...new Set(ids)].sort(
            (a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity),
          ),
        };
        // Only IDs are persisted; status-page values never become monitoring data.
        await writeCache(
          cache,
          request,
          version,
          new Response(JSON.stringify(entry), {
            headers: { 'cache-control': `public, max-age=${membershipTtlMs / 1000}` },
          }),
        );
      } catch (error) {
        const source =
          error instanceof SourceRequestError
            ? error
            : new SourceRequestError('Membership unavailable');
        failure = {
          subgroupId: subgroup.id,
          code: source.status === 429 ? 'rate-limited' : 'unavailable',
          diagnostic: { ...source.diagnostic, stage: 'membership' },
          ...(source.retryAt ? { retryAt: source.retryAt } : {}),
        };
      }
    }
    return {
      subgroup: { id: subgroup.id, monitorIds: entry?.monitorIds ?? [] },
      error: failure,
      generation: entry ? `${entry.fetchedAt}:${JSON.stringify(entry.monitorIds)}` : 'unavailable',
    };
  });
  return {
    generation: JSON.stringify(results.map((result) => result.generation)),
    subgroups: results.map((result) => result.subgroup),
    errors: results.flatMap((result) => (result.error ? [result.error] : [])),
  };
}
