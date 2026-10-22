import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

const run = promisify(execFile);
const generator = resolve('scripts/build-config.ts');
let root: string;
const config = (name: string) => ({
  site: { name },
  groups: [
    {
      id: 'core',
      name: 'Core',
      source: { type: 'uptimerobot', apiKeyEnv: 'ROBOT_KEY' },
      subgroups: [{ id: 'web', name: 'Web', monitorIds: ['1'] }],
    },
  ],
});
async function generate(path?: string, preload?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, UPTIMEPAGE_COMMIT: 'aabbccd' };
  delete env.UPTIMEPAGE_CONFIG;
  if (path !== undefined) env.UPTIMEPAGE_CONFIG = path;
  await run(
    process.execPath,
    [...(preload ? ['--import', pathToFileURL(preload).href] : []), generator],
    { cwd: root, env },
  );
  return readFile(join(root, '.generated/public-config.ts'), 'utf8');
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'uptimepage-config-'));
  await mkdir(join(root, 'config'));
  await writeFile(join(root, 'config/default.json'), JSON.stringify(config('Default site')));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it('builds with the default when no actual configuration exists', async () => {
  expect(await generate()).toContain('"name": "Default site"');
});
it('uses the actual configuration as a complete replacement for the default', async () => {
  await writeFile(join(root, 'config/site.json'), JSON.stringify(config('Actual site')));
  const output = await generate();
  expect(output).toContain('"name": "Actual site"');
  expect(output).not.toContain('Default site');
});
it('keeps explicit configuration paths ahead of the actual configuration', async () => {
  await writeFile(join(root, 'config/site.json'), JSON.stringify(config('Actual site')));
  await writeFile(join(root, 'config/custom.json'), JSON.stringify(config('Explicit site')));
  expect(await generate('config/custom.json')).toContain('"name": "Explicit site"');
});
it('fails when an explicitly selected configuration is missing', async () => {
  await expect(generate('config/missing.json')).rejects.toThrow('ENOENT');
});
it.each(['{broken', JSON.stringify({ site: { name: 'Invalid site' }, groups: [] })])(
  'rejects invalid actual configuration rather than falling back: %s',
  async (input) => {
    await writeFile(join(root, 'config/site.json'), input);
    await expect(generate()).rejects.toThrow();
  },
);
it('fails on unreadable actual configuration rather than falling back', async () => {
  await mkdir(join(root, 'config/site.json'));
  await expect(generate()).rejects.toThrow();
});

it('generates build configuration from a remote URL ahead of repository configuration', async () => {
  await writeFile(join(root, 'config/site.json'), JSON.stringify(config('Repository site')));
  const preload = join(root, 'transport.mjs');
  await writeFile(
    preload,
    `globalThis.fetch = async (url) => {
    if (url !== 'https://ghfast.top/https://raw.githubusercontent.com/example/status/config/site.json') throw new Error('Unexpected URL');
    return Response.json(${JSON.stringify(config('Remote site'))});
  };`,
  );
  const output = await generate(
    'https://raw.githubusercontent.com/example/status/config/site.json',
    preload,
  );
  expect(output).toContain('"name": "Remote site"');
  expect(output).not.toContain('Repository site');
});

it('stops the build when both remote attempts fail instead of generating repository defaults', async () => {
  const preload = join(root, 'transport.mjs');
  await writeFile(
    preload,
    'globalThis.fetch = async () => new Response("Unavailable", { status: 503 });',
  );
  await expect(
    generate('https://raw.githubusercontent.com/example/status/config/site.json', preload),
  ).rejects.toThrow(/proxy: HTTP 503; direct: HTTP 503/);
  await expect(readFile(join(root, '.generated/public-config.ts'))).rejects.toThrow('ENOENT');
});
