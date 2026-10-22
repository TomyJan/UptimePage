import { test, expect, type Page } from '@playwright/test';
import { groupFixture } from '../../src/demo/fixtures.ts';
test.use({ baseURL: 'http://127.0.0.1:4173' });

const retryAt = '2026-10-21T12:03:00Z';
async function advanceToBeforeRetry(page: Page) {
  // Navigation and manual refresh consume real time before the clock is paused.
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  const remaining = Date.parse(retryAt) - (await page.evaluate(() => Date.now()));
  await page.clock.fastForward(remaining - 1000);
}
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
  await expect(page.getByText('Some groups are unavailable')).toHaveCount(0);
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
    snapshot.subgroupErrors = [{ subgroupId: 'api', code: 'rate-limited', retryAt }];
    await route.fulfill({ json: snapshot });
  });
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(10);
  await advanceToBeforeRetry(page);
  expect(requests).toBe(1);
  await page.clock.fastForward(1000);
  await expect.poll(() => requests).toBe(2);
  await page.clock.resume();
});
test('manual refresh of stale data does not erase the source retry deadline', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T12:00:00Z') });
  let requests = 0;
  await page.route('**/api/v1/groups/core', async (route) => {
    requests++;
    const snapshot = groupFixture('core');
    snapshot.freshness = 'stale';
    snapshot.subgroupErrors = [{ subgroupId: 'api', code: 'rate-limited', retryAt }];
    await route.fulfill({ json: snapshot });
  });
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(10);
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('.refresh-main')).not.toBeDisabled();
  expect(requests).toBe(2);
  await advanceToBeforeRetry(page);
  expect(requests).toBe(2);
  await page.clock.fastForward(1000);
  await expect.poll(() => requests).toBe(3);
  await page.clock.resume();
});

test('initial rate limiting defers polling and automatic recovery toasts', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T12:00:00Z') });
  let requests = 0;
  await page.route('**/api/v1/groups/core', async (route) => {
    requests++;
    await route.fulfill(
      requests === 1
        ? {
            status: 429,
            json: { error: { code: 'rate-limited', retryAt } },
          }
        : { json: groupFixture('core') },
    );
  });
  await page.goto('/');
  await expect(page.getByText('Unable to load')).toBeVisible();
  await advanceToBeforeRetry(page);
  expect(requests).toBe(1);
  await page.clock.fastForward(1000);
  await page.clock.resume();
  await expect(page.locator('.monitor')).toHaveCount(10);
  expect(requests).toBe(2);
  await expect(page.locator('.toast-message')).toHaveText('Refreshed');
});
test('a failed refresh keeps its timestamp and observed state with an error toast', async ({
  page,
}) => {
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
  await expect(page.locator('.toast-message')).toContainText('HTTP 503');
  await expect(page.locator('.refresh-main time')).toHaveText(timestamp!);
  await expect(page.getByText('Data is outdated. Current status is unconfirmed.')).toHaveCount(0);
  await expect(page.locator('.monitor .state.operational')).toHaveCount(7);
});
test('a production SPA fallback cannot turn into demo data', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Unable to load')).toBeVisible();
  await expect(page.locator('.monitor')).toHaveCount(0);
});
