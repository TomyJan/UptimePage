import { expect, it, vi } from 'vitest';
import { handleIcon } from '../../../src/server/icon-api.ts';
import { handleApi } from '../../../src/server/api.ts';
import { createIconUrl, readIconTarget } from '../../../src/server/icon-token.ts';
import { loadGroupSnapshot } from '../../../src/server/snapshot.ts';
import { config, raw, now, memoryCache } from '../../fixtures/server.ts';
import type { IconTransport } from '../../../src/server/icons.ts';
import type { ApiRuntime } from '../../../src/server/api.ts';

import { png } from '../../fixtures/icon.ts';
const runtime = () => ({
  config: config(),
  environment: { KEY: 'secret' },
  now,
  cache: memoryCache(),
  inFlight: new Map<string, Promise<unknown>>(),
});
const path = (time = now, target = 'https://private.example') =>
  createIconUrl(target, 'core', 'secret', config().configVersion, time)!;
const request = (value = path()) => new Request('https://status.example' + value);

it('generates automatic icons before removing hidden URLs without an extra source request', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      stat: 'ok',
      monitors: [{ ...raw, url: 'https://private.example/path?secret=value' }],
      pagination: { total: 1 },
    }),
  );
  const snapshot = await loadGroupSnapshot(
    config(),
    'core',
    { KEY: 'secret' },
    fetcher,
    now,
    undefined,
    false,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(snapshot.monitors[0]).not.toHaveProperty('url');
  const logo = snapshot.monitors[0].logo!;
  expect(logo).toMatch(/^\/api\/v1\/icons\/core\//);
  expect(JSON.stringify(snapshot)).not.toMatch(/private\.example|secret=value/);
  expect(
    readIconTarget(logo.split('/').at(-1)!, 'core', 'secret', config().configVersion, now),
  ).toBe('https://private.example');
  const custom = config();
  custom.groups[0].monitors['1'] = { logo: '/manual.png' };
  fetcher.mockResolvedValueOnce(
    Response.json({ stat: 'ok', monitors: [{ ...raw, url: 'https://private.example' }] }),
  );
  expect(
    (await loadGroupSnapshot(custom, 'core', { KEY: 'secret' }, fetcher, now, undefined, false))
      .monitors[0].logo,
  ).toBe('/manual.png');
});

it('uses authenticated Peekaping configuration URLs even when monitor links are hidden', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    if (String(input).includes('/status-pages/'))
      return Response.json({ data: [{ id: '1', name: 'Public' }] });
    return Response.json({
      data: [
        {
          id: '1',
          name: 'Public',
          active: true,
          type: 'http',
          config: JSON.stringify({ url: 'https://private.example/nested?private=query' }),
        },
      ],
    });
  });
  const snapshot = await loadGroupSnapshot(
    config(true),
    'core',
    { KEY: 'secret' },
    fetcher,
    now,
    undefined,
    false,
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(snapshot.monitors).toHaveLength(1);
  expect(snapshot.monitors[0]).not.toHaveProperty('url');
  expect(
    readIconTarget(
      snapshot.monitors[0].logo!.split('/').at(-1)!,
      'core',
      'secret',
      config().configVersion,
      now,
    ),
  ).toBe('https://private.example');
  expect(JSON.stringify(snapshot)).not.toContain('private.example');
});

it('forwards bytes without redirects, source headers or target metadata and shares cache across tokens for the same target', async () => {
  const rt = runtime();
  const transport = vi.fn<IconTransport>().mockResolvedValue(
    new Response(png, {
      headers: {
        'set-cookie': 'private=1',
        location: 'https://private.example',
        server: 'private',
      },
    }),
  );
  const first = await handleIcon(request(), rt, transport);
  expect(first.status).toBe(200);
  expect(first.headers.get('content-type')).toBe('image/png');
  expect(Buffer.from(await first.arrayBuffer())).toEqual(png);
  expect([...first.headers.values()].join(' ')).not.toMatch(/private\.example|private=1/);
  expect(first.headers.has('server')).toBe(false);
  expect(first.headers.has('location')).toBe(false);
  expect(first.headers.has('set-cookie')).toBe(false);
  expect(
    (
      await handleIcon(
        request(path(new Date(+now + 1000))),
        { ...rt, now: new Date(+now + 1000) },
        transport,
      )
    ).status,
  ).toBe(200);
  expect(transport).toHaveBeenCalledTimes(1);
});

it('coalesces concurrent loads, negative-caches failed providers, and retries after expiry', async () => {
  const rt = runtime();
  const transport = vi
    .fn<IconTransport>()
    .mockImplementation(async () => new Response(null, { status: 404 }));
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => handleIcon(request(), rt, transport)),
  );
  expect(responses.every((r) => r.status === 404)).toBe(true);
  expect(transport).toHaveBeenCalledTimes(4);
  await handleIcon(request(), rt, transport);
  expect(transport).toHaveBeenCalledTimes(4);
  await handleIcon(request(), { ...rt, now: new Date(+now + 61000) }, transport);
  expect(transport).toHaveBeenCalledTimes(8);
  expect(rt.inFlight.size).toBe(0);
});

it('rejects expired, tampered, unconfigured, query and method requests before cache or network access', async () => {
  const rt = runtime();
  const transport = vi.fn<IconTransport>();
  const cache = { match: vi.fn(), put: vi.fn() };
  const cases: [Request, Partial<ApiRuntime>][] = [
    [request(path(new Date(+now - 901000))), {}],
    [request(path() + 'x'), {}],
    [request(path() + '?url=https://private.example'), {}],
    [request(), { environment: { KEY: 'rotated' } }],
    [request(), { environment: {} }],
    [request(), { config: { ...rt.config, groups: [] } }],
    [new Request(request(), { method: 'POST' }), {}],
  ];
  for (const [req, overrides] of cases)
    expect((await handleIcon(req, { ...rt, ...overrides, cache }, transport)).status).toBe(404);
  expect(transport).not.toHaveBeenCalled();
  expect(cache.match).not.toHaveBeenCalled();
  expect((await handleApi(request('/api/v1/icons/core/bad'), rt)).status).toBe(404);
});
