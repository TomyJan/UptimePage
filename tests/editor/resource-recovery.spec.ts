import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('resource failure preserves an edited draft, export and the editor while avoiding a reload', async ({
  page,
}) => {
  let documents = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
  });
  await page.route('**/src/features/monitor/MonitorPage.tsx*', (route) => route.abort());
  await page.goto('/?configeditor=on');
  await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Keep expanded', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Saved draft');
  await page.locator('.monitor-name').first().click();
  await expect(page).toHaveURL(/\/services\/.+configeditor=on/);
  await expect(page.getByRole('alert')).toContainText('Export it before reloading');
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Saved draft');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export configuration JSON', exact: true }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe('site.json');
  const config = JSON.parse(await readFile((await exported.path())!, 'utf8'));
  expect(config.site.name.en).toBe('Saved draft');
  expect(documents).toBe(1);
  await page.locator('.brand').click();
  await expect(page.locator('.monitor-name').first()).toBeVisible();
  await expect(page.locator('.brand-name')).toHaveText('Saved draft');
  await page.getByRole('button', { name: 'Exit preview', exact: true }).click();
  await expect(page.locator('.ce-workspace')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
});
