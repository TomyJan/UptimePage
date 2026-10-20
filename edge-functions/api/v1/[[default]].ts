import serverConfig from '../../../.generated/server-config.ts';
import { handleApi } from '../../../src/server/api.ts';
import type { ServerConfig } from '../../../src/server/config.ts';
import {
  LayeredResponseCache,
  createKvCache,
  type KvNamespace,
} from '../../../src/server/kv-cache.ts';
import type { ResponseCache } from '../../../src/server/cache.ts';

type EdgeContext = {
  request: Request;
  env?: Record<string, string | undefined>;
};

export default function onRequest(context: EdgeContext) {
  const edgeCaches = globalThis as typeof globalThis & { caches?: { default?: Cache } };
  const bindings = globalThis as typeof globalThis & Record<string, unknown>;
  const kvBinding = serverConfig.cache.kvBinding;
  const kv = kvBinding ? bindings[kvBinding] : undefined;
  const layers = [
    edgeCaches.caches?.default,
    kv &&
    typeof kv === 'object' &&
    'get' in kv &&
    typeof kv.get === 'function' &&
    'put' in kv &&
    typeof kv.put === 'function'
      ? createKvCache(kv as KvNamespace)
      : undefined,
  ].filter((layer): layer is ResponseCache => Boolean(layer));
  return handleApi(context.request, {
    config: serverConfig as ServerConfig,
    environment: context.env ?? {},
    cache: new LayeredResponseCache(layers),
  });
}
