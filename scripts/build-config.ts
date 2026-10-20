import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseConfig, splitConfig } from '../config/schema.ts';
const execFileAsync = promisify(execFile);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const config = parseConfig(
  JSON.parse(await readFile(process.env.UPTIMEPAGE_CONFIG || 'config/site.json', 'utf8')),
);
const version = createHash('sha256').update(canonical(config)).digest('hex');
let commit = process.env.UPTIMEPAGE_COMMIT?.trim() ?? '';
if (!commit) {
  try {
    commit = (await execFileAsync('git', ['rev-parse', '--short=7', 'HEAD'])).stdout.trim();
  } catch {
    commit = 'dev';
  }
}
const { publicConfig, serverConfig } = splitConfig(config, version, {
  commit,
  commitUrl: `https://github.com/TomyJan/UptimePage/commit/${commit}`,
});
await mkdir('.generated', { recursive: true });
for (const [name, data] of [
  ['public', publicConfig],
  ['server', serverConfig],
] as const) {
  const header =
    name === 'public'
      ? "import type { PublicConfig } from '../src/shared/config.ts';\nconst config:PublicConfig = "
      : "import type { ServerConfig } from '../src/server/config.ts';\nconst config:ServerConfig = ";
  await writeFile(
    `.generated/${name}-config.ts`,
    `// Generated; do not edit.\n${header}${JSON.stringify(data, null, 2)};\nexport default config;\n`,
  );
}
console.log(`Configuration generated (${version.slice(0, 8)})`);
