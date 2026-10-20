import { createServer, type Server } from 'node:http';
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
  | 'public-cache';
async function serve(mode: Mode = 'ok') {
  const server = createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const url = new URL(req.url!, origin);
    let response: Response;
    if (url.pathname.startsWith('/api/') && mode !== 'html-api') {
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
      response = new Response(
        '<!doctype html><div id="root"></div><script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/style.css"><link rel="modulepreload" href="/assets/validation.js">',
        {
          status: mode === 'broken-deep-link' && url.pathname.startsWith('/services/') ? 404 : 200,
          headers: { 'content-type': 'text/html' },
        },
      );
    }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

it('checks the real API over HTTP, errors, deep routes and JavaScript assets', async () => {
  const report = await verifyDeployment(await serve(), publicConfig);
  expect(report.checks).toEqual(
    expect.arrayContaining([
      'Homepage and assets',
      'Unknown group rejected',
      'core: snapshot',
      'core: detail',
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
