import { requestJson, type JsonFetcher } from './http.ts';

const endpoint = 'https://api.uptimerobot.com/v2/getMonitors';

type Page = { monitors?: unknown[]; pagination?: { total?: number } };

export type UptimeRobotRequestOptions = {
  /** Unix timestamps in seconds used for the response-time window. */
  startDate?: number;
  endDate?: number;
  includeDetails?: boolean;
};

function asPage(value: unknown): Page {
  if (!value || typeof value !== 'object') return {};
  return value as Page;
}

export async function fetchUptimeRobotMonitors(
  apiKey: string,
  monitorIds: string[] | undefined,
  fetcher: JsonFetcher = fetch,
  options: UptimeRobotRequestOptions = {},
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
    if (options.includeDetails) {
      body.set('response_times', '1');
      body.set('response_times_limit', '1000');
      body.set('logs', '1');
      body.set('logs_limit', '100');
      if (options.startDate !== undefined)
        body.set('response_times_start_date', String(options.startDate));
      if (options.endDate !== undefined)
        body.set('response_times_end_date', String(options.endDate));
    }
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
