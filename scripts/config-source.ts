import { readFile } from 'node:fs/promises';
import { parseConfig, type SiteConfig } from '../config/schema.ts';

const githubHosts = new Set([
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'github.com',
]);

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
class ConfigRedirectError extends Error {}

async function fetchConfiguration(target: string, fetcher: typeof fetch, signal: AbortSignal) {
  let current = target;
  for (let redirects = 0; ; redirects++) {
    const response = await fetcher(current, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      redirect: 'manual',
      signal,
    });
    if (!redirectStatuses.has(response.status)) return response;
    await response.body?.cancel().catch(() => {});
    if (redirects >= 5) throw new ConfigRedirectError('too many redirects');
    const location = response.headers.get('location');
    let next: URL;
    try {
      if (!location) throw new Error();
      next = new URL(location, current);
    } catch {
      throw new ConfigRedirectError('invalid redirect');
    }
    if (next.protocol !== 'https:' || next.username || next.password)
      throw new ConfigRedirectError('invalid redirect');
    current = next.href;
  }
}

async function remoteConfig(location: string, fetcher: typeof fetch): Promise<SiteConfig> {
  let url: URL;
  try {
    url = new URL(location);
  } catch {
    throw new Error('Invalid configuration URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Configuration URL must use HTTPS without credentials');
  const attempts = githubHosts.has(url.hostname)
    ? [
        ['proxy', `https://ghfast.top/${url.href}`],
        ['direct', url.href],
      ]
    : [['direct', url.href]];
  const failures: string[] = [];
  for (const [label, target] of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetchConfiguration(target, fetcher, controller.signal);
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        failures.push(`${label}: HTTP ${response.status}`);
        continue;
      }
      const text = await response.text();
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        failures.push(`${label}: invalid JSON`);
        continue;
      }
      try {
        return parseConfig(value);
      } catch (error) {
        failures.push(`${label}: invalid configuration (${(error as Error).message})`);
      }
    } catch (error) {
      const reason =
        error instanceof ConfigRedirectError
          ? error.message
          : controller.signal.aborted
            ? 'timeout'
            : 'network';
      failures.push(`${label}: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Unable to load remote configuration (${failures.join('; ')})`);
}

export async function readConfig(
  location = process.env.UPTIMEPAGE_CONFIG,
  fetcher: typeof fetch = fetch,
) {
  if (location) {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(location)) return remoteConfig(location, fetcher);
    return parseConfig(JSON.parse(await readFile(location, 'utf8')));
  }
  let text: string;
  try {
    text = await readFile('config/site.json', 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    text = await readFile('config/default.json', 'utf8');
  }
  return parseConfig(JSON.parse(text));
}
