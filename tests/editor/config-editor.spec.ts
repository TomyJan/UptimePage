import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { editorTemplate } from '../../src/features/editor/template.ts';
import { parseConfig } from '../../config/schema.ts';
import { groupFixture } from '../../src/demo/fixtures.ts';

test('without the query parameter an enabled build still uses the production API', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/v1/groups/core', (r) => {
    calls++;
    return r.fulfill({ json: groupFixture('core') });
  });
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(10);
  await expect(page.locator('.ce-workspace')).toHaveCount(0);
  // StrictMode can cancel and restart the initial development request.
  expect(calls).toBeGreaterThan(0);
});
test('form and JSON edit the actual page, block invalid exports and retain fixed dimensions', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/**', (r) => {
    calls++;
    return r.abort();
  });
  await page.goto('/?configeditor=on');
  await expect(page.locator('.monitor').first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Keep expanded', exact: true }).click();
  const panel = page.locator('.ce-panel'),
    before = await panel.boundingBox();
  await page.getByLabel('Name', { exact: true }).first().fill('Edited status page');
  await expect(page.locator('.brand')).toContainText('Edited status page');
  await expect(page.getByRole('button', { name: 'Import JSON', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const json = page.getByRole('textbox', { name: 'JSON', exact: true });
  const config = JSON.parse(await json.inputValue());
  expect(config.site.name.en).toBe('Edited status page');
  config.site.footer = 'Preview footer';
  await json.fill(JSON.stringify(config, null, 2));
  await expect(page.locator('.footer-custom')).toHaveText('Preview footer');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export configuration JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('site.json');
  const exported = parseConfig(JSON.parse(await readFile((await download.path())!, 'utf8')));
  expect(exported.site.footer).toBe('Preview footer');
  await json.fill('{"site":');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export configuration JSON' })).toBeDisabled();
  await expect(page.locator('.brand')).toContainText('Edited status page');
  const after = await panel.boundingBox();
  expect(Math.abs(after!.height - before!.height)).toBeLessThan(1);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
  expect(calls).toBe(0);
});
test('file import, detail navigation and refresh remain mock-only; exit restores production', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/v1/**', (r) => {
    calls++;
    return r.fulfill({ json: groupFixture('core') });
  });
  await page.goto('/?configeditor=on');
  await expect(page.locator('.monitor').first()).toBeVisible();
  const config = structuredClone(editorTemplate);
  config.site.name = { en: 'Imported site', 'zh-CN': '导入站点' };
  await page.locator('input[type=file]').setInputFiles({
    name: 'site.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(page.locator('.brand')).toContainText('Imported site');
  await page.locator('.intro h1').click();
  await expect(page.locator('.ce-panel')).toHaveAttribute('data-docked', 'true');
  await page.locator('.monitor').first().click();
  await expect(page).toHaveURL(/\/services\/.+configeditor=on/);
  await expect(page.locator('.detail-heading')).toBeVisible();
  await page.getByRole('button', { name: '7d', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('.toast-message').last()).toContainText('Refreshed');
  await page.locator('.back').click();
  await expect(page).toHaveURL(/configeditor=on/);
  expect(calls).toBe(0);
  await page.getByRole('button', { name: 'Exit preview', exact: true }).click();
  await expect(page.locator('.ce-workspace')).toHaveCount(0);
  await expect.poll(() => calls).toBeGreaterThan(0);
  await expect(page).not.toHaveURL(/configeditor=/);
  await expect(page.locator('.brand')).not.toContainText('Imported site');
});
test('docking preserves the full-size window and can be restored with keyboard focus', async ({
  page,
}) => {
  await page.goto('/?configeditor=on');
  const panel = page.locator('.ce-panel');
  await expect(panel).toBeVisible();
  await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
  const size = await panel.boundingBox();
  await page.locator('.intro h1').click();
  await page.mouse.move(20, 150);
  await expect(panel).toHaveAttribute('data-docked', 'true');
  await expect
    .poll(async () => Math.round((await panel.boundingBox())!.x))
    .toBeGreaterThan(page.viewportSize()!.width - 50);
  const dock = await panel.boundingBox();
  expect(dock!.height).toBeCloseTo(size!.height, 0);
  expect(dock!.width).toBeCloseTo(size!.width, 0);
  await page.getByRole('button', { name: 'Expand editor', exact: true }).focus();
  await expect(panel).toHaveAttribute('data-docked', 'false');
  await expect(page.getByRole('button', { name: 'Form', exact: true })).toBeFocused();
});
test('mobile and reduced-motion layouts keep both modes within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?configeditor=on');
  await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Keep expanded', exact: true }).click();
  const before = await page.locator('.ce-panel').boundingBox();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'JSON', exact: true })).toBeVisible();
  const after = await page.locator('.ce-panel').boundingBox();
  expect(before!.height).toBeCloseTo(after!.height, 0);
  expect(after!.y).toBeGreaterThan(34);
  expect(after!.x + after!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('JSON clipboard and formatting actions edit the same draft', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?configeditor=on');
  await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Keep expanded', exact: true }).click();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await page.getByRole('button', { name: 'Copy JSON', exact: true }).click();
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).groups).toHaveLength(
    2,
  );
  const imported = structuredClone(editorTemplate);
  imported.site.name = 'Clipboard status';
  await page.evaluate((value) => navigator.clipboard.writeText(value), JSON.stringify(imported));
  await page.getByRole('button', { name: 'Paste JSON', exact: true }).click();
  await expect(page.locator('.brand')).toContainText('Clipboard status');
  await page.getByRole('button', { name: 'Format JSON', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'JSON', exact: true })).toHaveValue(/\n  "site":/);
});

test('exiting a detail clears the editor parameter from its stored return link', async ({
  page,
}) => {
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ status: 404, json: { error: { code: 'not-found' } } }),
  );
  await page.goto('/?configeditor=on');
  await page.locator('.intro h1').click();
  await expect(page.locator('.ce-panel')).toHaveAttribute('data-docked', 'true');
  await page.locator('.monitor').first().click();
  await expect(page.locator('.detail-heading')).toBeVisible();
  expect(await page.evaluate(() => history.state?.usr?.returnTo)).toContain('configeditor=on');
  await page.getByRole('button', { name: 'Exit preview', exact: true }).click();
  await expect(page.locator('.ce-workspace')).toHaveCount(0);
  await expect(page.locator('.back')).not.toHaveAttribute('href', /configeditor=/);
  await page.locator('.back').click();
  await expect(page).not.toHaveURL(/configeditor=/);
  await page.reload();
  await expect(page.locator('.ce-workspace')).toHaveCount(0);
});

for (const read of ['paste', 'file'] as const) {
  for (const action of ['edit', 'reset', 'exit'] as const) {
    test(`pending ${read} cannot overwrite a newer ${action}`, async ({ page }) => {
      await page.addInitScript((method) => {
        const pending = () =>
          new Promise<string>((resolve) => {
            Object.assign(window, { completePendingRead: resolve, readStarted: true });
          });
        if (method === 'paste')
          Object.defineProperty(navigator.clipboard, 'readText', { value: pending });
        else File.prototype.text = pending;
      }, read);
      await page.goto('/?configeditor=on');
      await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
      await page.getByRole('button', { name: 'Keep expanded', exact: true }).click();
      await page.getByRole('button', { name: 'JSON', exact: true }).click();
      const config = structuredClone(editorTemplate);
      config.site.name = 'Late stale read';
      if (read === 'paste')
        await page.getByRole('button', { name: 'Paste JSON', exact: true }).click();
      else
        await page.locator('input[type=file]').setInputFiles({
          name: 'late.json',
          mimeType: 'application/json',
          buffer: Buffer.from('{}'),
        });
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as { readStarted?: boolean }).readStarted),
        )
        .toBe(true);
      if (action === 'edit') {
        const newer = structuredClone(editorTemplate);
        newer.site.name = 'Newer manual edit';
        await page.getByRole('textbox', { name: 'JSON', exact: true }).fill(JSON.stringify(newer));
      } else if (action === 'reset') {
        await page.getByRole('button', { name: 'More actions', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Reset example', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Exit preview', exact: true }).click();
        await expect(page.locator('.ce-workspace')).toHaveCount(0);
      }
      await page.evaluate(
        (text) =>
          (
            window as unknown as { completePendingRead: (value: string) => void }
          ).completePendingRead(text),
        JSON.stringify(config),
      );
      // The deferred read has settled before inspecting the next frame.
      await page.evaluate(() => new Promise(requestAnimationFrame));
      if (action === 'edit')
        await expect(page.locator('.brand')).toContainText('Newer manual edit');
      if (action === 'reset') await expect(page.locator('.brand')).toContainText('My status page');
      await expect(
        page.locator('.toast-message').filter({ hasText: /JSON pasted|JSON imported/ }),
      ).toHaveCount(0);
    });
  }
}
