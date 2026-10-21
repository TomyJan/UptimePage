import { defineConfig } from '@playwright/test';

const target = process.env.UPTIMEPAGE_PREVIEW_URL;
if (!target) throw new Error('Set UPTIMEPAGE_PREVIEW_URL to the deployed HTTPS origin');
const origin = new URL(target);
if (
  origin.protocol !== 'https:' ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash
)
  throw new Error('Use an HTTPS origin without credentials, path or query');

export default defineConfig({
  testDir: 'tests/deployment',
  outputDir: 'test-results/deployment',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: origin.origin,
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
