import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const runner = resolve('scripts/test.mjs');
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it.each(['failure', 'cancel'] as const)(
  'restores actual configuration after test %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'uptimepage-runner-'));
    roots.push(root);
    await mkdir(join(root, '.generated'));
    const original = join(root, '.generated/public-config.ts');
    await writeFile(original, 'actual configuration');
    const pnpm = join(root, 'fake-pnpm.mjs');
    await writeFile(
      pnpm,
      `
    import { writeFile } from 'node:fs/promises';
    if (process.env.UPTIMEPAGE_CONFIG !== ${JSON.stringify(join(root, 'config/default.json'))}) process.exit(9);
    if (process.argv[2] === 'run') {
      await writeFile('.generated/public-config.ts', 'default configuration');
      await writeFile('.generated/server-config.ts', 'default server configuration');
    } else if (${JSON.stringify(mode)} === 'failure') process.exitCode = 7;
    else {
      console.log('TEST_READY');
      setTimeout(() => process.exit(0), 1500);
    }
  `,
    );
    // IPC delivers the signal event portably, including Windows where kill(SIGTERM) is forceful.
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    process.on('message', () => {
      if (process.listenerCount('SIGINT')) process.emit('SIGINT');
      else process.exit(130);
    });
    process.env.npm_execpath = ${JSON.stringify(pnpm)};
    process.argv = [process.execPath, ${JSON.stringify(runner)}, 'unit'];
    await import(${JSON.stringify(pathToFileURL(runner).href)});
    process.disconnect();
  `,
        'unit',
      ],
      {
        cwd: root,
        env: { ...process.env, npm_execpath: pnpm, UPTIMEPAGE_CONFIG: 'ignored-custom-config' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    );
    const result = new Promise<number | null>((done, fail) => {
      child.on('error', fail);
      child.on('close', done);
    });
    let output = '';
    child.stderr!.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stdout!.on('data', (chunk) => {
      output += chunk.toString();
      if (mode === 'cancel' && output.includes('TEST_READY')) child.send('cancel');
    });
    try {
      expect(await result, output).toBe(mode === 'failure' ? 7 : 130);
      expect(await readFile(original, 'utf8')).toBe('actual configuration');
      await expect(readFile(join(root, '.generated/server-config.ts'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  },
);
