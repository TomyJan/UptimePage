import { test, expect } from '@playwright/test';
import { groupFixture } from '../../src/demo/fixtures.ts';
test.use({ baseURL: 'http://127.0.0.1:4173' });
test('a failed subgroup preserves confirmed states from successful subgroups', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  const snapshot = groupFixture('core', 2);
  snapshot.freshness = 'stale';
  snapshot.subgroupErrors = [{ subgroupId: 'infra', code: 'unavailable' }];
  snapshot.subgroups = snapshot.subgroups.map((subgroup) =>
    subgroup.id === 'infra' ? { ...subgroup, monitorIds: [], freshness: 'unavailable' } : subgroup,
  );
  await page.route('**/api/v1/groups/core', (route) => route.fulfill({ json: snapshot }));
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(2);
  await expect(page.locator('.monitor .state.operational')).toHaveCount(1);
  await expect(page.locator('.monitor .state.down')).toHaveCount(1);
  await expect(page.locator('.overview-counts .failure strong')).toHaveText('1');
  await expect(page.getByText('Some groups are unavailable')).toBeVisible();
});
test('a stale or partial successful snapshot retains the source retry deadline', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-21T12:00:00Z') });
  let requests = 0;
  await page.route('**/api/v1/groups/core', async (route) => {
    requests++;
    const snapshot = groupFixture('core');
    snapshot.freshness = 'stale';
    snapshot.subgroupErrors = [
      { subgroupId: 'api', code: 'rate-limited', retryAt: '2026-10-21T12:03:00Z' },
    ];
    await route.fulfill({ json: snapshot });
  });
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(10);
  await page.clock.fastForward(179000);
  expect(requests).toBe(1);
  await page.clock.fastForward(1000);
  await expect.poll(() => requests).toBe(2);
});
test('manual refresh of stale data does not erase the source retry deadline', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T12:00:00Z') });
  let requests = 0;
  await page.route('**/api/v1/groups/core', async (route) => {
    requests++;
    const snapshot = groupFixture('core');
    snapshot.freshness = 'stale';
    snapshot.subgroupErrors = [
      { subgroupId: 'api', code: 'rate-limited', retryAt: '2026-10-21T12:03:00Z' },
    ];
    await route.fulfill({ json: snapshot });
  });
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(10);
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('.refresh-main')).not.toBeDisabled();
  expect(requests).toBe(2);
  await page.clock.fastForward(179000);
  expect(requests).toBe(2);
  await page.clock.fastForward(1000);
  await expect.poll(() => requests).toBe(3);
});

test('initial rate limiting defers polling and automatic recovery does not toast', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-21T12:00:00Z') });
  let requests = 0;
  await page.route('**/api/v1/groups/core', async (route) => {
    requests++;
    await route.fulfill(
      requests === 1
        ? {
            status: 429,
            json: { error: { code: 'rate-limited', retryAt: '2026-10-21T12:03:00Z' } },
          }
        : { json: groupFixture('core') },
    );
  });
  await page.goto('/');
  await expect(page.getByText('Unable to load')).toBeVisible();
  await page.clock.fastForward(179000);
  expect(requests).toBe(1);
  await page.clock.fastForward(1000);
  await expect(page.locator('.monitor')).toHaveCount(10);
  expect(requests).toBe(2);
  await expect(page.locator('.toast-message')).toHaveCount(0);
});
test('a failed refresh keeps its timestamp and marks old data stale', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  let requests = 0;
  await page.route('**/api/v1/groups/core', async (route) => {
    requests++;
    await route.fulfill(
      requests === 1
        ? { json: groupFixture('core') }
        : { status: 503, json: { error: { code: 'unavailable', retryAt: null } } },
    );
  });
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(10);
  const timestamp = await page.locator('.refresh-main time').textContent();
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('.toast-message')).toHaveText('Refresh failed');
  await expect(page.locator('.refresh-main time')).toHaveText(timestamp!);
  await expect(page.getByText('Data is outdated. Current status is unconfirmed.')).toBeVisible();
  await expect(page.locator('.monitor .state.operational')).toHaveCount(0);
});
test('a production SPA fallback cannot turn into demo data', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Unable to load')).toBeVisible();
  await expect(page.locator('.monitor')).toHaveCount(0);
});
