import type { MonitorDetail } from '../shared/contracts.ts';
import { requestJson, SourceRequestError, type JsonFetcher } from './sources/http.ts';

export type CertificateResult = {
  certificateExpiresAt: string | null;
  capability: MonitorDetail['capabilities']['certificate'];
};

function missing(capability: 'unsupported' | 'unavailable'): CertificateResult {
  return { certificateExpiresAt: null, capability };
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function certificate(time: number): CertificateResult {
  const date = new Date(time);
  return Number.isFinite(time) &&
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() >= 1970 &&
    date.getUTCFullYear() <= 9999
    ? { certificateExpiresAt: date.toISOString(), capability: 'available' }
    : missing('unavailable');
}

/**
 * Detail-only optional request. Peekaping 0.0.46 and current upstream both expose
 * GET /monitors/{id}/tls -> data.certInfo.validTo (RFC3339, leaf certificate).
 * https://github.com/0xfurai/peekaping/blob/0.0.46/apps/server/internal/modules/shared/tls.go
 * A missing route on older installations must not fail the monitor detail.
 */
export async function fetchPeekapingCertificate(
  baseUrl: string,
  monitorId: string,
  apiKey: string,
  fetcher: JsonFetcher = fetch,
  signal?: AbortSignal,
): Promise<CertificateResult> {
  try {
    const payload = object(
      await requestJson(
        fetcher,
        `${baseUrl.replace(/\/+$/, '')}/api/v1/monitors/${encodeURIComponent(monitorId)}/tls`,
        { headers: { Accept: 'application/json', 'X-API-Key': apiKey }, signal },
        4000,
      ),
    );
    if (!payload || payload.success === false) return missing('unavailable');
    // Do not follow issuerCertificate: its validity differs from the leaf's.
    const validTo = object(object(payload.data)?.certInfo)?.validTo;
    if (
      typeof validTo !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(validTo)
    )
      return missing('unavailable');
    // Even an invalid or expired certificate can have a known expiry.
    return certificate(Date.parse(validTo));
  } catch (error) {
    return missing(
      error instanceof SourceRequestError && error.status === 404 ? 'unsupported' : 'unavailable',
    );
  }
}

/**
 * Reuse the authenticated v2 detail getMonitors response requested with ssl=1.
 * https://uptimerobot.com/api/legacy/
 * The v2 ssl.expires value is Unix seconds (v3 uses sslExpiryDateTime instead):
 * https://github.com/turbot/steampipe-plugin-uptimerobot/issues/11#issuecomment-1310250436
 */
export function parseUptimeRobotCertificate(record: unknown): CertificateResult {
  const monitor = object(record);
  if (!monitor) return missing('unavailable');
  const expires = object(monitor.ssl)?.expires;
  const seconds =
    typeof expires === 'number'
      ? expires
      : typeof expires === 'string' && /^\d+$/.test(expires)
        ? Number(expires)
        : NaN;
  if (seconds > 0 && Number.isSafeInteger(seconds)) {
    const result = certificate(seconds * 1000);
    if (result.capability === 'available') return result;
  }
  // A known upstream expiry takes priority over the initial URL: it may redirect.
  return missing(
    [3, 4, 5].includes(Number(monitor.type)) ||
      (typeof monitor.url === 'string' && /^http:\/\//i.test(monitor.url))
      ? 'unsupported'
      : 'unavailable',
  );
}
