import { test, expect } from '@playwright/test';
import { detailFixture, groupFixture } from '../../src/demo/fixtures.ts';

test.use({ baseURL: 'http://127.0.0.1:4173' });

for (const width of [1280, 390]) {
  test(`initial home loading keeps filters and service card structure visible at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/v1/groups/core', async (route) => {
      await pending;
      await route.fulfill({ json: groupFixture('core') });
    });
    await page.goto('/');
    await expect(page.getByRole('tablist', { name: 'Subgroups' })).toBeVisible();
    await expect(page.getByRole('searchbox')).toBeVisible();
    await expect(page.locator('.monitors')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.monitor .monitor-identity').first()).toBeVisible();
    await expect(page.locator('.monitor .skeleton-name').first()).toBeVisible();
    await expect(page.locator('.monitor .history').first()).toBeVisible();
    const logo = page.locator('.monitor .service-logo').first();
    const before = (await logo.boundingBox())!;
    await page.screenshot({ path: info.outputPath('home-loading.png'), fullPage: true });
    release();
    await expect(page.locator('.monitor')).toHaveCount(10);
    await expect(page.locator('.monitors')).toHaveAttribute('aria-busy', 'false');
    const after = (await logo.boundingBox())!;
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const width of [1280, 390]) {
  test(`detail loading preserves the full layout at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: width === 390 ? 'dark' : 'light' });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/v1/groups/core/monitors/m1?range=24h', async (route) => {
      await pending;
      await route.fulfill({ json: detailFixture('core', 'm1', '24h') });
    });
    await page.goto('/services/core/m1');
    await expect(page.locator('.detail-heading')).toBeVisible();
    await expect(page.locator('.detail-metrics > div')).toHaveCount(4);
    await expect(page.locator('.detail-content .panel')).toHaveCount(4);
    const chart = page.locator('.chart-panel');
    await expect(chart).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.checks-panel')).toHaveAttribute('aria-busy', 'true');
    expect(
      await page
        .locator('.loading-spinner')
        .first()
        .evaluate((el) =>
          el.getAnimations().some((animation) => animation.playState === 'running'),
        ),
    ).toBe(true);
    const before = (await chart.boundingBox())!;
    await page.screenshot({ path: info.outputPath('detail-loading.png'), fullPage: true });
    release();
    await expect(page.locator('.chart-line')).toHaveCount(2);
    await expect(chart).toHaveAttribute('aria-busy', 'false');
    await page.locator('.detail-metrics').evaluate(async (node) => {
      await new Promise(requestAnimationFrame);
      await Promise.allSettled(
        node
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      );
    });
    const after = (await chart.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThan(12);
    expect(Math.abs(after.width - before.width)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('range requests mark chart, checks and period values busy together', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/v1/groups/core/monitors/m1?range=*', async (route) => {
    const range = new URL(route.request().url()).searchParams.get('range') === '7d' ? '7d' : '24h';
    if (range === '7d') await pending;
    await route.fulfill({ json: detailFixture('core', 'm1', range) });
  });
  await page.goto('/services/core/m1');
  await expect(page.locator('.chart-line')).toHaveCount(2);
  await page.getByRole('button', { name: '7d', exact: true }).click();
  await expect(page.locator('.chart-panel')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.checks-panel')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.checks-panel .bars')).toHaveCount(0);
  await expect(page.locator('.checks-panel h2')).toContainText('7d');
  await expect(page.locator('.detail-metrics > div').first()).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading', { name: 'Website', exact: true })).toBeVisible();
  release();
  await expect(page.locator('.checks-panel .bars')).toBeVisible();
  await expect(page.locator('.checks-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.chart-panel')).toHaveAttribute('aria-busy', 'false');
});

test('empty response hides its timestamp and unsupported certificate uses the main value', async ({
  page,
}) => {
  await page.route('**/api/v1/groups/core/monitors/m1?range=*', (route) => {
    const detail = detailFixture('core', 'm1', '24h')!;
    detail.monitor.responseMs = null;
    detail.capabilities.certificate = 'unsupported';
    detail.certificateExpiresAt = null;
    return route.fulfill({ json: detail });
  });
  await page.goto('/services/core/m1');
  const latest = page.locator('.detail-metrics > div').nth(1);
  await expect(latest.locator('strong')).toHaveText('—');
  await expect(latest.locator('time')).toHaveCount(0);
  const certificate = page.locator('.detail-metrics > div').nth(3);
  await expect(certificate.locator('strong')).toHaveText('Not supported');
  await expect(certificate).toHaveText('Certificate remainingNot supported');
});

test('failed range loading stops both animations without showing old checks as the new range', async ({
  page,
}) => {
  await page.route('**/api/v1/groups/core/monitors/m1?range=*', (route) =>
    route.request().url().endsWith('24h')
      ? route.fulfill({ json: detailFixture('core', 'm1', '24h') })
      : route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  await page.goto('/services/core/m1');
  await expect(page.locator('.checks-panel .bars')).toBeVisible();
  await page.getByRole('button', { name: '7d', exact: true }).click();
  await expect(page.locator('.chart-panel')).toContainText('Unable to load');
  await expect(page.locator('.checks-panel')).toContainText('Unable to load');
  await expect(page.locator('.chart-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.checks-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.checks-panel .bars')).toHaveCount(0);
  await page.getByRole('button', { name: '24h', exact: true }).click();
  await expect(page.locator('.checks-panel .bars')).toBeVisible();
});

test('refresh keeps visible data busy and a zero-millisecond response retains its timestamp', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  let requests = 0;
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', async (route) => {
    const detail = detailFixture('core', 'm1', '24h')!;
    detail.monitor.responseMs = 0;
    if (requests++ > 0) await pending;
    await route.fulfill({ json: detail });
  });
  await page.goto('/services/core/m1');
  const latest = page.locator('.detail-metrics > div').nth(1);
  await expect(latest.locator('strong')).toHaveText('0 ms');
  await expect(latest.locator('time')).toBeVisible();
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  for (const selector of [
    '.chart-panel',
    '.checks-panel',
    '.events-panel',
    '.detail-metrics > div',
  ]) {
    await expect(page.locator(selector).first()).toHaveAttribute('aria-busy', 'true');
  }
  await expect(page.locator('.chart-line')).toHaveCount(2);
  await expect(page.locator('.checks-panel .bars')).toBeVisible();
  await expect(latest.locator('strong')).toHaveText('0 ms');
  release();
  await expect(page.locator('.chart-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.checks-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(latest.locator('time')).toBeVisible();
});
