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
    async getGroup(id, signal) {
      const group = await request(`/groups/${encodeURIComponent(id)}`, groupSnapshotSchema, signal);
      if (!group.hydrateDetails) return group;
      let next = 0;
      let limited: ApiClientError | null = null;
      const revoked = new Set(group.revokedMonitorIds ?? []);
      const errors = new Map(group.subgroupErrors.map((e) => [e.subgroupId, e]));
      await Promise.all(
        Array.from({ length: Math.min(4, group.monitors.length) }, async () => {
          for (let i = next++; i < group.monitors.length; i = next++) {
            if (signal.aborted) throw signal.reason;
            const member = group.monitors[i];
            try {
              if (limited) throw limited;
              const detail = await request(
                `/groups/${encodeURIComponent(id)}/monitors/${encodeURIComponent(member.id)}?range=24h`,
                monitorDetailSchema,
                signal,
              );
              if (
                detail.configVersion !== group.configVersion ||
                detail.monitor.id !== member.id ||
                detail.monitor.groupId !== id
              )
                throw new ApiClientError('invalid-response');
              group.monitors[i] = { ...detail.monitor, subgroupIds: member.subgroupIds };
              if (detail.diagnostic || detail.monitor.freshness !== 'fresh')
                throw new ApiClientError('unavailable', detail.retryAt ?? null, detail.diagnostic);
            } catch (error) {
              if (signal.aborted) throw error;
              const failure =
                error instanceof ApiClientError ? error : new ApiClientError('unavailable');
              if (failure.code === 'rate-limited') limited = failure;
              if (failure.code === 'not-found') {
                revoked.add(member.id);
                continue;
              }
              for (const subgroupId of member.subgroupIds) {
                const previous = errors.get(subgroupId);
                const preferred =
                  previous?.code === 'rate-limited' && failure.code !== 'rate-limited'
                    ? previous
                    : failure;
                const retryAt = [previous?.retryAt, failure.retryAt]
                  .filter((value): value is string => Boolean(value))
                  .sort((a, b) => Date.parse(a) - Date.parse(b))
                  .at(-1);
                errors.set(subgroupId, {
                  subgroupId,
                  code: preferred.code,
                  diagnostic: preferred.diagnostic,
                  ...(retryAt ? { retryAt } : {}),
                });
              }
            }
          }
        }),
      );
      group.revokedMonitorIds = [...revoked];
      group.monitors = group.monitors.filter((m) => !revoked.has(m.id));
      group.subgroups = group.subgroups.map((s) => ({
        ...s,
        monitorIds: s.monitorIds.filter((id) => !revoked.has(id)),
      }));
      group.subgroupErrors = [...errors.values()];
      if (errors.size) {
        group.freshness = 'stale';
        group.subgroups = group.subgroups.map((s) => ({
          ...s,
          freshness: errors.has(s.id) ? 'unavailable' : s.freshness,
        }));
      }
      return group;
    },
    getMonitor: (group, id, range, signal) =>
      request(
        `/groups/${encodeURIComponent(group)}/monitors/${encodeURIComponent(id)}?range=${range}`,
        monitorDetailSchema,
        signal,
      ),
  };
}
