import { test, expect } from '@playwright/test';
import { groupFixture, detailFixture } from '../../src/demo/fixtures.ts';
import { encodeGroupSnapshot } from '../../src/server/home.ts';
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

test('newer partial snapshots update cards and recovered members while reporting partial failure', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/api/v1/groups/core', (route) => {
    const updated = ++requests > 1;
    const data = groupFixture('core', updated ? 2 : 1);
    data.freshness = 'stale';
    data.fetchedAt = updated ? '2026-10-21T12:01:00Z' : '2026-10-21T12:00:00Z';
    data.monitors[0].state = updated ? 'down' : 'operational';
    data.subgroupErrors = [
      {
        subgroupId: 'infra',
        code: 'unavailable',
        diagnostic: { reason: 'timeout', stage: 'source' },
      },
    ];
    return route.fulfill({ json: encodeGroupSnapshot(data) });
  });
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(1);
  await expect(page.locator('.monitor .state.operational')).toHaveCount(1);
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('.monitor')).toHaveCount(2);
  await expect(page.locator('.monitor .state.down')).toHaveCount(2);
  await expect(page.locator('.toast-message')).toContainText('timed out');
  await expect(page.locator('.toast-message').filter({ hasText: /^Refreshed$/ })).toHaveCount(0);
});

test('dense checks use separated cells and a concise anchored tooltip', async ({ page }) => {
  const data = groupFixture('core', 1);
  const until = Date.parse(data.fetchedAt);
  data.monitors[0].history = Array.from({ length: 100 }, (_, i) => ({
    from: new Date(until - (100 - i) * 60000).toISOString(),
    until: new Date(until - (100 - i) * 60000 + 1000).toISOString(),
    state: i === 50 ? 'down' : 'operational',
    responseMs: i === 50 ? null : 42,
  }));
  await page.route('**/api/v1/groups/core', (route) => route.fulfill({ json: data }));
  await page.goto('/');
  const bars = page.locator('.bars .bar');
  await expect(bars).toHaveCount(48);
  await expect(page.locator('.history-point')).toHaveCount(0);
  await expect(page.locator('.bar.down')).toHaveCount(1);
  const observed = page.locator('.bar.operational');
  await expect(observed).toHaveCount(3);
  const a = (await observed.nth(0).boundingBox())!,
    b = (await observed.nth(1).boundingBox())!;
  expect(b.x - (a.x + a.width)).toBeGreaterThanOrEqual(2);
  await observed.first().hover();
  await expect(page.getByRole('tooltip')).toContainText('42 ms');
  await expect(page.getByRole('tooltip')).not.toContainText('Observed samples');
});

test('the production home page loads all card data in one request and reports a failed refresh', async ({
  page,
}) => {
  const group = groupFixture('core', 8);
  group.monitors.forEach((m) => {
    m.responseMs = 321;
  });
  let fail = false,
    groupRequests = 0,
    detailRequests = 0;
  await page.route('**/api/v1/groups/core', (route) => {
    groupRequests++;
    return fail
      ? route.fulfill({
          status: 502,
          json: {
            error: { code: 'unavailable', diagnostic: { reason: 'network', stage: 'source' } },
          },
        })
      : route.fulfill({ json: encodeGroupSnapshot(group) });
  });
  await page.route('**/api/v1/groups/core/monitors/**', (route) => {
    detailRequests++;
    return route.fulfill({ status: 500, json: {} });
  });
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(8);
  for (const latency of await page.locator('.latency strong').all())
    await expect(latency).toHaveText('321 ms');
  expect(groupRequests).toBe(1);
  expect(detailRequests).toBe(0);
  const time = await page.locator('.refresh-main time').getAttribute('datetime');
  fail = true;
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('.toast-message')).toContainText('Unable to reach the service');
  await expect(page.locator('.monitor')).toHaveCount(8);
  await expect(page.locator('.latency strong').first()).toHaveText('321 ms');
  await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', time!);
  expect(groupRequests).toBe(2);
  expect(detailRequests).toBe(0);
});
