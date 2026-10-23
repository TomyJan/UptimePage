import { describe, expect, it, vi } from 'vitest';
import { createIconUrl, readIconTarget } from '../../../src/server/icon-token.ts';
import { isPublicAddress, fetchIcon, type IconTransport } from '../../../src/server/icons.ts';

const now = new Date('2026-10-23T12:00:00Z');
import { png } from '../../fixtures/icon.ts';

describe('private icon credentials', () => {
  it('encrypts only the origin and binds the credential to group, deployment and key', () => {
    const path = createIconUrl(
      'https://secret.example/path?token=private',
      'core',
      'key',
      'v1',
      now,
    )!;
    expect(path).toMatch(/^\/api\/v1\/icons\/core\/[\w-]+$/);
    expect(path).not.toMatch(/secret|private|example/);
    const token = path.split('/').at(-1)!;
    expect(
      createIconUrl('https://secret.example/other', 'core', 'key', 'v1', new Date(+now + 30_000)),
    ).toBe(path);
    expect(
      createIconUrl('https://secret.example', 'core', 'key', 'v1', new Date(+now + 600_000)),
    ).not.toBe(path);
    expect(readIconTarget(token, 'core', 'key', 'v1', now)).toBe('https://secret.example');
    for (const [group, key, version] of [
      ['other', 'key', 'v1'],
      ['core', 'other', 'v1'],
      ['core', 'key', 'v2'],
    ])
      expect(readIconTarget(token, group, key, version, now)).toBeNull();
    expect(readIconTarget(token + 'a', 'core', 'key', 'v1', now)).toBeNull();
    expect(readIconTarget(token, 'core', 'key', 'v1', new Date(+now + 901_000))).toBeNull();
  });
  it('does not issue credentials for local, credentialed, nonweb or nonstandard port targets', () => {
    for (const target of [
      'http://localhost',
      'http://127.0.0.1',
      'http://[::1]',
      'http://10.0.0.1',
      'http://user:pass@public.example',
      'ftp://public.example',
      'https://public.example:8443',
    ])
      expect(createIconUrl(target, 'core', 'key', 'v1', now)).toBeNull();
  });
});

describe('safe icon forwarding', () => {
  it('rejects private, mapped, multicast, documentation and reserved IPs', () => {
    for (const ip of [
      '0.1.2.3',
      '10.2.3.4',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.1.1',
      '192.0.2.1',
      '198.18.0.1',
      '224.1.1.1',
      '::1',
      '::ffff:8.8.8.8',
      'fc00::1',
      'fe80::1',
      '2001:db8::1',
      '2002:7f00:1::',
      'invalid',
    ])
      expect(isPublicAddress(ip), ip).toBe(false);
    for (const ip of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])
      expect(isPublicAddress(ip), ip).toBe(true);
  });
  it('tries direct, rainbow, favicon.im, then icon horse and returns validated image bytes', async () => {
    const transport = vi
      .fn<IconTransport>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(
        new Response('<html>error</html>', { headers: { 'content-type': 'image/png' } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(png));
    expect(await fetchIcon('https://secret.example', transport)).toEqual({
      type: 'image/png',
      body: png.toString('base64'),
    });
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      'https://secret.example/favicon.ico',
      'https://favicon.cccyun.cc/secret.example',
      'https://a.favicon.im/secret.example?larger=true&throw-error-on-404=true',
      'https://icon.horse/icon/secret.example',
    ]);
  });
  it('stops after success and never returns SVG, HTML or oversized images', async () => {
    const transport = vi.fn<IconTransport>().mockResolvedValue(new Response(png));
    expect((await fetchIcon('https://public.example', transport))?.type).toBe('image/png');
    expect(transport).toHaveBeenCalledTimes(1);
    for (const body of [
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
      '<html/>',
      Buffer.concat([png, Buffer.alloc(262144)]),
    ]) {
      expect(await fetchIcon('https://public.example', async () => new Response(body))).toBeNull();
    }
  });
  it('continues to a fallback when a provider returns a truncated or corrupted image', async () => {
    for (const broken of [
      png.subarray(0, 12),
      png.subarray(0, png.length - 8),
      Buffer.from('00000100010000000000000000000000000000000000', 'hex'),
    ]) {
      const transport = vi
        .fn<IconTransport>()
        .mockResolvedValueOnce(new Response(broken))
        .mockResolvedValueOnce(new Response(png));
      expect((await fetchIcon('https://public.example', transport))?.body).toBe(
        png.toString('base64'),
      );
      expect(transport).toHaveBeenCalledTimes(2);
    }
  });
});
