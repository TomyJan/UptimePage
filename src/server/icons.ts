import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { isPublicAddress, safeIconOrigin } from './icon-address.ts';
import { createTaskLimiter } from './concurrency.ts';

export { isPublicAddress } from './icon-address.ts';
const maxBytes = 256 * 1024;
const schedule = createTaskLimiter(8);
export type Icon = { type: string; body: string };
export type IconTransport = (url: string, signal: AbortSignal) => Promise<Response>;

async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        abort = () => reject(new Error('Icon timeout'));
        signal.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

/** Resolve once, validate all answers and pin the connection to the validated IP. */
export const iconTransport: IconTransport = async (input, signal) => {
  let url = new URL(input);
  for (let redirects = 0; redirects <= 2; redirects++) {
    if (!safeIconOrigin(url.href)) throw new Error('Blocked icon address');
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await abortable(lookup(hostname, { all: true, verbatim: true }), signal);
    signal.throwIfAborted();
    if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address)))
      throw new Error('Blocked icon address');
    const pinned = addresses[0];
    const result = await new Promise<{ status: number; location?: string; body: Buffer }>(
      (resolve, reject) => {
        const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
          url,
          {
            signal,
            family: pinned.family,
            lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
            headers: {
              'user-agent': 'UptimePage/1.0 (favicon)',
              accept: 'image/png,image/x-icon,image/webp,image/jpeg,image/gif',
              // Rainbow requires a Referer; never forward a visitor or monitored URL.
              ...(url.hostname === 'favicon.cccyun.cc'
                ? { referer: 'https://tool.cccyun.cc/' }
                : {}),
            },
          },
          (response) => {
            const status = response.statusCode ?? 502;
            if (status !== 200) {
              response.destroy();
              resolve({ status, location: response.headers.location, body: Buffer.alloc(0) });
              return;
            }
            if (
              Number(response.headers['content-length'] ?? 0) > maxBytes ||
              response.headers['content-encoding']
            ) {
              response.destroy();
              reject(new Error('Invalid icon body'));
              return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            response.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > maxBytes) {
                response.destroy(new Error('Icon too large'));
                return;
              }
              chunks.push(chunk);
            });
            response.on('error', reject);
            response.on('end', () => resolve({ status, body: Buffer.concat(chunks) }));
          },
        );
        req.on('error', reject);
        req.end();
      },
    );
    if ([301, 302, 303, 307, 308].includes(result.status) && result.location && redirects < 2) {
      url = new URL(result.location, url);
      continue;
    }
    return new Response(new Uint8Array(result.body), { status: result.status });
  }
  throw new Error('Icon redirect limit');
};

function pngComplete(bytes: Buffer): boolean {
  if (
    bytes.length < 45 ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  )
    return false;
  if (
    !bytes.readUInt32BE(16) ||
    !bytes.readUInt32BE(20) ||
    bytes.readUInt32BE(16) > 4096 ||
    bytes.readUInt32BE(20) > 4096
  )
    return false;
  let hasPixels = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length) return false;
    let crc = 0xffffffff;
    for (let index = offset + 4; index < end - 4; index++) {
      crc ^= bytes[index];
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if ((crc ^ 0xffffffff) >>> 0 !== bytes.readUInt32BE(end - 4)) return false;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT' && length > 0) hasPixels = true;
    if (type === 'IEND') return hasPixels && length === 0 && end === bytes.length;
    offset = end;
  }
  return false;
}

function imageType(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    return pngComplete(bytes) ? 'image/png' : null;
  if (
    bytes.length >= 20 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes.readUInt16BE(bytes.length - 2) === 0xffd9
  )
    return 'image/jpeg';
  if (
    bytes.length >= 14 &&
    ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)) &&
    bytes.at(-1) === 0x3b &&
    bytes.readUInt16LE(6) > 0 &&
    bytes.readUInt16LE(8) > 0
  )
    return 'image/gif';
  if (
    bytes.length >= 30 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP' &&
    bytes.readUInt32LE(4) + 8 === bytes.length &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))
  )
    return 'image/webp';
  const count = bytes.readUInt16LE(4);
  if (
    bytes.readUInt32LE(0) === 0x00010000 &&
    count > 0 &&
    count <= 64 &&
    bytes.length >= 6 + count * 16
  ) {
    for (let i = 0; i < count; i++) {
      const length = bytes.readUInt32LE(6 + i * 16 + 8);
      const offset = bytes.readUInt32LE(6 + i * 16 + 12);
      if (length < 12 || offset < 6 + count * 16 || offset + length > bytes.length) return null;
    }
    return 'image/x-icon';
  }
  return null;
}

export async function fetchIcon(
  origin: string,
  transport: IconTransport = iconTransport,
): Promise<Icon | null> {
  if (!safeIconOrigin(origin)) return null;
  const deadline = AbortSignal.timeout(6000);
  const host = new URL(origin).hostname;
  const urls = [
    `${origin}/favicon.ico`,
    `https://favicon.cccyun.cc/${host}`,
    `https://a.favicon.im/${host}?larger=true&throw-error-on-404=true`,
    `https://icon.horse/icon/${host}`,
  ];
  for (const url of urls) {
    if (deadline.aborted) break;
    try {
      const icon = await schedule(async () => {
        const signal = AbortSignal.any([deadline, AbortSignal.timeout(1400)]);
        const response = await abortable(transport(url, signal), signal);
        if (response.status !== 200) {
          await response.body?.cancel();
          return null;
        }
        const reader = response.body?.getReader();
        if (!reader) return null;
        const chunks: Buffer[] = [];
        let size = 0;
        try {
          for (;;) {
            signal.throwIfAborted();
            const { done, value } = await abortable(reader.read(), signal);
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) return null;
            chunks.push(Buffer.from(value));
          }
        } finally {
          void reader.cancel().catch(() => {});
        }
        const bytes = Buffer.concat(chunks);
        const type = imageType(bytes);
        return type ? { type, body: bytes.toString('base64') } : null;
      }, deadline);
      if (icon) return icon;
    } catch {
      /* Try the next provider without exposing target or network details. */
    }
  }
  return null;
}
