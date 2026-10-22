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

test('Umami configuration round-trips without executing a draft tracker in development', async ({
  page,
}) => {
  let requests = 0;
  await page.route('https://analytics.example.test/**', (route) => {
    requests++;
    return route.abort();
  });
  await page.goto('/?configeditor=on');
  await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Keep expanded', exact: true }).click();
  await page.getByRole('button', { name: 'Enable Umami', exact: true }).click();
  await page
    .getByLabel('Tracker script URL', { exact: true })
    .fill('https://analytics.example.test/script.js');
  await page.getByLabel('Website ID', { exact: true }).fill('94db1cb1-74f4-4a40-ad6c-962362670409');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const exported = parseConfig(
    JSON.parse(await page.getByRole('textbox', { name: 'JSON', exact: true }).inputValue()),
  );
  expect(exported.site.umami?.websiteId).toBe('94db1cb1-74f4-4a40-ad6c-962362670409');
  await expect(page.locator('#uptimepage-umami')).toHaveCount(0);
  expect(requests).toBe(0);
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

test('corrected monitor and subgroup logos recover after a failed image load', async ({ page }) => {
  await page.route('**/missing-logo.svg', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/valid-logo.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
    }),
  );
  await page.goto('/?configeditor=on');
  await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Keep expanded', exact: true }).click();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const config = structuredClone(editorTemplate);
  const json = page.getByRole('textbox', { name: 'JSON', exact: true });
  config.groups[0].monitors['web-1'].logo = '/missing-logo.svg';
  config.groups[0].subgroups[0].logo = '/missing-logo.svg';
  await json.fill(JSON.stringify(config));
  const broken = page.locator('img[src="/missing-logo.svg"]');
  await expect(broken).toHaveCount(2);
  await expect(broken.first()).toHaveCSS('visibility', 'hidden');
  await expect(broken.last()).toHaveCSS('visibility', 'hidden');
  config.groups[0].monitors['web-1'].logo = '/valid-logo.svg';
  config.groups[0].subgroups[0].logo = '/valid-logo.svg';
  await json.fill(JSON.stringify(config));
  const repaired = page.locator('img[src="/valid-logo.svg"]');
  await expect(repaired).toHaveCount(2);
  for (const image of await repaired.all()) {
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(20);
    await expect(image).toHaveCSS('visibility', 'visible');
  }
});

test('configured navigation remains accessible on mobile and keeps link behavior', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/?configeditor=on');
  await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Keep expanded', exact: true }).click();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const config = structuredClone(editorTemplate);
  config.site.name = 'A longer status page name';
  config.site.nav = [
    { label: { en: 'Home', 'zh-CN': '首页' }, href: 'https://example.com/', newTab: true },
    { label: 'Docs', href: '/docs', newTab: false },
  ];
  await page.getByRole('textbox', { name: 'JSON', exact: true }).fill(JSON.stringify(config));
  await page.getByRole('button', { name: 'Dock to edge', exact: true }).click();
  await page.getByRole('button', { name: 'Navigation', exact: true }).click();
  const home = page.getByRole('menuitem', { name: 'Home', exact: true });
  await expect(home).toHaveAttribute('href', 'https://example.com/');
  await expect(home).toHaveAttribute('target', '_blank');
  await expect(home).not.toHaveAttribute('rel', /noreferrer/);
  await expect(page.getByRole('menuitem', { name: 'Docs', exact: true })).not.toHaveAttribute(
    'target',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const menu = await page.getByRole('menu', { name: 'Navigation', exact: true }).boundingBox();
  expect(menu!.x).toBeGreaterThanOrEqual(0);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(320);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Navigation', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(
    page.locator('.nav-links').getByRole('link', { name: 'Home', exact: true }),
  ).toBeVisible();
});
