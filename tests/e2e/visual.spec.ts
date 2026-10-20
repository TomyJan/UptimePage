import { test, expect } from '@playwright/test';
for (const width of [1440, 768, 390])
  for (const locale of ['en-US', 'zh-CN'])
    for (const theme of ['light', 'dark']) {
      test(`acceptance ${width} ${locale} ${theme}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
        await page.addInitScript(
          ({ locale, theme }) => {
            Object.defineProperty(navigator, 'languages', { value: [locale] });
            localStorage.setItem(
              'uptimepage.preferences',
              JSON.stringify({ language: 'auto', theme, timeZone: 'UTC', refresh: 0 }),
            );
          },
          { locale, theme },
        );
        await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
        await page.goto('/');
        await expect(page.locator('.monitor')).toHaveCount(10);
        await page.waitForTimeout(650);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBeTruthy();
        await expect(page.locator('html')).toHaveAttribute(
          'lang',
          locale === 'zh-CN' ? 'zh-CN' : 'en',
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('.bar.operational').first()).toHaveCSS(
          'background-color',
          'rgb(75, 157, 113)',
        );
        await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
        await page.locator('.card-link').first().click();
        await expect(page.locator('.chart-line')).toHaveCount(2);
        await page.waitForTimeout(1700);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBeTruthy();
        await page.screenshot({ path: info.outputPath('detail.png'), fullPage: true });
      });
    }
for (const viewport of [
  { width: 320, height: 740 },
  { width: 568, height: 320 },
])
  test(`menus and details fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/services/core/m1');
    await expect(page.locator('h1')).toHaveText('Website');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.getByRole('button', { name: 'Timezone', exact: true }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  });
