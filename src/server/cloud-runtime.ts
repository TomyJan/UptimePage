import { handleApi, errorResponse } from './api.ts';
import { cacheBridgeSecret, createRemoteCache } from './cache-bridge.ts';
import { createMemoryCache } from './memory-cache.ts';
import { LayeredResponseCache } from './kv-cache.ts';
import type { ServerConfig } from './config.ts';
import { createHash } from 'node:crypto';

function originFingerprint(origin: string) {
  return createHash('sha256').update(origin).digest('hex').slice(0, 12);
}

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
      // EdgeOne overwrites this platform header with the public domain; the
      // Node Request URL and Host can both refer to an internal cloud origin.
      // Never use generic client-controlled forwarding headers for this.
      const platformHost = context.request.headers.get('eo-pages-host');
      if (
        platformHost &&
        platformHost.length <= 259 &&
        /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(platformHost)
      ) {
        try {
          const candidate = new URL(`https://${platformHost}`);
          if (
            /\.[a-z][a-z0-9-]*$/i.test(candidate.hostname) &&
            candidate.hostname
              .split('.')
              .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
          ) {
            publicUrl.protocol = 'https:';
            publicUrl.hostname = candidate.hostname;
            publicUrl.port = candidate.port;
          }
        } catch {
          // Invalid platform metadata must not interrupt the read-only API.
        }
      }
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
          `origin-${originFingerprint(origin)}`,
          ...['host', 'x-forwarded-host', 'eo-pages-host'].flatMap((name) => {
            const value = context.request.headers.get(name);
            if (!value || value.length > 500) return [];
            try {
              return [`${name}-${originFingerprint(new URL(`https://${value}`).origin)}`];
            } catch {
              return [`${name}-invalid`];
            }
          }),
          ...Array.from(diagnostics, ([operation, result]) => `${operation}:${result}`),
        ].join(',') + (secret ? '' : ',unconfigured'),
      );
      return response;
    } catch {
      return errorResponse('unavailable', null, { reason: 'internal', stage: 'runtime' });
    }
  };
}
