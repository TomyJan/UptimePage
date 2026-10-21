import { z } from 'zod';
import { cacheOperation, type ResponseCache } from './cache.ts';
import type { ServerConfig } from './config.ts';

const endpoint = '/_uptimepage/cache';
const signatureHeader = 'x-uptimepage-cache-signature';
// Edge Functions accept at most 1 MB per request. Larger snapshots use the
// bounded cloud-instance cache and remain readable without the bridge.
const maxMessageBytes = 1_000_000;
const valueSchema = z.object({
  body: z.string().max(1500000),
  headers: z.array(z.tuple([z.string().max(100), z.string().max(500)])).max(8),
});
const messageSchema = z.object({
  at: z.number().int(),
  origin: z.string().max(500),
  version: z.string().max(200),
  operation: z.enum(['match', 'put']),
  layer: z.enum(['status', 'membership']),
  path: z.string().max(4000),
  value: valueSchema.optional(),
});
type Message = z.infer<typeof messageSchema>;

/** Both runtimes already receive these credentials; no extra deploy-time secret. */
export function cacheBridgeSecret(
  config: ServerConfig,
  environment: Record<string, string | undefined>,
): string | null {
  const pairs = [...new Set(config.groups.map((group) => group.source.apiKeyEnv))]
    .sort()
    .flatMap((name) => {
      const secret = environment[name]?.trim();
      return secret ? [[name, secret]] : [];
    });
  return pairs.length ? JSON.stringify(['uptimepage-cache-v1', config.configVersion, pairs]) : null;
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
async function sign(secret: string, text: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', await signingKey(secret), new TextEncoder().encode(text)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function result(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
function validPath(path: string, origin: string, version: string) {
  const url = new URL(path, origin);
  const prefix = `/__uptimepage_cache/${encodeURIComponent(version)}-`;
  return (
    url.origin === origin &&
    url.pathname === path &&
    !url.search &&
    !url.hash &&
    path.startsWith(prefix) &&
    /^\/__uptimepage_cache\/[^/]+\/(?:api\/v1\/groups|membership)\//.test(path)
  );
}

export async function handleCacheBridge(
  request: Request,
  secret: string | null,
  version: string,
  statusCache: ResponseCache,
  membershipCache: ResponseCache,
  now = Date.now(),
): Promise<Response> {
  const denied = () => result({ error: { code: 'not-found' } }, 404);
  try {
    if (
      !secret ||
      request.method !== 'POST' ||
      Number(request.headers.get('content-length') ?? 0) > maxMessageBytes
    )
      return denied();
    const signature = request.headers.get(signatureHeader) ?? '';
    if (!/^[a-f0-9]{64}$/.test(signature)) return denied();
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxMessageBytes) return denied();
    const bytes = Uint8Array.from(signature.match(/../g)!, (value) => parseInt(value, 16));
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        await signingKey(secret),
        bytes,
        new TextEncoder().encode(text),
      ))
    )
      return denied();
    const parsed = messageSchema.safeParse(JSON.parse(text));
    const origin = new URL(request.url).origin;
    if (
      !parsed.success ||
      parsed.data.version !== version ||
      parsed.data.origin !== origin ||
      Math.abs(now - parsed.data.at) > 60000 ||
      !validPath(parsed.data.path, origin, version)
    )
      return denied();
    const message = parsed.data;
    const cache = message.layer === 'membership' ? membershipCache : statusCache;
    const key = new Request(origin + message.path);
    if (message.operation === 'match') {
      const found = await cacheOperation(() => cache.match(key), undefined);
      if (!found) return result(null);
      return result({ body: await found.text(), headers: [...found.headers.entries()] });
    }
    if (!message.value) return denied();
    const headers = new Headers(message.value.headers);
    const ttl = Number(headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1] ?? 0);
    if (ttl <= 0 || ttl > 600) return denied();
    // Only representation metadata is accepted; transport and cookie headers never persist.
    await cacheOperation(
      () =>
        cache.put(
          key,
          new Response(message.value!.body, {
            headers: {
              'cache-control': `public, max-age=${ttl}`,
              'content-type': 'application/json',
            },
          }),
        ),
      undefined,
    );
    return result(null);
  } catch {
    return denied();
  }
}

export function createRemoteCache(
  origin: string,
  secret: string,
  version: string,
  layer: Message['layer'],
  fetcher: typeof fetch = fetch,
  report?: (event: string) => void,
): ResponseCache {
  async function send(
    request: RequestInfo | URL,
    operation: Message['operation'],
    value?: Message['value'],
  ) {
    const url = new URL(new Request(request).url);
    if (
      url.origin !== origin ||
      !validPath(url.pathname, origin, version) ||
      url.search ||
      url.hash
    ) {
      report?.(`${layer}-${operation}:invalid-path`);
      return null;
    }
    const body = JSON.stringify({
      at: Date.now(),
      origin,
      version,
      operation,
      layer,
      path: url.pathname,
      ...(value ? { value } : {}),
    });
    if (new TextEncoder().encode(body).byteLength > maxMessageBytes) {
      report?.(`${layer}-${operation}:oversized`);
      return null;
    }
    let response: Response;
    report?.(`${layer}-${operation}:pending`);
    try {
      response = await fetcher(origin + endpoint, {
        method: 'POST',
        body,
        headers: {
          'content-type': 'application/json',
          [signatureHeader]: await sign(secret, body),
        },
        redirect: 'error',
        signal: AbortSignal.timeout(1500),
      });
    } catch (error) {
      report?.(
        `${layer}-${operation}:${error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'network'}`,
      );
      throw error;
    }
    report?.(`${layer}-${operation}:http-${response.status}`);
    if (!response.ok) return null;
    return response.json();
  }
  return {
    async match(request) {
      const parsed = valueSchema.safeParse(await send(request, 'match'));
      return parsed.success
        ? new Response(parsed.data.body, { headers: parsed.data.headers })
        : undefined;
    },
    async put(request, response) {
      if (response.status !== 200) return;
      await send(request, 'put', {
        body: await response.clone().text(),
        headers: [...response.headers.entries()],
      });
    },
  };
}
