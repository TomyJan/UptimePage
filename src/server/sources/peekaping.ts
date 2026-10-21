import { SourceRequestError, requestJson, type JsonFetcher } from './http.ts';

export async function fetchPeekapingMonitors(
  baseUrl: string,
  slug: string,
  apiKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<unknown> {
  const root = baseUrl.replace(/\/+$/, '');
  return requestJson(
    fetcher,
    `${root}/api/v1/status-pages/slug/${encodeURIComponent(slug)}/monitors`,
    { headers: { Accept: 'application/json', 'X-API-Key': apiKey } },
  );
}

export async function fetchPeekapingInterval(
  baseUrl: string,
  id: string,
  apiKey: string,
  fetcher: JsonFetcher = fetch,
): Promise<number> {
  const payload = await requestJson(
    fetcher,
    `${baseUrl.replace(/\/+$/, '')}/api/v1/monitors/${encodeURIComponent(id)}`,
    { headers: { Accept: 'application/json', 'X-API-Key': apiKey } },
  );
  const outer = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const item =
    outer.data && typeof outer.data === 'object' ? (outer.data as Record<string, unknown>) : outer;
  if (
    item.id !== id ||
    typeof item.interval !== 'number' ||
    !Number.isFinite(item.interval) ||
    item.interval <= 0
  )
    throw new SourceRequestError('Invalid Peekaping interval');
  return item.interval;
}
