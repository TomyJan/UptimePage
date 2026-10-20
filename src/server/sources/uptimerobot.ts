import { requestJson, type JsonFetcher } from './http.ts';

const endpoint = 'https://api.uptimerobot.com/v2/getMonitors';

type Page = { monitors?: unknown[]; pagination?: { total?: number } };

function asPage(value: unknown): Page {
  if (!value || typeof value !== 'object') return {};
  return value as Page;
}

export async function fetchUptimeRobotMonitors(
  apiKey: string,
  monitorIds: string[] | undefined,
  fetcher: JsonFetcher = fetch,
): Promise<unknown[]> {
  const result: unknown[] = [];
  const limit = 50;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total) {
    const body = new URLSearchParams({
      api_key: apiKey,
      format: 'json',
      offset: String(offset),
      limit: String(limit),
    });
    if (monitorIds?.length) body.set('monitors', monitorIds.join('-'));
    const page = asPage(await requestJson(fetcher, endpoint, { method: 'POST', body }));
    const monitors = Array.isArray(page.monitors) ? page.monitors : [];
    result.push(...monitors);
    total =
      typeof page.pagination?.total === 'number' ? page.pagination.total : offset + monitors.length;
    if (!monitors.length) break;
    offset += monitors.length;
  }
  return result;
}
