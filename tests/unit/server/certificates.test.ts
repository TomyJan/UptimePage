import { describe, expect, it } from 'vitest';
import {
  fetchPeekapingCertificate,
  parseUptimeRobotCertificate,
} from '../../../src/server/certificates.ts';

describe('optional authenticated Peekaping certificate information', () => {
  it('reads the leaf certificate from the authenticated TLS endpoint and exposes only its expiry', async () => {
    let requestedUrl = '';
    let requestedInit: RequestInit | undefined;
    const result = await fetchPeekapingCertificate(
      'https://peekaping.example.test/',
      'monitor/id',
      'test-key',
      async (input, init) => {
        requestedUrl = String(input);
        requestedInit = init;
        return Response.json({
          success: true,
          data: {
            valid: false,
            certInfo: {
              validTo: '2026-12-01T18:30:00+08:00',
              subject: 'PRIVATE',
              issuerCertificate: { validTo: '2030-01-01T00:00:00Z' },
            },
          },
        });
      },
    );
    expect(requestedUrl).toBe('https://peekaping.example.test/api/v1/monitors/monitor%2Fid/tls');
    expect(new Headers(requestedInit?.headers).get('X-API-Key')).toBe('test-key');
    expect(requestedInit?.redirect).toBe('error');
    expect(result).toEqual({
      certificateExpiresAt: '2026-12-01T10:30:00.000Z',
      capability: 'available',
    });
  });

  it.each([
    { success: true, data: null },
    { success: true, data: { valid: false } },
    { success: false, data: { certInfo: { validTo: '2026-12-01T00:00:00Z' } } },
    { data: { certInfo: { validTo: '0001-01-01T00:00:00Z' } } },
    { data: { certInfo: { validTo: 'not-a-date' } } },
    { data: { certInfo: { validTo: '2026-12-01' } } },
  ])('keeps missing or invalid upstream certificate data unavailable: %j', async (payload) => {
    await expect(
      fetchPeekapingCertificate('https://peekaping.example.test', 'id', 'key', async () =>
        Response.json(payload),
      ),
    ).resolves.toEqual({ certificateExpiresAt: null, capability: 'unavailable' });
  });

  it('treats older servers without the TLS route as unsupported', async () => {
    await expect(
      fetchPeekapingCertificate(
        'https://peekaping.example.test',
        'id',
        'key',
        async () => new Response('', { status: 404 }),
      ),
    ).resolves.toEqual({ certificateExpiresAt: null, capability: 'unsupported' });
  });

  it.each([401, 403, 429, 500])('isolates an optional TLS HTTP %s failure', async (status) => {
    await expect(
      fetchPeekapingCertificate(
        'https://peekaping.example.test',
        'id',
        'key',
        async () => new Response('', { status }),
      ),
    ).resolves.toEqual({ certificateExpiresAt: null, capability: 'unavailable' });
  });

  it('isolates network failures and invalid JSON', async () => {
    for (const fetcher of [
      async () => {
        throw new Error('private network error');
      },
      async () => new Response('invalid JSON'),
    ]) {
      await expect(
        fetchPeekapingCertificate('https://peekaping.example.test', 'id', 'key', fetcher),
      ).resolves.toEqual({ certificateExpiresAt: null, capability: 'unavailable' });
    }
  });
});

describe('UptimeRobot v2 SSL certificate information', () => {
  it('parses ssl.expires as Unix seconds from an existing getMonitors ssl=1 response', () => {
    expect(
      parseUptimeRobotCertificate({
        id: 789645145,
        type: 1,
        url: 'https://private.example.test/',
        ssl: {
          brand: "Let's Encrypt",
          product: 'R3',
          expires: 1674722671,
          last_check: '2022-11-10',
          ignore_errors: 0,
          disable_notifications: 1,
        },
      }),
    ).toEqual({ certificateExpiresAt: '2023-01-26T08:44:31.000Z', capability: 'available' });
  });

  it('accepts a numeric timestamp encoded as a string without exposing other SSL data', () => {
    expect(
      parseUptimeRobotCertificate({ ssl: { expires: '1674722671', brand: 'PRIVATE' } }),
    ).toEqual({
      certificateExpiresAt: '2023-01-26T08:44:31.000Z',
      capability: 'available',
    });
  });

  it('uses upstream certificate data when an HTTP monitor redirects to HTTPS', () => {
    expect(
      parseUptimeRobotCertificate({
        type: 1,
        url: 'http://private.example.test',
        ssl: { expires: 1674722671 },
      }),
    ).toEqual({ certificateExpiresAt: '2023-01-26T08:44:31.000Z', capability: 'available' });
  });

  it.each([
    undefined,
    null,
    {},
    { ssl: null },
    { ssl: {} },
    { ssl: { expires: 0 } },
    { ssl: { expires: -1 } },
    { ssl: { expires: true } },
    { ssl: { expires: Infinity } },
    { ssl: { expires: 1674722671000 } },
    { ssl: { expires: '2026-12-01' } },
  ])('keeps unavailable data distinct from unsupported monitor types: %j', (record) => {
    expect(parseUptimeRobotCertificate(record)).toEqual({
      certificateExpiresAt: null,
      capability: 'unavailable',
    });
  });

  it.each([
    { type: 3, url: 'private.example.test' },
    { type: 4, url: 'private.example.test' },
    { type: 5 },
    { type: 1, url: 'http://private.example.test' },
    { type: 2, url: 'http://private.example.test' },
  ])('marks monitors without TLS support as unsupported: %j', (record) => {
    expect(parseUptimeRobotCertificate(record)).toEqual({
      certificateExpiresAt: null,
      capability: 'unsupported',
    });
  });
});
