import { isIP } from 'node:net';

/** Conservative public-unicast allowlist. IPv4-mapped and transition IPv6 are excluded. */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) !== 6) return false;
  const first = parseInt(address.split(':')[0], 16);
  if (!(first >= 0x2000 && first <= 0x3fff)) return false;
  const second = parseInt(address.split(':')[1] || '0', 16);
  return !(
    (first === 0x2001 && (second < 0x200 || second === 0xdb8)) ||
    first === 0x2002 ||
    first === 0x3fff
  );
}

export function safeIconOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port)
      return null;
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(hostname)) return isPublicAddress(hostname) ? url.origin : null;
    if (
      !hostname.includes('.') ||
      /(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid)$/.test(hostname)
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
