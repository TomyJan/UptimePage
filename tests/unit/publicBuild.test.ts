import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { scanPublicBuild } from '../../scripts/public-build-scan.ts';
it('recursively rejects secrets even in sourcemaps while accepting clean assets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'uptimepage-scan-'));
  try {
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'index.html'), '<div>public</div>');
    await scanPublicBuild(dir, ['PRIVATE_KEY']);
    await writeFile(join(dir, 'assets', 'source.js.map'), '{"sourcesContent":["PRIVATE_KEY"]}');
    await expect(scanPublicBuild(dir, ['PRIVATE_KEY'])).rejects.toThrow('source.js.map');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
