import { monitorDetailSchema } from '../src/shared/contracts.ts';
import { compactGroupSchema, decodeGroupSnapshot } from '../src/shared/home.ts';
import { rangeMilliseconds } from '../src/shared/ranges.ts';

export interface DeploymentConfig {
  configVersion: string;
  groups: { id: string; subgroups: { id: string }[] }[];
}

export async function verifyDeployment(
  target: string,
  config: DeploymentConfig,
  fetcher: typeof fetch = fetch,
  requiredAssets: string[] = [],
): Promise<{ checks: string[]; skipped: string[] }> {
  let base: URL;
  try {
    base = new URL(target);
    if (
      (base.protocol !== 'https:' &&
        !(
          base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
        )) ||
      base.username ||
      base.password ||
      base.pathname !== '/' ||
      base.search ||
      base.hash
    )
      throw new Error();
  } catch {
    throw new Error(
      'Invalid target: use an HTTPS origin, or HTTP localhost, without credentials, path or query',
    );
  }
  const checks: string[] = [],
    skipped: string[] = [];
  function ensure(ok: unknown, reason: string): asserts ok {
    if (!ok) throw new Error(reason);
  }
  async function request(path: string, method = 'GET') {
    try {
      return await fetcher(new URL(path, base), {
        method,
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        // Cold aggregation may use the configured 120-second cloud budget.
        signal: AbortSignal.timeout(path.startsWith('/api/') ? 125000 : 15000),
      });
    } catch {
      throw new Error(`${method} ${path}: network, redirect or timeout failure`);
    }
  }
  async function json(path: string, status = 200, method = 'GET'): Promise<unknown> {
    const response = await request(path, method);
    ensure(
      /^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? ''),
      `${path}: expected JSON; check function routing`,
    );
    ensure(response.status === status, `${path}: HTTP ${response.status}, expected ${status}`);
    ensure(
      /(?:^|,)\s*no-store(?:\s*,|\s*$)/i.test(response.headers.get('cache-control') ?? ''),
      `${path}: expected no-store`,
    );
    try {
      return await response.json();
    } catch {
      throw new Error(`${path}: invalid JSON`);
    }
  }
  type Asset = { path: string; kind: 'JavaScript' | 'CSS' };
  function moduleAssets(html: string): Asset[] {
    const attribute = (tag: string, name: string) =>
      tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
    const assets: Asset[] = [];
    for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
      const rel = attribute(tag, 'rel')?.toLowerCase().split(/\s+/) ?? [];
      const script = /^<script\b/i.test(tag);
      const href = attribute(tag, script ? 'src' : 'href');
      if (!href || (!script && !rel.some((r) => ['stylesheet', 'modulepreload'].includes(r))))
        continue;
      const url = new URL(href, base);
      // The optional font is independent of the application bundle.
      if (
        !script &&
        rel.includes('stylesheet') &&
        !rel.includes('modulepreload') &&
        url.href === 'https://cdn.amoe.cc/web-static/public/font/misans/misans.css'
      )
        continue;
      ensure(
        url.origin === base.origin && !url.username && !url.password,
        'Expected same-origin app assets',
      );
      assets.push({
        path: url.pathname + url.search,
        kind: rel.includes('stylesheet') ? 'CSS' : 'JavaScript',
      });
    }
    ensure(
      /\bid=["']root["']/.test(html) && assets.some((asset) => asset.kind === 'JavaScript'),
      'Expected app HTML with root and script assets',
    );
    return assets.sort((a, b) => a.path.localeCompare(b.path));
  }
  async function html(path: string) {
    const response = await request(path);
    ensure(
      response.status === 200 && /text\/html/i.test(response.headers.get('content-type') ?? ''),
      `${path}: expected app HTML with HTTP 200`,
    );
    return moduleAssets(await response.text());
  }
  async function rejected(path: string, code: string, status: number, method = 'GET') {
    const body = await json(path, status, method);
    ensure(
      body &&
        typeof body === 'object' &&
        'error' in body &&
        body.error &&
        typeof body.error === 'object' &&
        'code' in body.error &&
        body.error.code === code,
      `${path}: unexpected error code`,
    );
  }
  const assets = await html('/');
  const buildAssets: Asset[] = requiredAssets.map((path) => ({
    path,
    kind: /\.css$/i.test(path) ? 'CSS' : 'JavaScript',
  }));
  const allAssets = new Map([...assets, ...buildAssets].map((asset) => [asset.path, asset]));
  for (const asset of allAssets.values()) {
    const response = await request(asset.path);
    ensure(
      response.status === 200 &&
        (asset.kind === 'CSS' ? /^text\/css(?:;|$)/i : /(?:java|ecma)script/i).test(
          response.headers.get('content-type') ?? '',
        ),
      `${asset.path}: expected ${asset.kind}, not SPA fallback HTML`,
    );
  }
  checks.push('Homepage and assets');
  for (const method of ['GET', 'POST'])
    await rejected('/_uptimepage/cache', 'not-found', 404, method);
  checks.push('Unsigned cache requests rejected');
  let unknown = 'uptimepage-validation-nonexistent';
  while (config.groups.some((group) => group.id === unknown)) unknown += '-x';
  await rejected(`/api/v1/groups/${unknown}`, 'not-found', 404);
  checks.push('Unknown group rejected');
  for (const group of config.groups) {
    const path = `/api/v1/groups/${encodeURIComponent(group.id)}`;
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
      await rejected(path, 'not-found', 404, method);
    checks.push(`${group.id}: write methods rejected`);
    const parsed = compactGroupSchema.transform(decodeGroupSnapshot).safeParse(await json(path));
    ensure(parsed.success, `${group.id}: expected complete home-v1 snapshot contract`);
    const snapshot = parsed.data;
    ensure(
      snapshot.configVersion === config.configVersion,
      `${group.id}: configuration version mismatch`,
    );
    ensure(snapshot.groupId === group.id, `${group.id}: group identity mismatch`);
    const age = Date.now() - Date.parse(snapshot.fetchedAt);
    ensure(
      snapshot.freshness === 'fresh' &&
        !snapshot.subgroupErrors.length &&
        age >= -60000 &&
        age < 300000 &&
        snapshot.monitors.every((m) => m.freshness === 'fresh'),
      `${group.id}: expected fresh complete snapshot`,
    );
    const ids = new Set(snapshot.monitors.map((monitor) => monitor.id));
    const subgroupIds = new Set(group.subgroups.map((subgroup) => subgroup.id));
    ensure(
      snapshot.monitors.every(
        (m) =>
          m.groupId === group.id &&
          m.subgroupIds.length > 0 &&
          m.subgroupIds.every((id) => subgroupIds.has(id)),
      ) &&
        snapshot.subgroups.every(
          (s) => subgroupIds.has(s.id) && s.monitorIds.every((id) => ids.has(id)),
        ),
      `${group.id}: invalid public membership`,
    );
    checks.push(`${group.id}: snapshot`);
    let absent = 'uptimepage-validation-nonexistent';
    while (ids.has(absent)) absent += '-x';
    await rejected(`${path}/monitors/${absent}?range=24h`, 'not-found', 404);
    checks.push(`${group.id}: unknown monitor rejected`);
    const monitor = snapshot.monitors[0];
    if (!monitor) {
      skipped.push(`${group.id}: detail and deep link (no public monitors)`);
      continue;
    }
    const detailPath = `${path}/monitors/${encodeURIComponent(monitor.id)}`;
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
      await rejected(detailPath, 'not-found', 404, method);
    const detail = monitorDetailSchema.safeParse(await json(`${detailPath}?range=24h`));
    ensure(detail.success, `${group.id}: invalid detail contract`);
    ensure(
      detail.data.configVersion === config.configVersion,
      `${group.id}: detail version mismatch`,
    );
    ensure(
      detail.data.monitor.groupId === group.id &&
        detail.data.monitor.id === monitor.id &&
        detail.data.range === '24h',
      `${group.id}: detail identity mismatch`,
    );
    const detailAge = Date.now() - Date.parse(detail.data.fetchedAt);
    ensure(
      detail.data.monitor.freshness === 'fresh' && detailAge >= -60000 && detailAge < 300000,
      `${group.id}: expected fresh detail`,
    );
    checks.push(`${group.id}: detail`);
    ensure(
      ['24h', '7d', '30d'].every((range) =>
        detail.data.supportedRanges.includes(range as '24h' | '7d' | '30d'),
      ),
      `${group.id}: expected all supported ranges`,
    );
    for (const range of ['7d', '30d'] as const) {
      const parsedRange = monitorDetailSchema.safeParse(await json(`${detailPath}?range=${range}`));
      ensure(parsedRange.success, `${group.id}: ${range} invalid detail contract`);
      const value = parsedRange.data;
      ensure(
        value.range === range &&
          value.monitor.id === monitor.id &&
          value.monitor.groupId === group.id &&
          value.configVersion === config.configVersion,
        `${group.id}: ${range} detail identity mismatch`,
      );
      ensure(
        value.periodUptime.from !== null &&
          value.periodUptime.until !== null &&
          Date.parse(value.periodUptime.until) - Date.parse(value.periodUptime.from) ===
            rangeMilliseconds(range),
        `${group.id}: ${range} incorrect metric window`,
      );
      const age = Date.now() - Date.parse(value.fetchedAt);
      ensure(
        value.monitor.freshness === 'fresh' && !value.diagnostic && age >= -60000 && age < 300000,
        `${group.id}: ${range} expected fresh detail`,
      );
      checks.push(`${group.id}: detail ${range}`);
    }

    await rejected(`${detailPath}?range=invalid`, 'invalid-response', 502);
    checks.push(`${group.id}: unsupported range rejected`);
    const deepAssets = await html(
      `/services/${encodeURIComponent(group.id)}/${encodeURIComponent(monitor.id)}`,
    );
    ensure(
      JSON.stringify(deepAssets) === JSON.stringify(assets),
      `${group.id}: deep HTML loads different app assets`,
    );
    checks.push(`${group.id}: deep link`);
  }
  return { checks, skipped };
}
