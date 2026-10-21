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
      const origin = new URL(context.request.url).origin;
      const remote = secret
        ? createRemoteCache(origin, secret, config.configVersion, 'status')
        : null;
      const membership = secret
        ? createRemoteCache(origin, secret, config.configVersion, 'membership')
        : null;
      return await handleApi(context.request, {
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
    } catch {
      return errorResponse('unavailable', null, { reason: 'internal', stage: 'runtime' });
    }
  };
}
