import config from '../.generated/public-config.ts';
import { verifyDeployment } from './deployment-checks.ts';
import { readdir } from 'node:fs/promises';

try {
  const assets = (await readdir('dist', { recursive: true }))
    .filter((path) => /\.(?:js|css)$/i.test(path))
    .map((path) => '/' + path.replaceAll('\\', '/'));
  const report = await verifyDeployment(
    process.env.UPTIMEPAGE_PREVIEW_URL ?? '',
    config,
    fetch,
    assets,
  );
  for (const check of report.checks) console.log(`PASS ${check}`);
  for (const skipped of report.skipped) console.log(`SKIP ${skipped}`);
  console.log(
    `Deployment checks: ${report.checks.length} passed, ${report.skipped.length} skipped.`,
  );
  console.log('Also verify provider data, edge CPU/quotas and optional KV in the EdgeOne console.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Deployment validation failed');
  console.error(
    'Set UPTIMEPAGE_PREVIEW_URL to the preview origin and use the same UPTIMEPAGE_CONFIG as the deployment.',
  );
  process.exitCode = 1;
}
