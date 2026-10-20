import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
export async function scanPublicBuild(directory: string, forbidden: string[]): Promise<void> {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) {
      await scanPublicBuild(path, forbidden);
      continue;
    }
    if (!['.html', '.js', '.css', '.json', '.map'].includes(extname(path))) continue;
    const content = await readFile(path, 'utf8');
    for (const value of forbidden)
      if (content.includes(value))
        throw new Error(`Private field or demo data leaked in ${path}: ${value}`);
  }
}
