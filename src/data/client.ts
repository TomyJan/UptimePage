import { z } from 'zod';
import {
  apiErrorCodeSchema,
  diagnosticSchema,
  type Diagnostic,
  groupSnapshotSchema,
  monitorDetailSchema,
  type ApiClient,
  type ApiErrorCode,
} from '../shared/contracts.ts';
export class ApiClientError extends Error {
  readonly diagnostic?: Diagnostic;
  code: ApiErrorCode;
  retryAt: string | null;
  constructor(code: ApiErrorCode, retryAt: string | null = null, diagnostic?: Diagnostic) {
    super(code);
    this.diagnostic = diagnostic;
    this.name = 'ApiClientError';
    this.code = code;
    this.retryAt = retryAt;
  }
}
const errorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    retryAt: z.iso.datetime().nullable().optional(),
    diagnostic: diagnosticSchema.optional(),
  }),
});
export function createHttpClient(basePath = '/api/v1', fetcher: typeof fetch = fetch): ApiClient {
  async function request<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(basePath + path, {
        signal,
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new ApiClientError('unavailable', null, { reason: 'network' });
    }
    // Only a missing route proves that a monitor was removed from the public set.
    // Auth or policy failures must keep the cached monitor visible as stale.
    if (response.status === 404) throw new ApiClientError('not-found');

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiClientError(response.ok ? 'invalid-response' : 'unavailable', null, {
        reason:
          response.status === 545
            ? 'edge-runtime'
            : response.ok
              ? 'invalid-response'
              : 'upstream-http',
        status: response.status,
        stage: 'runtime',
      });
    }
    if (!response.ok) {
      const parsed = errorSchema.safeParse(data);
      throw new ApiClientError(
        response.status === 401 || response.status === 403
          ? 'unavailable'
          : response.status === 429
            ? 'rate-limited'
            : parsed.success
              ? parsed.data.error.code
              : 'unavailable',
        parsed.success ? (parsed.data.error.retryAt ?? null) : null,
        parsed.success && parsed.data.error.diagnostic
          ? parsed.data.error.diagnostic
          : {
              reason: response.status === 545 ? 'edge-runtime' : 'upstream-http',
              status: response.status,
              stage: 'runtime',
            },
      );
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new ApiClientError('invalid-response');
    return parsed.data;
  }
  return {
    getGroup: (id, signal) =>
      request(`/groups/${encodeURIComponent(id)}`, groupSnapshotSchema, signal),
    getMonitor: (group, id, range, signal) =>
      request(
        `/groups/${encodeURIComponent(group)}/monitors/${encodeURIComponent(id)}?range=${range}`,
        monitorDetailSchema,
        signal,
      ),
  };
}
