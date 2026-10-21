import serverConfig from '../../.generated/server-config.ts';
import { cacheBridgeSecret, handleCacheBridge } from '../../src/server/cache-bridge.ts';
import {
  LayeredResponseCache,
  createKvCache,
  type KvNamespace,
} from '../../src/server/kv-cache.ts';
import type { FunctionContext } from '../../src/server/cloud-runtime.ts';
import type { ResponseCache } from '../../src/server/cache.ts';

export default async function onRequest(context: FunctionContext) {
  const bindings = globalThis as typeof globalThis &
    Record<string, unknown> & { caches?: { default?: Cache } };
  const kv = serverConfig.cache.kvBinding ? bindings[serverConfig.cache.kvBinding] : undefined;
  const layers = [
    bindings.caches?.default,
    kv &&
    typeof kv === 'object' &&
    'get' in kv &&
    typeof kv.get === 'function' &&
    'put' in kv &&
    typeof kv.put === 'function'
      ? createKvCache(kv as KvNamespace)
      : undefined,
  ].filter((layer): layer is ResponseCache => Boolean(layer));
  return handleCacheBridge(
    context.request,
    cacheBridgeSecret(serverConfig, context.env ?? {}),
    serverConfig.configVersion,
    new LayeredResponseCache(layers),
    new LayeredResponseCache([...layers].reverse()),
  );
}
