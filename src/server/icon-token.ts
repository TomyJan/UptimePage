import { createCipheriv, createDecipheriv, createHash, createHmac } from 'node:crypto';
import { safeIconOrigin } from './icon-address.ts';

const lifetime = 15 * 60_000;
function key(secret: string, version: string, purpose = 'encryption') {
  return createHash('sha256')
    .update(JSON.stringify(['uptimepage-icon-v1', purpose, secret, version]))
    .digest();
}

/** No source path/query, URL or hostname is exposed in the public icon route. */
export function createIconUrl(
  target: string | undefined,
  group: string,
  secret: string,
  version: string,
  now = new Date(),
): string | null {
  const origin = target && safeIconOrigin(target);
  if (!origin || origin.length > 300) return null;
  // Reuse a URL for one ten-minute window instead of reloading every icon on
  // each status refresh. A separately keyed PRF binds the nonce to the entire
  // plaintext AND authenticated group; distinct messages never intentionally
  // reuse a GCM nonce. Target identity remains opaque to browsers.
  const expiry = (Math.floor(now.getTime() / 600_000) + 1) * 600_000 + 300_000;
  const payload = JSON.stringify([origin, expiry]);
  const iv = createHmac('sha256', key(secret, version, 'nonce'))
    .update(JSON.stringify([group, payload]))
    .digest()
    .subarray(0, 12);
  const cipher = createCipheriv('aes-256-gcm', key(secret, version), iv);
  cipher.setAAD(Buffer.from(group));
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const token = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  return `/api/v1/icons/${encodeURIComponent(group)}/${token}`;
}

export function readIconTarget(
  token: string,
  group: string,
  secret: string,
  version: string,
  now = new Date(),
): string | null {
  try {
    if (token.length > 700 || !/^[\w-]+$/.test(token)) return null;
    const bytes = Buffer.from(token, 'base64url');
    if (bytes.length < 30 || bytes.toString('base64url') !== token) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(secret, version), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(group));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const [origin, expiry] = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString(),
    );
    if (
      typeof origin !== 'string' ||
      !Number.isSafeInteger(expiry) ||
      expiry <= +now ||
      expiry > +now + lifetime ||
      safeIconOrigin(origin) !== origin
    )
      return null;
    return origin;
  } catch {
    return null;
  }
}
