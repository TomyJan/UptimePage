import { test, expect, type Page } from '@playwright/test';
import config from '../../.generated/public-config.ts';
import { groupResponseSchema } from '../../src/shared/home.ts';

async function fitsViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'uptimepage.preferences',
      JSON.stringify({ language: 'en', theme: 'light', timeZone: 'UTC', refresh: 0 }),
    );
  });
});

for (const group of config.groups) {
  test(`${group.id}: live refresh, mobile layout and isolated error feedback`, async ({
    page,
  }, info) => {
    const path = `/api/v1/groups/${encodeURIComponent(group.id)}`;
    const isGroup = (url: string) => new URL(url).pathname === path;
    let initialRequests = 0;
    page.on('request', (request) => {
      // Icons load independently; status and history must still use one group request.
      if (new URL(request.url()).pathname.startsWith('/api/v1/groups/')) initialRequests++;
    });
    const initialResponse = page.waitForResponse((response) => isGroup(response.url()));
    await page.goto(`/?g=${encodeURIComponent(group.id)}&s=all`);
    const initial = await initialResponse;
    expect(initial.status()).toBe(200);
    const snapshot = groupResponseSchema.parse(await initial.json());
    expect(snapshot.configVersion).toBe(config.configVersion);
    expect(snapshot.freshness).toBe('fresh');
    expect(snapshot.subgroupErrors).toEqual([]);
    await expect(page.locator('.monitor')).toHaveCount(snapshot.monitors.length);
    expect(initialRequests).toBe(1);
    await fitsViewport(page);
    await page.screenshot({ path: info.outputPath('mobile-home-light.png') });

    const nextResponse = page.waitForResponse((response) => isGroup(response.url()));
    await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
    const next = await nextResponse;
    expect(next.status()).toBe(200);
    const updated = groupResponseSchema.parse(await next.json());
    expect(updated.freshness).toBe('fresh');
    await expect(page.locator('.toast-position:not(.is-exiting) .toast-message')).toHaveText(
      'Refreshed',
    );
    await page.locator('.toast-position:not(.is-exiting) .toast-close').click();

    const timestamp = await page.locator('.refresh-main time').getAttribute('datetime');
    const count = await page.locator('.monitor').count();
    // Only this browser sees the faults; the deployed functions and KV stay untouched.
    let fault: 'script' | 'partial' | 'limited' = 'script';
    await page.route(
      (url) => url.pathname === path,
      async (route) => {
        if (fault === 'script')
          return route.fulfill({
            status: 545,
            contentType: 'text/plain',
            body: 'Error return from script private-validation-secret',
          });
        if (fault === 'limited')
          return route.fulfill({
            status: 429,
            headers: { 'retry-after': '60' },
            json: {
              error: { code: 'rate-limited', retryAt: new Date(Date.now() + 60_000).toISOString() },
            },
          });
        return route.fulfill({
          json: {
            ...snapshot,
            fetchedAt: new Date(Date.parse(snapshot.fetchedAt) + 60_000).toISOString(),
            freshness: 'stale',
            subgroupErrors: [
              {
                subgroupId: group.subgroups[0].id,
                code: 'unavailable',
                diagnostic: { reason: 'timeout', stage: 'source' },
              },
            ],
          },
        });
      },
    );

    for (const [kind, message] of [
      ['script', 'HTTP 545'],
      ['partial', 'timed out'],
      ['limited', 'Too many requests'],
    ] as const) {
      fault = kind;
      await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
      const toast = page.locator('.toast-position:not(.is-exiting) .toast-message');
      await expect(toast).toContainText(message);
      await expect(toast).not.toContainText('private-validation-secret');
      await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', timestamp!);
      await expect(page.locator('.monitor')).toHaveCount(count);
      await fitsViewport(page);
      await page.screenshot({ path: info.outputPath(`mobile-${kind}.png`) });
      await page.locator('.toast-position:not(.is-exiting) .toast-close').click();
    }
    await page.unrouteAll({ behavior: 'wait' });

    if (!count) {
      info.annotations.push({
        type: 'note',
        description: 'Empty public group: detail checks omitted',
      });
      return;
    }
    let detailAttempts = 0;
    await page.route(
      (url) => url.pathname.startsWith(`${path}/monitors/`),
      async (route) => {
        if (++detailAttempts <= 2)
          return route.fulfill({
            status: 545,
            contentType: 'text/plain',
            body: 'Error return from script private-validation-secret',
          });
        return route.continue();
      },
    );
    await page.locator('.card-link').first().click();
    await expect(page.getByText('Unable to load', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    const retryToast = page.locator('.toast-position:not(.is-exiting) .toast-message');
    await expect(retryToast).toContainText('HTTP 545');
    await expect(retryToast).not.toContainText('private-validation-secret');
    await page.locator('.toast-position:not(.is-exiting) .toast-close').click();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('.facts')).toBeVisible();
    await expect(retryToast).toHaveText('Refreshed');
    await page.locator('.toast-position:not(.is-exiting) .toast-close').click();
    expect(detailAttempts).toBe(3);
    await fitsViewport(page);
    await page.getByRole('button', { name: 'Appearance', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: info.outputPath('mobile-detail-dark.png'), fullPage: true });
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await page.getByRole('menuitemradio', { name: '简体中文', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await page.getByRole('button', { name: '时区', exact: true }).click();
    const menu = page.getByRole('menu', { name: '时区', exact: true });
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await fitsViewport(page);
    await page.screenshot({ path: info.outputPath('mobile-detail-zh.png'), fullPage: true });
  });
}
