import { test, expect } from '@playwright/test';
import { groupFixture, detailFixture } from '../../src/demo/fixtures.ts';
test.use({ baseURL: 'http://127.0.0.1:4173' });
for (const detail of [false, true]) {
  test(`retry reports safe errors and success on the ${detail ? 'detail' : 'home'} page`, async ({
    page,
  }) => {
    let requests = 0;
    const path = detail ? '/services/core/m1' : '/';
    const api = detail ? '**/api/v1/groups/core/monitors/m1?range=24h' : '**/api/v1/groups/core';
    await page.route(api, (route) => {
      requests++;
      if (requests <= 2)
        return route.fulfill({
          status: 545,
          contentType: 'text/plain',
          body: 'Error return from script private-secret',
        });
      return route.fulfill({
        json: detail ? detailFixture('core', 'm1', '24h') : groupFixture('core'),
      });
    });
    await page.goto(path);
    await expect(page.getByText('Unable to load', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('.toast-message')).toContainText('HTTP 545');
    await expect(page.locator('.toast-message')).not.toContainText('private-secret');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('.toast-message').filter({ hasText: /^Refreshed$/ })).toHaveCount(1);
    if (detail) await expect(page.locator('h1')).toHaveText('Website');
    else await expect(page.locator('.monitor')).toHaveCount(10);
  });
}

test('partial refresh retains the complete previous snapshot and its successful timestamp', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  let requests = 0;
  await page.route('**/api/v1/groups/core', (route) => {
    const data = groupFixture('core');
    if (++requests > 1) {
      data.fetchedAt = '2026-10-21T12:01:00Z';
      data.freshness = 'stale';
      data.monitors = data.monitors.slice(0, 1);
      data.subgroupErrors = [
        {
          subgroupId: 'infra',
          code: 'unavailable',
          diagnostic: { reason: 'timeout', stage: 'source' },
        },
      ];
    }
    return route.fulfill({ json: data });
  });
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(10);
  const time = await page.locator('.refresh-main time').getAttribute('datetime');
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('.toast-message')).toContainText('timed out');
  await expect(page.locator('.monitor')).toHaveCount(10);
  await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', time!);
  await expect(page.locator('.detail-alert, .state.stale')).toHaveCount(0);
});

test('short real checks have visible markers at their actual time positions', async ({ page }) => {
  const data = groupFixture('core', 1);
  const until = Date.parse(data.fetchedAt);
  data.monitors[0].history = [72000, 36000].map((ago) => ({
    from: new Date(until - ago * 1000).toISOString(),
    until: new Date(until - ago * 1000 + 1000).toISOString(),
    state: 'operational',
    responseMs: 42,
  }));
  await page.route('**/api/v1/groups/core', (route) => route.fulfill({ json: data }));
  await page.goto('/');
  const markers = page.locator('.history-point');
  await expect(markers).toHaveCount(2);
  const row = await page.locator('.bars').boundingBox();
  for (const [index, fraction] of [
    [0, 1 / 6],
    [1, 7 / 12],
  ]) {
    const box = await markers.nth(index).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(3);
    expect(Math.abs((box!.x - row!.x) / row!.width - fraction)).toBeLessThan(0.01);
    await markers.nth(index).hover();
    await expect(page.getByRole('tooltip')).toContainText('42 ms');
    await expect(page.getByRole('tooltip')).toContainText('Observed samples');
  }
});
