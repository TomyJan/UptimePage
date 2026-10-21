/** Preserve input order while bounding work; never enqueue one promise per item. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let cursor = 0;
  let failed = false;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let index = cursor++; !failed && index < items.length; index = cursor++) {
        try {
          result[index] = await work(items[index], index);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
  return result;
}

/** One upstream origin shares its connection budget across groups and visitors. */
export function limitSourceFetch(fetcher: typeof fetch, limit = 16): typeof fetch {
  const pools = new Map<string, { active: number; queue: Set<() => void> }>();
  return async (input, init) => {
    const origin = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
      .origin;
    let pool = pools.get(origin);
    if (!pool) {
      pool = { active: 0, queue: new Set() };
      pools.set(origin, pool);
    }
    const state = pool;
    const signal = init?.signal;
    signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        state.queue.delete(start);
        reject(signal!.reason);
      };
      const start = () => {
        signal?.removeEventListener('abort', abort);
        state.active++;
        resolve();
      };
      if (state.active < limit) start();
      else {
        state.queue.add(start);
        signal?.addEventListener('abort', abort, { once: true });
      }
    });
    try {
      signal?.throwIfAborted();
      const response = await fetcher(input, init);
      if (!response.body) return response;
      if (!response.ok) {
        // The status and Retry-After are authoritative even if the error body
        // has already failed while the connection was being closed.
        await response.body.cancel().catch(() => {});
        return response;
      }
      // fetch() finishes at the headers. These callers consume JSON, so hold the
      // slot through the full body transfer as well (including slow bodies).
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } finally {
      state.active--;
      const next = state.queue.values().next().value;
      if (next) {
        state.queue.delete(next);
        next();
      }
    }
  };
}
