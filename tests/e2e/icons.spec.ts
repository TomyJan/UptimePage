import { expect, test } from '@playwright/test';
import { groupFixture, detailFixture } from '../../src/demo/fixtures.ts';

test.use({ baseURL: 'http://127.0.0.1:4173' });
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="red"/></svg>';

test('keeps initials and dimensions until a lazy icon loads, then fades in on home and details', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/icons/**', async (route) => {
    await pending;
    await route.fulfill({ contentType: 'image/svg+xml', body: svg });
  });
  await page.route('**/api/v1/groups/core', (route) => {
    const data = groupFixture('core', 1);
    data.monitors[0].logo = '/api/v1/icons/core/opaque';
    return route.fulfill({ json: data });
  });
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', (route) => {
    const data = detailFixture('core', 'm1', '24h')!;
    data.monitor.logo = '/api/v1/icons/core/opaque';
    return route.fulfill({ json: data });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const logo = page.locator('.monitor .service-logo');
  await expect(logo.locator('.logo-initials')).toHaveCSS('opacity', '1');
  await expect(logo.locator('img')).toHaveCSS('opacity', '0');
  const before = await logo.boundingBox();
  release();
  await expect(logo.locator('img')).toHaveCSS('opacity', '1');
  await expect(logo.locator('.logo-initials')).toHaveCSS('opacity', '0');
  const after = await logo.boundingBox();
  expect(after?.height).toBe(before?.height);
  expect(after?.width).toBe(before?.width);
  await page.locator('.monitor').click();
  await expect(page.locator('.detail-title .service-logo img')).toHaveCSS('opacity', '1');
});

test('failed automatic icons retain visible text without changing the card layout', async ({
  page,
}) => {
  await page.route('**/api/v1/icons/**', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/api/v1/groups/core', (route) => {
    const data = groupFixture('core', 1);
    data.monitors[0].logo = '/api/v1/icons/core/opaque';
    return route.fulfill({ json: data });
  });
  await page.goto('/');
  const logo = page.locator('.monitor .service-logo');
  await expect
    .poll(() =>
      logo
        .locator('img')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 0),
    )
    .toBe(true);
  await expect(logo.locator('img')).toHaveCSS('opacity', '0');
  await expect(logo.locator('.logo-initials')).toHaveCSS('opacity', '1');
  await expect(logo.locator('.logo-initials')).not.toBeEmpty();
});

test('automatic icons keep narrow layout and respect reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/icons/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: svg }),
  );
  await page.route('**/api/v1/groups/core', (route) => {
    const data = groupFixture('core', 1);
    data.monitors[0].logo = '/api/v1/icons/core/opaque';
    return route.fulfill({ json: data });
  });
  await page.goto('/');
  const logo = page.locator('.monitor .service-logo');
  await expect(logo.locator('img')).toHaveCSS('opacity', '1');
  await expect(logo.locator('img')).toHaveCSS('transition-duration', '0s');
  expect((await logo.boundingBox())?.width).toBe(31);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
