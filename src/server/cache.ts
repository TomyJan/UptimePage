export type ResponseCache = Pick<Cache, 'match' | 'put'>;

export function cacheRequest(request: Request, configVersion: string): Request {
  const url = new URL(request.url);
  return new Request(
    `https://uptimepage-cache.invalid/${encodeURIComponent(configVersion)}${url.pathname}${url.search}`,
    { method: 'GET' },
  );
}

export async function readCache(
  cache: ResponseCache | undefined,
  request: Request,
  version: string,
) {
  if (!cache) return null;
  return cache.match(cacheRequest(request, version));
}

export async function writeCache(
  cache: ResponseCache | undefined,
  request: Request,
  version: string,
  response: Response,
) {
  if (!cache) return;
  await cache.put(cacheRequest(request, version), response.clone());
}
