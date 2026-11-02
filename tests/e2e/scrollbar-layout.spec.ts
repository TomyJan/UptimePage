import { expect, test } from '@playwright/test';

// Exercise classic scrollbars; headless Chromium normally hides them entirely.
test.use({
  viewport: { width: 1280, height: 640 },
  reducedMotion: 'reduce',
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: ['--disable-features=OverlayScrollbar,FluentOverlayScrollbar'],
  },
});

test('page content and fixed navigation keep their horizontal position when the scrollbar disappears', async ({
  page,
}) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  const selectors = ['#main', '.nav-inner', '.site-footer'];
  const before = await Promise.all(
    selectors.map((selector) => page.locator(selector).boundingBox()),
  );
  await page.setViewportSize({ width: 1280, height: 2400 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight > innerHeight))
    .toBe(false);
  for (const [index, selector] of selectors.entries()) {
    const after = (await page.locator(selector).boundingBox())!;
    expect(Math.abs(after.x - before[index]!.x)).toBeLessThan(0.5);
    expect(Math.abs(after.width - before[index]!.width)).toBeLessThan(0.5);
  }
});

test('menus and tooltips leave the page scrollbar and layout intact', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(10);
  const measure = () =>
    page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      main: document.querySelector('#main')!.getBoundingClientRect().x,
      navigation: document.querySelector('.nav-inner')!.getBoundingClientRect().x,
      scrollable: document.documentElement.scrollHeight > innerHeight,
      scrollLock: document.body.hasAttribute('data-scroll-locked'),
    }));
  const before = await measure();
  for (const label of ['Language', 'Timezone', 'Appearance', 'Refresh interval']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    expect(await measure()).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    expect(await measure()).toEqual(before);
  }
  await page.locator('.bars').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect(await measure()).toEqual(before);
});
