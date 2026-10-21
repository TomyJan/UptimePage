import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { scanPublicBuild } from './public-build-scan.ts';
const root = process.cwd();
await mkdir('work', { recursive: true });
const scratch = await mkdtemp(resolve('work/public-build-'));
const generatedFiles = ['public', 'server'].map((name) => resolve(`.generated/${name}-config.ts`));
const originals = await Promise.all(generatedFiles.map((path) => readFile(path).catch(() => null)));
const forbidden = [
  'private.example.test',
  'PRIVATE_PEEK_KEY',
  'PRIVATE_ROBOT_KEY',
  'private-status-slug',
  'private-monitor-123',
  'UPTIMEPAGE_DEMO_ONLY',
  'apiKeyEnv',
  'server-config.ts',
  'Private override',
];
try {
  const input = JSON.parse(await readFile('config/default.json', 'utf8'));
  for (const group of input.groups) {
    group.source.apiKeyEnv =
      group.source.type === 'peekaping' ? 'PRIVATE_PEEK_KEY' : 'PRIVATE_ROBOT_KEY';
    for (const subgroup of group.subgroups) {
      delete subgroup.order;
      if (group.source.type === 'peekaping') {
        group.source.baseUrl = 'https://private.example.test';
        subgroup.slug = 'private-status-slug';
      } else subgroup.monitorIds = ['private-monitor-123'];
    }
    group.monitors = { 'private-monitor-123': { name: 'Private override' } };
  }
  const config = join(scratch, 'site.local.json');
  await writeFile(config, JSON.stringify(input));
  const pnpm = process.env.npm_execpath;
  if (!pnpm) throw new Error('Run with pnpm run verify:public-build');
  const pnpmIsScript = /\.(?:c|m)?js$/i.test(pnpm);
  for (const enabled of [false, true]) {
    const output = join(scratch, enabled ? 'editor-enabled' : 'editor-disabled');
    await new Promise<void>((done, fail) => {
      const child = spawn(
        pnpmIsScript ? process.execPath : pnpm,
        [...(pnpmIsScript ? [pnpm] : []), 'run', 'build', '--outDir', output],
        {
          cwd: root,
          stdio: 'inherit',
          env: {
            ...process.env,
            UPTIMEPAGE_CONFIG: config,
            VITE_DEMO: 'true',
            UPTIMEPAGE_CONFIG_EDITOR: enabled ? 'true' : 'false',
          },
        },
      );
      child.on('error', fail);
      child.on('exit', (code) =>
        code === 0 ? done() : fail(new Error(`Isolated build failed (${code})`)),
      );
    });
    await scanPublicBuild(
      output,
      enabled
        ? forbidden.filter((value) => value !== 'apiKeyEnv')
        : [...forbidden, 'UPTIMEPAGE_CONFIG_EDITOR_ONLY', 'ce-panel', 'peekaping.example.com'],
    );
    console.log(
      `${enabled ? 'Editor-enabled' : 'Default'} public build isolation verified (including VITE_DEMO=true).`,
    );
  }
} finally {
  await Promise.all(
    generatedFiles.map((path, i) =>
      originals[i] === null ? rm(path, { force: true }) : writeFile(path, originals[i]!),
    ),
  );
  await rm(scratch, { recursive: true, force: true });
}
