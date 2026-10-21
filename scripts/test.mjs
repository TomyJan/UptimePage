import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [suite, ...args] = process.argv.slice(2);
if (!['unit', 'browser', 'editor'].includes(suite))
  throw new Error('Select unit, browser or editor tests');
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error('Run tests through pnpm test or pnpm run test:e2e');
const script = /\.(?:c|m)?js$/i.test(pnpm);
const env = { ...process.env, UPTIMEPAGE_CONFIG: resolve('config/default.json') };
const generated = ['public', 'server'].map((name) => resolve(`.generated/${name}-config.ts`));
const originals = await Promise.all(
  generated.map(async (path) => {
    try {
      return await readFile(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return null;
    }
  }),
);
let activeChild;
let interrupted;
const interrupt = (signal) => {
  interrupted ??= signal === 'SIGINT' ? 130 : 143;
  activeChild?.kill(signal);
};
const onInterrupt = () => interrupt('SIGINT');
const onTerminate = () => interrupt('SIGTERM');
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onTerminate);
function run(command) {
  return new Promise((resolve, reject) => {
    if (interrupted) return resolve(interrupted);
    const child = spawn(script ? process.execPath : pnpm, [...(script ? [pnpm] : []), ...command], {
      env,
      stdio: 'inherit',
    });
    activeChild = child;
    child.on('error', reject);
    child.on('close', (code) => {
      activeChild = undefined;
      resolve(interrupted ?? code ?? 1);
    });
  });
}
try {
  process.exitCode = await run(['run', 'generate']);
  if (!process.exitCode)
    process.exitCode = await run([
      'exec',
      ...(suite === 'unit' ? ['vitest', 'run'] : ['playwright', 'test']),
      ...(suite === 'editor' ? ['--config', 'playwright.editor.config.ts'] : []),
      ...args,
    ]);
} finally {
  await Promise.all(
    generated.map((path, index) =>
      originals[index] === null ? rm(path, { force: true }) : writeFile(path, originals[index]),
    ),
  );
  process.off('SIGINT', onInterrupt);
  process.off('SIGTERM', onTerminate);
  if (interrupted) process.exitCode = interrupted;
}
