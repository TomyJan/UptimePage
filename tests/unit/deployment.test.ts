import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { verifyDeployment } from '../../scripts/deployment-checks.ts';
import { handleApi } from '../../src/server/api.ts';
import { config, fetcher } from '../fixtures/server.ts';

const serverConfig = config();
const publicConfig = { configVersion: serverConfig.configVersion, groups: serverConfig.groups };
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
type Mode =
  | 'ok'
  | 'html-api'
  | 'wrong-version'
  | 'stale'
  | 'broken-deep-link'
  | 'asset-html'
  | 'dependency-missing'
  | 'accepts-write'
  | 'public-cache'
  | 'legacy-home'
  | 'broken-long-range'
  | 'external-script'
  | 'external-preload'
  | 'credential-asset'
  | 'broken-cache-bridge';
async function serve(mode: Mode = 'ok') {
  const server = createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const url = new URL(req.url!, origin);
    let response: Response;
    if (url.pathname === '/_uptimepage/cache') {
      response =
        mode === 'broken-cache-bridge'
          ? new Response('Error return from script', { status: 545 })
          : Response.json(
              { error: { code: 'not-found' } },
              { status: 404, headers: { 'cache-control': 'no-store' } },
            );
    } else if (url.pathname.startsWith('/api/') && mode !== 'html-api') {
      response = await handleApi(new Request(url, { method: req.method }), {
        config:
          mode === 'wrong-version' ? { ...serverConfig, configVersion: 'wrong' } : serverConfig,
        environment: { KEY: 'test-only-secret' },
        fetcher,
      });
      if (response.ok && mode === 'stale') {
        const body = await response.json();
        body.freshness = 'stale';
        response = Response.json(body, { headers: { 'cache-control': 'no-store' } });
      }
      if (mode === 'public-cache') response.headers.set('cache-control', 'public, max-age=3600');
      if (mode === 'legacy-home' && response.ok && url.pathname === '/api/v1/groups/core') {
        const { groupResponseSchema } = await import('../../src/shared/home.ts');
        response = Response.json(groupResponseSchema.parse(await response.json()), {
          headers: { 'cache-control': 'no-store' },
        });
      }
      if (mode === 'broken-long-range' && response.ok && url.searchParams.get('range') === '7d') {
        const body = await response.json();
        body.range = '24h';
        response = Response.json(body, { headers: { 'cache-control': 'no-store' } });
      }

      if (
        mode === 'accepts-write' &&
        url.pathname === '/api/v1/groups/core' &&
        req.method === 'POST'
      )
        response = Response.json({}, { headers: { 'cache-control': 'no-store' } });
    } else if (url.pathname === '/assets/style.css' && mode !== 'dependency-missing') {
      response = new Response('body{}', { headers: { 'content-type': 'text/css' } });
    } else if (url.pathname === '/assets/validation.js' && mode !== 'dependency-missing') {
      response = new Response('export{}', { headers: { 'content-type': 'text/javascript' } });
    } else if (url.pathname === '/assets/app.js' && mode !== 'asset-html') {
      response = new Response('console.log("app")', {
        headers: { 'content-type': 'text/javascript' },
      });
    } else {
      const appScript =
        mode === 'external-script'
          ? 'https://cdn.example.com/app.js'
          : mode === 'credential-asset'
            ? `${origin.replace('://', '://user:secret@')}/assets/app.js`
            : '/assets/app.js';
      const preload =
        mode === 'external-preload'
          ? 'https://cdn.example.com/validation.js'
          : '/assets/validation.js';
      const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
        .replace('/src/main.tsx', appScript)
        .replace(
          '</head>',
          `<link rel="stylesheet" href="/assets/style.css"><link rel="modulepreload" href="${preload}"></head>`,
        );
      response = new Response(html, {
        status: mode === 'broken-deep-link' && url.pathname.startsWith('/services/') ? 404 : 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

it('checks actual app HTML with its optional external font, API, deep routes and app assets', async () => {
  const report = await verifyDeployment(await serve(), publicConfig);
  expect(report.checks).toEqual(
    expect.arrayContaining([
      'Homepage and assets',
      'Unknown group rejected',
      'Unsigned cache requests rejected',
      'core: snapshot',
      'core: detail',
      'core: detail 7d',
      'core: detail 30d',
      'core: unknown monitor rejected',
      'core: unsupported range rejected',
      'core: deep link',
    ]),
  );
  expect(report.skipped).toEqual([]);
});

it.each([
  ['html-api', /JSON/],
  ['wrong-version', /version/i],
  ['stale', /fresh/i],
  ['broken-deep-link', /HTML/],
  ['asset-html', /JavaScript/],
  ['public-cache', /no-store/],
  ['dependency-missing', /CSS|JavaScript/],
  ['accepts-write', /HTTP 200/],
  ['legacy-home', /home-v1/i],
  ['broken-long-range', /7d.*identity|7d.*range/i],
  ['broken-cache-bridge', /JSON|545/],
  ['external-script', /same-origin/],
  ['external-preload', /same-origin/],
  ['credential-asset', /same-origin/],
] as const)('fails deployment validation for %s', async (mode, reason) => {
  await expect(verifyDeployment(await serve(mode), publicConfig)).rejects.toThrow(reason);
});

it('also verifies build chunks that are only loaded on the detail page', async () => {
  await expect(
    verifyDeployment(await serve(), publicConfig, fetch, ['/assets/MonitorPage.js']),
  ).rejects.toThrow(/JavaScript/);
});

it.each([
  '',
  'http://example.com',
  'https://user:secret@example.com',
  'https://example.com/path',
  'https://example.com/?key=secret',
])('rejects unsafe or ambiguous target %s before making requests', async (target) => {
  let requests = 0;
  await expect(
    verifyDeployment(target, publicConfig, async () => {
      requests++;
      throw new Error('unexpected request');
    }),
  ).rejects.toThrow(/target/i);
  expect(requests).toBe(0);
});
