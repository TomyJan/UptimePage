import { test, expect } from '@playwright/test';
import { groupFixture } from '../../src/demo/fixtures.ts';

test.use({ baseURL: 'http://127.0.0.1:4173' });

test('a stalled font stylesheet does not block the app or data loading', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('https://cdn.amoe.cc/**/misans.css', async (route) => {
    await pending;
    await route.fulfill({
      contentType: 'text/css',
      body: ':root { --font-stylesheet-loaded: yes; }',
    });
  });
  await page.route('**/api/v1/groups/core', (route) =>
    route.fulfill({ json: groupFixture('core', 2) }),
  );
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('.monitor').first()).toBeVisible();
    await expect(page.locator('.monitor-loading')).toHaveCount(0);
  } finally {
    release();
  }
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--font-stylesheet-loaded')
          .trim(),
      ),
    )
    .toBe('yes');
});
