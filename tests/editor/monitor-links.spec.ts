import { test, expect } from '@playwright/test';
import { editorTemplate } from '../../src/features/editor/template.ts';

test('link rules preview, navigate and export consistently without production requests', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/**', (route) => {
    calls++;
    return route.abort();
  });
  const config = structuredClone(editorTemplate);
  config.site.showLinks = true;
  config.site.pinAbnormal = false;
  config.groups = [
    {
      ...config.groups[1],
      id: 'links',
      name: 'Link demo',
      showLinks: false,
      subgroups: [
        { id: 'web', name: 'Websites', logo: null, monitorIds: ['1', '2'], showLinks: false },
        { id: 'api', name: 'APIs', logo: null, monitorIds: ['1'], showLinks: true },
      ],
      monitors: { '1': { name: 'Shared service' }, '2': { name: 'Hidden service' } },
    },
  ];
  await page.goto('/?configeditor=on');
  await page.locator('input[type=file]').setInputFiles({
    name: 'links.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(page.locator('.monitor-visit')).toHaveCount(1);
  await expect(page.locator('.monitor-visit')).toHaveAttribute('target', '_blank');
  await expect(page.locator('.monitor-visit')).toHaveAttribute('rel', 'noopener');
  await page.locator('.monitor-visit').focus();
  await expect(page.getByRole('tooltip')).toContainText('Open website');
  await page.route('https://example.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Target</title>' }),
  );
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('.monitor-visit').click(),
  ]);
  await popup.close();
  await expect(page).toHaveURL(/\?configeditor=on/);
  await page.getByRole('tab', { name: /^APIs/ }).click();
  await page.getByRole('link', { name: 'Shared service', exact: true }).click();
  await expect(page).toHaveURL(/\/services\/links\/1\?.*s=api/);
  await expect(page.locator('.detail-name .monitor-visit')).toBeVisible();
  await page.reload();
  await page.locator('input[type=file]').setInputFiles({
    name: 'links.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(page.locator('.detail-name .monitor-visit')).toBeVisible();
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await page.getByRole('tab', { name: /^Websites/ }).click();
  await expect(page.locator('.monitor-visit')).toHaveCount(0);
  await page.getByRole('link', { name: 'Shared service', exact: true }).click();
  await expect(page).toHaveURL(/\/services\/links\/1\?.*s=web/);
  await expect(page.locator('.monitor-visit')).toHaveCount(0);
  await page.reload();
  // Drafts are in memory. Re-import while keeping the deep link's subgroup context.
  await page.locator('input[type=file]').setInputFiles({
    name: 'links.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(page.locator('.detail-name h1')).toHaveText('Shared service');
  await expect(page.locator('.monitor-visit')).toHaveCount(0);
  await page.goto('/services/links/1?configeditor=on');
  await page.locator('input[type=file]').setInputFiles({
    name: 'links.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(page.locator('.detail-name .monitor-visit')).toHaveCount(1);
  await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Keep expanded', exact: true }).click();
  await page.getByRole('button', { name: 'Form', exact: true }).click();
  await page.getByRole('tab', { name: 'Groups & sources', exact: true }).click();
  const groupRule = page.locator('.ce-link-policy').first();
  await groupRule.getByRole('button', { name: 'Show', exact: true }).click();
  const webRule = page.locator('.ce-box .ce-link-policy').first();
  await webRule.getByRole('button', { name: 'Inherit', exact: true }).click();
  await expect(webRule).toContainText('Inherited: shown');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const exported = JSON.parse(
    await page.getByRole('textbox', { name: 'JSON', exact: true }).inputValue(),
  );
  expect(exported.groups[0].showLinks).toBe(true);
  expect(exported.groups[0].subgroups[0]).not.toHaveProperty('showLinks');
  expect(calls).toBe(0);
});

test('source changes retain explicit and inherited link settings', async ({ page }) => {
  await page.goto('/?configeditor=on');
  await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Keep expanded', exact: true }).click();
  await page.getByRole('button', { name: 'Show monitor links', exact: true }).click();
  await expect(page.locator('.monitor-visit')).toHaveCount(6);
  await page.getByRole('tab', { name: 'Groups & sources', exact: true }).click();
  await page
    .locator('.ce-box .ce-link-policy')
    .nth(0)
    .getByRole('button', { name: 'Show', exact: true })
    .click();
  await page
    .locator('.ce-box .ce-link-policy')
    .nth(1)
    .getByRole('button', { name: 'Hide', exact: true })
    .click();
  await page.getByRole('button', { name: 'UptimeRobot', exact: true }).click();
  await page.getByRole('button', { name: 'Peekaping', exact: true }).click();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const config = JSON.parse(
    await page.getByRole('textbox', { name: 'JSON', exact: true }).inputValue(),
  );
  expect(config.site.showLinks).toBe(true);
  expect(config.groups[0]).not.toHaveProperty('showLinks');
  expect(config.groups[0].subgroups.map((s: { showLinks?: boolean }) => s.showLinks)).toEqual([
    true,
    false,
  ]);
});

for (const width of [1440, 390, 320]) {
  test(`long names keep the link accessible on home and detail at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const config = structuredClone(editorTemplate);
    config.site.showLinks = true;
    config.site.pinAbnormal = false;
    const name = 'A monitored website with a deliberately long display name';
    config.groups[0].monitors['web-1'].name = name;
    await page.goto('/?configeditor=on');
    await page.locator('input[type=file]').setInputFiles({
      name: 'links.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(config)),
    });
    await expect(page.locator('.monitor-visit').first()).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      await page.locator('.monitor-visit').first().focus();
      await expect(page.getByRole('tooltip')).toBeVisible();
      const tip = await page.getByRole('tooltip').boundingBox();
      expect(tip!.x).toBeGreaterThanOrEqual(0);
      expect(tip!.x + tip!.width).toBeLessThanOrEqual(width);
      expect(await page.locator('html').evaluate((el) => el.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.locator('.detail-name .monitor-visit')).toBeVisible();
    await expect
      .poll(() => page.locator('html').evaluate((el) => el.scrollWidth <= innerWidth))
      .toBe(true);
    const link = await page.locator('.detail-name .monitor-visit').boundingBox();
    expect(link!.x + link!.width).toBeLessThanOrEqual(width);
  });
}

test('a removed subgroup falls back to All for links and detail navigation', async ({ page }) => {
  const config = structuredClone(editorTemplate);
  config.site.showLinks = true;
  await page.goto('/?configeditor=on&s=removed');
  await page.locator('input[type=file]').setInputFiles({
    name: 'links.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(page.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.monitor-visit')).toHaveCount(6);
  await page.locator('.monitor-name').first().click();
  await expect(page.locator('.detail-name .monitor-visit')).toBeVisible();
  await expect(page).not.toHaveURL(/s=removed/);
});
