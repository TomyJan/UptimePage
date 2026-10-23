import { test, expect, type Page } from '@playwright/test';
import { groupFixture, detailFixture } from '../../src/demo/fixtures.ts';

test.use({ baseURL: 'http://127.0.0.1:4173' });

async function mockApi(page: Page) {
  await page.route('**/api/v1/groups/core', (route) =>
    route.fulfill({ json: groupFixture('core') }),
  );
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', (route) =>
    route.fulfill({ json: detailFixture('core', 'm1', '24h') }),
  );
}

test('a missing production detail chunk recovers once after a confirmed deployment and preserves the URL', async ({
  page,
}) => {
  await mockApi(page);
  let missing = true,
    documents = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
  });
  await page.route('**/assets/MonitorPage-*.js', (route) => {
    if (missing) {
      missing = false;
      return route.abort();
    }
    return route.continue();
  });
  await page.route('http://127.0.0.1:4173/', async (route) => {
    if (route.request().isNavigationRequest()) return route.continue();
    expect(route.request().headers().accept).toBe('text/html');
    const response = await route.fetch();
    const html = (await response.text()).replace(
      /src="\/assets\/index-[^"]+\.js"/,
      'src="/assets/new-version.js"',
    );
    await route.fulfill({ response, body: html });
  });
  await page.goto('/?s=web');
  await expect(page.locator('.monitor')).toHaveCount(4);
  await page.getByRole('link', { name: 'Website', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Website', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/services\/core\/m1\?s=web$/);
  expect(documents).toBe(2);
  expect(missing).toBe(false);
  await expect(page.locator('.resource-notice')).toHaveCount(0);
});

test('an import failure without an update leaves a usable themed shell and a reload action', async ({
  page,
}, info) => {
  await mockApi(page);
  let missing = true,
    documents = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
  });
  await page.route('**/assets/MonitorPage-*.js', (route) =>
    missing ? route.abort() : route.continue(),
  );
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(10);
  await page.getByRole('link', { name: 'Website', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Page resources could not be loaded');
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
  await expect(page.locator('.site-nav')).toBeVisible();
  await expect(page.locator('.site-footer')).toBeVisible();
  await expect(page.locator('.detail-content')).toHaveCount(0);
  expect(documents).toBe(1);
  await page.screenshot({ path: info.outputPath('recovery-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: info.outputPath('recovery-dark-mobile.png'),
    animations: 'disabled',
  });
  missing = false;
  await page.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Website', exact: true })).toBeVisible();
  expect(documents).toBe(2);
});

test('blocked session storage prevents automatic reload loops', async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() =>
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new Error('Storage blocked');
      },
    }),
  );
  await page.route('**/assets/MonitorPage-*.js', (route) => route.abort());
  await page.route('http://127.0.0.1:4173/', async (route) => {
    if (route.request().isNavigationRequest()) return route.continue();
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        /src="\/assets\/index-[^"]+\.js"/,
        'src="/assets/new-version.js"',
      ),
    });
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Website', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
});
