import { test, expect } from '@playwright/test';

test('a failed editor module keeps a recoverable shell without requesting production monitors', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/api/**', (route) => {
    requests++;
    return route.abort();
  });
  await page.route('**/src/features/editor/EditorRoot.tsx*', (route) => route.abort());
  await page.goto('/?configeditor=on');
  await expect(page.getByRole('alert')).toContainText('Page resources could not be loaded');
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
  await expect(page.locator('.site-nav')).toBeVisible();
  await expect(page.locator('.status-body')).toHaveCount(0);
  expect(requests).toBe(0);
  await page.locator('.brand').click();
  await expect(page.locator('.status-body')).toHaveCount(1);
  await expect.poll(() => requests).toBeGreaterThan(0);
});
