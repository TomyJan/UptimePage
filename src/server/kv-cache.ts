import type { ResponseCache } from './cache.ts';

export type KvNamespace = {
  get(key: string, options?: { type: 'json' }): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
};

type StoredResponse = {
  body: string;
  status: number;
  headers: [string, string][];
  expiresAt: number;
};

function keyFor(request: Request): string {
  const bytes = new TextEncoder().encode(request.url);
  return `uptimepage_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function maxAge(response: Response): number {
  const match = response.headers.get('cache-control')?.match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Number(match[1]) * 1000 : 30_000;
}

export function createKvCache(namespace: KvNamespace): ResponseCache {
  return {
    async match(request: RequestInfo) {
      const normalized = new Request(request);
      const value = (await namespace.get(keyFor(normalized), {
        type: 'json',
      })) as StoredResponse | null;
      if (!value || value.expiresAt <= Date.now()) return undefined;
      return new Response(value.body, {
        status: value.status,
        headers: value.headers,
      });
    },
    async put(request: RequestInfo, response) {
      if (!response.ok) return;
      const body = await response.clone().text();
      const headers: [string, string][] = [];
      response.headers.forEach((value, key) => headers.push([key, value]));
      await namespace.put(
        keyFor(new Request(request)),
        JSON.stringify({
          body,
          status: response.status,
          headers,
          expiresAt: Date.now() + maxAge(response),
        } satisfies StoredResponse),
      );
    },
  };
}

export class LayeredResponseCache implements ResponseCache {
  private readonly layers: ResponseCache[];

  constructor(layers: ResponseCache[]) {
    this.layers = layers;
  }

  async match(request: RequestInfo, options?: CacheQueryOptions): Promise<Response | undefined> {
    for (const layer of this.layers) {
      try {
        const response = await layer.match(request, options);
        if (response) return response;
      } catch {
        // An optional cache must never make the read-only API unavailable.
      }
    }
    return undefined;
  }

  async put(request: RequestInfo, response: Response): Promise<void> {
    await Promise.allSettled(this.layers.map((layer) => layer.put(request, response.clone())));
  }
}
