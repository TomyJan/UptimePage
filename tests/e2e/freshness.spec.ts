import { test, expect } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';
import { detailFixture, groupFixture } from '../../src/demo/fixtures.ts';

test.use({ baseURL: 'http://127.0.0.1:4173' });
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T12:00:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('uptimepage.preferences', JSON.stringify({ refresh: 0 }));
  });
});

for (const initialDelay of [0, 1500]) {
  test(`manual-only snapshots retain observed state and timestamp until refreshed (${initialDelay}ms initial response)`, async ({
    page,
  }) => {
    let calls = 0;
    await page.route('**/api/v1/groups/core', async (route) => {
      const snapshot = groupFixture('core', 1);
      if (++calls > 1) snapshot.fetchedAt = '2026-10-21T12:05:00Z';
      else await delay(initialDelay);
      return route.fulfill({ json: snapshot });
    });
    await page.goto('/');
    await expect(page.locator('.monitor .state.operational')).toHaveCount(1);
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
    const timestamp = await page.locator('.refresh-main time').textContent();
    await page.clock.fastForward(298999);
    await expect(page.locator('.monitor .state.operational')).toHaveCount(1);
    await page.clock.fastForward(1);
    await expect(page.locator('.monitor .state.operational')).toHaveCount(1);
    await expect(page.getByText('Data is outdated. Current status is unconfirmed.')).toHaveCount(0);
    await expect(page.locator('.refresh-main time')).toHaveText(timestamp!);
    expect(calls).toBe(1);
    await page.clock.resume();
    await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
    await expect(page.locator('.monitor .state.operational')).toHaveCount(1);
    expect(calls).toBe(2);
  });
}

test('cached groups and old details retain their last observation without repeated warnings', async ({
  page,
}) => {
  await page.route('**/api/v1/groups/core', (route) =>
    route.fulfill({ json: groupFixture('core', 1) }),
  );
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', (route) =>
    route.fulfill({ json: detailFixture('core', 'm1', '24h') }),
  );
  await page.goto('/');
  await expect(page.locator('.monitor .state.operational')).toHaveCount(1);
  await page.getByRole('link', { name: 'Website', exact: true }).click();
  await expect(page.locator('.detail-heading .state.operational')).toBeVisible();
  await page.clock.fastForward(300000);
  await expect(page.locator('.detail-heading .state.operational')).toHaveCount(1);
  await expect(page.locator('.detail-metrics')).not.toContainText('Last known value');
  await page.getByRole('link', { name: /Back/ }).click();
  await expect(page.locator('.monitor .state.operational')).toHaveCount(1);
  await page.reload();
  await page.goto('/services/core/m1');
  await expect(page.getByText('Data is outdated. Current status is unconfirmed.')).toHaveCount(0);
});

test('resuming a suspended page retains its last observed state', async ({ page }) => {
  await page.route('**/api/v1/groups/core', (route) =>
    route.fulfill({ json: groupFixture('core', 1) }),
  );
  await page.goto('/');
  await expect(page.locator('.monitor .state.operational')).toHaveCount(1);
  await page.clock.setSystemTime(new Date('2026-10-21T12:06:00Z'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.monitor .state.operational')).toHaveCount(1);
});
