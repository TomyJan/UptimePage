import type { ResponseCache } from './cache.ts';

/** Bounded instance cache; durable/shared storage remains optional. */
export function createMemoryCache(maxBytes = 16 * 1024 * 1024): ResponseCache {
  const entries = new Map<
    string,
    { body: string; headers: [string, string][]; expires: number; bytes: number }
  >();
  let bytes = 0;
  function remove(key: string) {
    const entry = entries.get(key);
    if (entry) bytes -= entry.bytes;
    entries.delete(key);
  }
  return {
    async match(request) {
      const key = new Request(request).url;
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= Date.now()) {
        remove(key);
        return undefined;
      }
      return new Response(entry.body, { headers: entry.headers });
    },
    async put(request, response) {
      if (response.status !== 200) return;
      const key = new Request(request).url;
      const ttl = Math.min(
        600,
        Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1] ?? 0),
      );
      const body = await response.clone().text();
      const size = new TextEncoder().encode(body).byteLength;
      if (size > Math.min(maxBytes, 2 * 1024 * 1024) || ttl <= 0) return;
      for (const [id, entry] of entries) if (entry.expires <= Date.now()) remove(id);
      remove(key);
      while (entries.size && (bytes + size > maxBytes || entries.size >= 256))
        remove(entries.keys().next().value!);
      entries.set(key, {
        body,
        headers: [...response.headers.entries()],
        expires: Date.now() + ttl * 1000,
        bytes: size,
      });
      bytes += size;
    },
  };
}
