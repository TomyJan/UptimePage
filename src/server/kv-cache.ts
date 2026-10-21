import { cacheOperation, type ResponseCache } from './cache.ts';
import { z } from 'zod';

export type KvNamespace = {
  get(key: string, options?: { type: 'json' }): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
};

const storedResponse = z.object({
  body: z.string(),
  status: z.literal(200),
  headers: z.array(z.tuple([z.string(), z.string()])),
  expiresAt: z.number().finite(),
  requestUrl: z.string(),
});
type StoredResponse = z.infer<typeof storedResponse>;

async function keyFor(request: Request): Promise<string> {
  const url = new URL(request.url);
  // Reuse each route's slot across deployments; the envelope still verifies
  // the full versioned URL. KV has no native TTL, so do not accumulate history
  // under a new physical key on every config edit.
  url.pathname = url.pathname.replace(/^\/__uptimepage_cache\/[^/]+\//, '/__uptimepage_cache/');
  const bytes = new TextEncoder().encode(url.href);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `uptimepage_${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function maxAge(response: Response): number {
  const match = response.headers.get('cache-control')?.match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Number(match[1]) * 1000 : 30_000;
}

export function createKvCache(namespace: KvNamespace): ResponseCache {
  return {
    async match(request: RequestInfo) {
      const normalized = new Request(request);
      const parsed = storedResponse.safeParse(
        await namespace.get(await keyFor(normalized), {
          type: 'json',
        }),
      );
      if (!parsed.success) return undefined;
      const value = parsed.data;
      if (value.expiresAt <= Date.now() || value.requestUrl !== normalized.url) return undefined;
      return new Response(value.body, {
        status: value.status,
        headers: value.headers,
      });
    },
    async put(request: RequestInfo, response) {
      if (response.status !== 200) return;
      const body = await response.clone().text();
      const headers: [string, string][] = [];
      response.headers.forEach((value, key) => headers.push([key, value]));
      await namespace.put(
        await keyFor(new Request(request)),
        JSON.stringify({
          body,
          status: 200,
          headers,
          expiresAt: Date.now() + maxAge(response),
          requestUrl: new Request(request).url,
        } satisfies StoredResponse),
      );
    },
  };
}

export class LayeredResponseCache implements ResponseCache {
  private readonly layers: ResponseCache[];
  private readonly layerTimeoutMs: number;

  constructor(layers: ResponseCache[], layerTimeoutMs = 400) {
    this.layers = layers;
    this.layerTimeoutMs = layerTimeoutMs;
  }

  async match(request: RequestInfo, options?: CacheQueryOptions): Promise<Response | undefined> {
    for (const [index, layer] of this.layers.entries()) {
      try {
        // Leave time for the next layer inside the API's one-second read budget.
        const response = await cacheOperation(
          () => layer.match(request, options),
          undefined,
          this.layerTimeoutMs,
        );
        if (response) {
          // Promote shared hits into faster layers, so a warm instance does not
          // repeat the same network lookup on every visitor request.
          await Promise.allSettled(
            this.layers
              .slice(0, index)
              .map((earlier) =>
                cacheOperation(() => earlier.put(request, response.clone()), undefined, 25),
              ),
          );
          return response;
        }
      } catch {
        // An optional cache must never make the read-only API unavailable.
      }
    }
    return undefined;
  }

  async put(request: RequestInfo, response: Response): Promise<void> {
    await Promise.allSettled(
      this.layers.map(async (layer) =>
        cacheOperation(() => layer.put(request, response.clone()), undefined),
      ),
    );
  }
}
