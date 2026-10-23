import { createHash } from 'node:crypto';
import type { ApiRuntime } from './api.ts';
import { findServerGroup, requireSecret, credentialCacheVersion } from './config.ts';
import { readIconTarget } from './icon-token.ts';
import { fetchIcon, type Icon, type IconTransport } from './icons.ts';
import { readCache, writeCache } from './cache.ts';

const missing = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
/** Only server-issued, encrypted, short-lived capabilities are accepted, never arbitrary URLs. */
export async function handleIcon(
  request: Request,
  runtime: ApiRuntime,
  transport?: IconTransport,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const match = /^\/api\/v1\/icons\/([^/]+)\/([\w-]+)$/.exec(url.pathname);
    if (request.method !== 'GET' || !match || url.search) return missing();
    const group = findServerGroup(runtime.config, decodeURIComponent(match[1]));
    if (!group) return missing();
    const secret = requireSecret(runtime.environment, group.source.apiKeyEnv);
    const now = runtime.now ?? new Date();
    const target = readIconTarget(match[2], group.id, secret, runtime.config.configVersion, now);
    if (!target) return missing();
    const version = credentialCacheVersion(runtime.config.configVersion, 'icons-v1', secret);
    const digest = createHash('sha256').update(target).digest('hex');
    const key = new Request(
      `${url.origin}/api/v1/groups/${encodeURIComponent(group.id)}/icons/${digest}`,
    );
    const load = async (): Promise<Icon | null> => {
      const cached = await readCache(runtime.cache, key, version);
      if (cached) {
        try {
          const value = await cached.json();
          if (
            value.expiresAt > +now &&
            value.expiresAt <= +now + 600_000 &&
            (value.icon === null ||
              (typeof value.icon?.body === 'string' &&
                value.icon.body.length <= 350000 &&
                ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/x-icon'].includes(
                  value.icon.type,
                )))
          )
            return value.icon;
        } catch {
          /* A corrupt cache is a miss. */
        }
      }
      const icon = await fetchIcon(target, transport);
      const ttl = icon ? 600 : 60;
      await writeCache(
        runtime.cache,
        key,
        version,
        Response.json(
          { icon, expiresAt: +now + ttl * 1000 },
          {
            headers: { 'cache-control': `public, max-age=${ttl}` },
          },
        ),
      );
      return icon;
    };
    const flightKey = JSON.stringify(['icon', version, key.url]);
    let task = runtime.inFlight?.get(flightKey) as Promise<Icon | null> | undefined;
    if (!task) {
      task = load().finally(() => runtime.inFlight?.delete(flightKey));
      runtime.inFlight?.set(flightKey, task);
    }
    const icon = await task;
    if (!icon) return missing();
    return new Response(Buffer.from(icon.body, 'base64'), {
      headers: {
        'content-type': icon.type,
        'cache-control': 'private, max-age=60',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return missing();
  }
}
