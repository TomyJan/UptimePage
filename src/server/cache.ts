export type ResponseCache = Pick<Cache, 'match' | 'put'>;

/** Optional storage must not hold up a live source request indefinitely. */
export async function cacheOperation<T>(
  operation: () => Promise<T>,
  fallback: T,
  timeoutMs = 1000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export function cacheRequest(request: Request, configVersion: string): Request {
  const url = new URL(request.url);
  return new Request(
    `${url.origin}/__uptimepage_cache/${encodeURIComponent(configVersion)}${url.pathname}`,
    { method: 'GET' },
  );
}

export async function readCache(
  cache: ResponseCache | undefined,
  request: Request,
  version: string,
) {
  if (!cache) return null;
  return cacheOperation(() => cache.match(cacheRequest(request, version)), undefined);
}

export async function writeCache(
  cache: ResponseCache | undefined,
  request: Request,
  version: string,
  response: Response,
) {
  if (!cache) return;
  await cacheOperation(
    () => cache.put(cacheRequest(request, version), response.clone()),
    undefined,
  );
}
