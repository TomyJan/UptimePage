import { afterEach, expect, it, vi } from 'vitest';
import { readConfig } from '../../scripts/config-source.ts';

const github = 'https://raw.githubusercontent.com/example/status/config/site.json';
const proxy = `https://ghfast.top/${github}`;
const example = (name: string) => ({
  site: { name },
  groups: [
    {
      id: 'core',
      name: 'Core',
      source: { type: 'uptimerobot', apiKeyEnv: 'ROBOT_KEY' },
      subgroups: [],
    },
  ],
});
function transport(reply: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const urls: string[] = [];
  const fetcher = (async (input, init) => {
    const url = String(input);
    urls.push(url);
    return reply(url, init);
  }) as typeof fetch;
  return { urls, fetcher };
}
afterEach(() => vi.useRealTimers());

it.each([
  github,
  'https://github.com/example/status/raw/refs/heads/config/site.json',
  'https://gist.githubusercontent.com/example/id/raw/site.json',
])(
  'loads GitHub configuration through ghfast before trying the original URL: %s',
  async (source) => {
    const first = `https://ghfast.top/${source}`;
    const request = transport((url) =>
      Response.json(example(url === first ? 'Proxy config' : 'Direct config')),
    );
    await expect(readConfig(source, request.fetcher)).resolves.toMatchObject({
      site: { name: 'Proxy config' },
    });
    expect(request.urls).toEqual([first]);
  },
);

it.each(['http', 'network', 'json', 'schema'])(
  'falls back to GitHub when the proxy fails with %s',
  async (failure) => {
    const request = transport((url) => {
      if (url === github) return Response.json(example('Direct config'));
      if (failure === 'http') return new Response('Unavailable', { status: 503 });
      if (failure === 'network') throw new Error('private upstream failure details');
      if (failure === 'json') return new Response('<html>proxy error</html>');
      return Response.json({ site: { name: 'Invalid config' }, groups: [] });
    });
    expect((await readConfig(github, request.fetcher)).site.name).toBe('Direct config');
    expect(request.urls).toEqual([proxy, github]);
  },
);

it('reports both failed attempts without using defaults or exposing network details', async () => {
  const request = transport((url) => {
    if (url === proxy) throw new Error('sensitive URL and upstream response');
    return new Response('Not found', { status: 404 });
  });
  await expect(readConfig(github, request.fetcher)).rejects.toMatchObject({
    message: 'Unable to load remote configuration (proxy: network; direct: HTTP 404)',
  });
  expect(request.urls).toEqual([proxy, github]);
});

it.each([
  'http://config.example.test/site.json',
  'https://user:pass@config.example.test/site.json',
])('does not follow a redirect to an insecure or credential-bearing target: %s', async (target) => {
  const request = transport((_url, init) =>
    init?.redirect === 'manual'
      ? new Response(null, { status: 302, headers: { Location: target } })
      : Response.json(example('Automatically followed insecure redirect')),
  );
  await expect(
    readConfig('https://config.example.test/start.json', request.fetcher),
  ).rejects.toThrow('invalid redirect');
  expect(request.urls).toEqual(['https://config.example.test/start.json']);
});

it('follows valid HTTPS redirects, including relative locations', async () => {
  const start = 'https://config.example.test/start.json';
  const next = 'https://config.example.test/site.json';
  const request = transport((url) =>
    url === start
      ? new Response(null, { status: 302, headers: { Location: '/site.json' } })
      : Response.json(example('Redirected config')),
  );
  await expect(readConfig(start, request.fetcher)).resolves.toMatchObject({
    site: { name: 'Redirected config' },
  });
  expect(request.urls).toEqual([start, next]);
});

it('bounds redirect loops rather than hanging the build', async () => {
  const request = transport(
    () => new Response(null, { status: 302, headers: { Location: '/loop' } }),
  );
  await expect(readConfig('https://config.example.test/loop', request.fetcher)).rejects.toThrow(
    'too many redirects',
  );
  expect(request.urls).toHaveLength(6);
});

it.each([
  'https://config.example.test/site.json',
  'https://raw.githubusercontent.com.example.test/site.json',
  proxy,
])('loads a self-hosted URL directly without adding a GitHub proxy: %s', async (url) => {
  const request = transport(() => Response.json(example('Hosted config')));
  expect((await readConfig(url, request.fetcher)).site.name).toBe('Hosted config');
  expect(request.urls).toEqual([url]);
});

it.each([
  'http://config.example.test/site.json',
  'ftp://config.example.test/site.json',
  'https://user:pass@example.test/site.json',
])('rejects unsupported or credential-bearing config URLs: %s', async (url) => {
  const request = transport(() => Response.json(example('Not used')));
  await expect(readConfig(url, request.fetcher)).rejects.toThrow(/HTTPS.*credentials/);
  expect(request.urls).toEqual([]);
});

it('fails on invalid self-hosted JSON instead of silently using another configuration', async () => {
  const request = transport(() => new Response('not JSON'));
  await expect(
    readConfig('https://config.example.test/site.json', request.fetcher),
  ).rejects.toThrow(/direct: invalid JSON/);
});

it('times out a stalled proxy and still tries GitHub directly', async () => {
  vi.useFakeTimers();
  const request = transport((url, init) =>
    url === github
      ? Response.json(example('Direct config'))
      : new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), {
            once: true,
          });
        }),
  );
  const loading = readConfig(github, request.fetcher);
  await vi.advanceTimersByTimeAsync(10_000);
  expect((await loading).site.name).toBe('Direct config');
  expect(request.urls).toEqual([proxy, github]);
});
