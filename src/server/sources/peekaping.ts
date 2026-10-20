import { requestJson, type JsonFetcher } from './http.ts';

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
