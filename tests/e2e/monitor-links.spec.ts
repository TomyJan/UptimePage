import { test, expect } from '@playwright/test';
import { groupFixture, detailFixture } from '../../src/demo/fixtures.ts';

test.use({ baseURL: 'http://127.0.0.1:4173' });

test('disabled site settings hide API links on home and direct details', async ({ page }) => {
  await page.route('**/api/v1/groups/core', (route) => {
    const data = groupFixture('core', 1);
    data.monitors[0].url = 'https://example.com/';
    return route.fulfill({ json: data });
  });
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', (route) => {
    const data = detailFixture('core', 'm1', '24h')!;
    data.monitor.url = 'https://example.com/';
    return route.fulfill({ json: data });
  });
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(1);
  await expect(page.locator('.monitor-visit')).toHaveCount(0);
  await page.locator('.monitor').click();
  await expect(page.locator('.detail-name h1')).toBeVisible();
  await expect(page.locator('.monitor-visit')).toHaveCount(0);
});
