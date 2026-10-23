import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import type { LookupAddress, LookupAllOptions } from 'node:dns';
import { request } from 'node:https';
import { iconTransport } from '../../../src/server/icons.ts';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('node:https', () => ({ request: vi.fn() }));
vi.mock('node:http', () => ({ request: vi.fn() }));
const dns = vi.mocked(
  lookup as (hostname: string, options: LookupAllOptions) => Promise<LookupAddress[]>,
);
const network = vi.mocked(request);
type Reply = { status?: number; location?: string; length?: string; body?: Buffer };
let replies: Reply[];
beforeEach(() => {
  vi.resetAllMocks();
  replies = [];
  dns.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
  network.mockImplementation(((...args: unknown[]) => {
    const callback = args[2] as (response: unknown) => void;
    const reply = replies.shift() ?? {};
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => {
      const res = Object.assign(new PassThrough(), {
        statusCode: reply.status ?? 200,
        headers: { location: reply.location, 'content-length': reply.length },
      });
      callback(res);
      if (!res.destroyed) res.end(reply.body ?? Buffer.from('image'));
    };
    return req;
  }) as typeof request);
});

it('validates every DNS answer before opening a connection', async () => {
  dns.mockResolvedValueOnce([
    { address: '1.1.1.1', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]);
  await expect(
    iconTransport('https://public.example/favicon.ico', AbortSignal.timeout(500)),
  ).rejects.toThrow('Blocked');
  expect(network).not.toHaveBeenCalled();
});

it('pins the validated address while retaining hostname TLS validation and fixed request headers', async () => {
  expect(
    (await iconTransport('https://public.example/favicon.ico', AbortSignal.timeout(500))).status,
  ).toBe(200);
  const [url, options] = network.mock.calls[0] as unknown as [
    URL,
    {
      lookup: (host: string, options: object, callback: (...args: unknown[]) => void) => void;
      headers: Record<string, string>;
    },
  ];
  expect(url.hostname).toBe('public.example');
  const callback = vi.fn();
  options.lookup('rebind.example', {}, callback);
  expect(callback).toHaveBeenCalledWith(null, '1.1.1.1', 4);
  expect(dns).toHaveBeenCalledTimes(1);
  expect(options).not.toHaveProperty('rejectUnauthorized');
  expect(options.headers).not.toHaveProperty('cookie');
  expect(options.headers).not.toHaveProperty('authorization');
  expect(options.headers).not.toHaveProperty('referer');
});

it('validates each redirect, blocks internal redirects, and bounds redirect count', async () => {
  replies.push({ status: 302, location: 'https://127.0.0.1/private' });
  await expect(
    iconTransport('https://public.example/favicon.ico', AbortSignal.timeout(500)),
  ).rejects.toThrow('Blocked');
  expect(network).toHaveBeenCalledTimes(1);
  network.mockClear();
  replies = Array.from({ length: 4 }, () => ({ status: 302, location: '/again' }));
  expect(
    (await iconTransport('https://public.example/favicon.ico', AbortSignal.timeout(500))).status,
  ).toBe(302);
  expect(network).toHaveBeenCalledTimes(3);
  expect(dns).toHaveBeenCalledTimes(4);
});

it('bounds DNS waits and rejects oversized bodies regardless of the advertised length', async () => {
  dns.mockImplementationOnce(() => new Promise(() => {}));
  await expect(
    iconTransport('https://public.example/favicon.ico', AbortSignal.timeout(10)),
  ).rejects.toThrow('timeout');
  expect(network).not.toHaveBeenCalled();
  for (const reply of [{ length: '262145' }, { length: '1', body: Buffer.alloc(262145) }]) {
    replies.push(reply);
    await expect(
      iconTransport('https://public.example/favicon.ico', AbortSignal.timeout(500)),
    ).rejects.toThrow();
  }
});
