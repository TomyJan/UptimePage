import { test, expect } from '@playwright/test';
import { groupFixture } from '../../src/demo/fixtures.ts';
test.use({ baseURL: 'http://127.0.0.1:4173' });
test('default production builds ignore the editor query and still fetch real API routes', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/v1/groups/core', (route) => {
    calls++;
    return route.fulfill({ json: groupFixture('core') });
  });
  await page.goto('/?configeditor=on');
  await expect(page.locator('.monitor')).toHaveCount(10);
  await expect(page.locator('.ce-workspace')).toHaveCount(0);
  expect(calls).toBeGreaterThan(0);
});
