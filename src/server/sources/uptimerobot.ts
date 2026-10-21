import { requestJson, SourceRequestError, type JsonFetcher } from './http.ts';

const endpoint = 'https://api.uptimerobot.com/v2/getMonitors';

type Page = {
  stat?: unknown;
  error?: unknown;
  monitors?: unknown[];
  pagination?: { total?: unknown };
};

export type UptimeRobotRequestOptions = {
  /** Unix timestamps in seconds used for the response-time window. */
  startDate?: number;
  endDate?: number;
  includeDetails?: boolean;
  includeLogs?: boolean;
  /** Separate the response window from the full incident-log window. */
  responseTimesStartDate?: number;
  responseTimesAverage?: number;
  uptimeDays?: number | null;
  latestOnly?: boolean;
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
  if (monitorIds?.length === 0) return [];
  const responseStart = options.responseTimesStartDate ?? options.startDate;
  const end = options.endDate;
  const maximumWindow = 7 * 86400;
  if (
    options.includeDetails &&
    responseStart !== undefined &&
    end !== undefined &&
    end - responseStart > maximumWindow
  ) {
    // v2 rejects response-time windows over seven days, even when averaged.
    // Get identity, full-range uptime and logs once; older chunks supply points only.
    let cursor = end - maximumWindow;
    const latest = await fetchUptimeRobotMonitors(apiKey, monitorIds, fetcher, {
      ...options,
      responseTimesStartDate: cursor,
    });
    if (!latest.length) return latest;
    const records = latest as Record<string, unknown>[];
    const selectedIds = records.map((record) => String(record.id));
    const points = new Map(
      records.map((record) => [
        String(record.id),
        Array.isArray(record.response_times) ? [...record.response_times] : [],
      ]),
    );
    while (cursor > responseStart) {
      const from = Math.max(responseStart, cursor - maximumWindow);
      const older = await fetchUptimeRobotMonitors(apiKey, selectedIds, fetcher, {
        ...options,
        startDate: from,
        endDate: cursor,
        responseTimesStartDate: from,
        includeLogs: false,
        uptimeDays: null,
      });
      if (
        older.length !== selectedIds.length ||
        older.some((record) => !points.has(String((record as Record<string, unknown>).id)))
      )
        throw new SourceRequestError('Inconsistent UptimeRobot range membership');
      for (const record of older as Record<string, unknown>[]) {
        if (Array.isArray(record.response_times))
          points.get(String(record.id))?.push(...record.response_times);
      }
      cursor = from;
    }
    return records.map((record) => {
      const seen = new Set<unknown>();
      return {
        ...record,
        response_times: points.get(String(record.id))!.filter((point) => {
          if (!point || typeof point !== 'object' || !('datetime' in point)) return true;
          if (seen.has(point.datetime)) return false;
          seen.add(point.datetime);
          return true;
        }),
      };
    });
  }
  const result: unknown[] = [];
  const seen = new Set<string>();
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
    if (options.uptimeDays !== null)
      body.set('custom_uptime_ratios', String(options.uptimeDays ?? 1));
    if (monitorIds?.length) body.set('monitors', monitorIds.join('-'));
    if (options.includeDetails) {
      body.set('response_times', '1');
      if (options.responseTimesAverage)
        body.set('response_times_average', String(options.responseTimesAverage));
      const logs = !options.latestOnly && options.includeLogs !== false;
      body.set('logs', logs ? '1' : '0');
      if (options.latestOnly) body.set('response_times_limit', '1');
      if (responseStart !== undefined) {
        body.set('response_times_start_date', String(responseStart));
        if (logs && options.startDate !== undefined)
          body.set('logs_start_date', String(options.startDate));
      }
      if (options.endDate !== undefined) {
        body.set('response_times_end_date', String(options.endDate));
        if (logs) body.set('logs_end_date', String(options.endDate));
      }
    }
    const page = asPage(
      await requestJson(fetcher, endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }),
    );
    if (page.stat === 'fail')
      throw new SourceRequestError('UptimeRobot rejected the request', null, null, {
        reason: 'upstream-rejected',
        stage: 'source',
      });
    if (!Array.isArray(page.monitors) || (page.stat !== undefined && page.stat !== 'ok'))
      throw new SourceRequestError('Invalid UptimeRobot response');
    const monitors = page.monitors;
    for (const monitor of monitors) {
      if (
        !monitor ||
        typeof monitor !== 'object' ||
        !('id' in monitor) ||
        monitor.id === null ||
        seen.has(String(monitor.id))
      )
        throw new SourceRequestError('Invalid UptimeRobot pagination');
      seen.add(String(monitor.id));
    }
    result.push(...monitors);
    if (
      page.pagination?.total !== undefined &&
      (page.pagination.total === null ||
        page.pagination.total === '' ||
        !Number.isSafeInteger(Number(page.pagination.total)) ||
        Number(page.pagination.total) < 0)
    )
      throw new SourceRequestError('Invalid UptimeRobot pagination');
    total =
      page.pagination?.total !== undefined
        ? Number(page.pagination?.total)
        : monitors.length < limit
          ? offset + monitors.length
          : Number.POSITIVE_INFINITY;
    if (!monitors.length) {
      if (offset < total) throw new SourceRequestError('Incomplete UptimeRobot pagination');
      break;
    }
    offset += monitors.length;
  }
  return result;
}
