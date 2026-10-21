import { handleApi, errorResponse } from './api.ts';
import { cacheBridgeSecret, createRemoteCache } from './cache-bridge.ts';
import { createMemoryCache } from './memory-cache.ts';
import { LayeredResponseCache } from './kv-cache.ts';
import type { ServerConfig } from './config.ts';

export type FunctionContext = { request: Request; env?: Record<string, string | undefined> };

/** Node aggregation avoids the edge runtime's per-request fetch ceiling. */
export function createCloudApiHandler(config: ServerConfig) {
  const memory = createMemoryCache();
  const inFlight = new Map<string, Promise<unknown>>();
  return async (context: FunctionContext): Promise<Response> => {
    try {
      const environment = context.env ?? {};
      const secret = cacheBridgeSecret(config, environment);
      const publicUrl = new URL(context.request.url);
      // EdgeOne terminates TLS before Node and supplies an HTTP request URL.
      // Public deployments use HTTPS; retain HTTP only for local development.
      if (
        publicUrl.protocol === 'http:' &&
        !['localhost', '127.0.0.1', '[::1]'].includes(publicUrl.hostname)
      )
        publicUrl.protocol = 'https:';
      const origin = publicUrl.origin;
      // This API is read-only and never consumes request bodies.
      const request = new Request(publicUrl, {
        method: context.request.method,
        headers: context.request.headers,
        signal: context.request.signal,
      });
      // Fixed labels only: never expose origins, credentials or exception text.
      const diagnostics = new Map<string, string>();
      const report = (event: string) => {
        const [operation, result] = event.split(':');
        diagnostics.set(operation, result);
      };
      const remote = secret
        ? createRemoteCache(origin, secret, config.configVersion, 'status', fetch, report)
        : null;
      const membership = secret
        ? createRemoteCache(origin, secret, config.configVersion, 'membership', fetch, report)
        : null;
      const response = await handleApi(request, {
        config,
        environment,
        inFlight,
        // The bridge may try two 400 ms edge layers. Leave it time to fall back
        // to KV while staying inside handleApi's one-second read budget.
        cache: new LayeredResponseCache(remote ? [memory, remote] : [memory], 950),
        membershipCache: new LayeredResponseCache(
          membership ? [membership, memory] : [memory],
          950,
        ),
      });
      response.headers.set(
        'x-uptimepage-cache',
        [
          new URL(origin).protocol === 'https:' ? 'https' : 'http',
          ...Array.from(diagnostics, ([operation, result]) => `${operation}:${result}`),
        ].join(',') + (secret ? '' : ',unconfigured'),
      );
      return response;
    } catch {
      return errorResponse('unavailable', null, { reason: 'internal', stage: 'runtime' });
    }
  };
}
