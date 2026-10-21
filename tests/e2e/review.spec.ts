import { test, expect } from '@playwright/test';
import { groupFixture, detailFixture } from '../../src/demo/fixtures.ts';

test.use({ baseURL: 'http://127.0.0.1:4173', timezoneId: 'UTC' });

for (const mismatch of ['group', 'version', 'owner'] as const) {
  test(`rejects group response with wrong ${mismatch}`, async ({ page }) => {
    const data = groupFixture('core');
    if (mismatch === 'group') data.groupId = 'external';
    if (mismatch === 'version') data.configVersion = 'old-version';
    if (mismatch === 'owner') data.monitors[0].groupId = 'external';
    await page.route('**/api/v1/groups/core', (route) => route.fulfill({ json: data }));
    await page.goto('/');
    await expect(page.getByText('Unable to load')).toBeVisible();
    await expect(page.locator('.monitor')).toHaveCount(0);
  });
}

test('initial detail rate limit keeps its scheduler and recovers at retryAt', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T12:00:00Z') });
  let requests = 0;
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', (route) => {
    requests++;
    return route.fulfill(
      requests === 1
        ? {
            status: 429,
            json: { error: { code: 'rate-limited', retryAt: '2026-10-21T12:03:00Z' } },
          }
        : { json: detailFixture('core', 'm1', '24h') },
    );
  });
  await page.goto('/services/core/m1');
  await expect(page.getByText('Unable to load')).toBeVisible();
  await page.clock.fastForward(179000);
  expect(requests).toBe(1);
  await page.clock.fastForward(1000);
  await expect(page.locator('h1')).toHaveText('Website');
  expect(requests).toBe(2);
  await expect(page.locator('.toast-message')).toHaveText('Refreshed');
});

test('failed range keeps detail shell and allows returning to a successful range', async ({
  page,
}) => {
  await page.route('**/api/v1/groups/core/monitors/m1?range=*', (route) =>
    route.fulfill(
      route.request().url().endsWith('24h')
        ? { json: detailFixture('core', 'm1', '24h') }
        : { status: 503, json: { error: { code: 'unavailable' } } },
    ),
  );
  await page.goto('/services/core/m1');
  await expect(page.locator('.chart-line')).toHaveCount(2);
  await page.getByRole('button', { name: '7d', exact: true }).click();
  await expect(page.locator('.chart-panel')).toContainText('Unable to load');
  await expect(page.locator('h1')).toHaveText('Website');
  await expect(page.locator('.chart-line')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh now', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '24h', exact: true }).click();
  await expect(page.locator('.chart-line')).toHaveCount(2);
});

test('dense history uses visible separated time cells on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const data = groupFixture('core');
  const until = Date.parse(data.fetchedAt);
  data.monitors[0].history = Array.from({ length: 100 }, (_, i) => ({
    from: new Date(until - (100 - i) * 60000).toISOString(),
    until: new Date(until - (99 - i) * 60000).toISOString(),
    state: 'operational',
    responseMs: 100,
  }));
  await page.route('**/api/v1/groups/core', (route) => route.fulfill({ json: data }));
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(10);
  const bars = page.locator('.monitor').first().locator('.bar.operational');
  await expect(bars).toHaveCount(4);
  expect(
    await bars.evaluateAll((nodes) =>
      Math.min(...nodes.map((n) => n.getBoundingClientRect().width)),
    ),
  ).toBeGreaterThan(0.1);
  await expect(page.locator('.monitor').first().locator('.bar.none')).toHaveCount(44);
  const first = (await bars.nth(0).boundingBox())!,
    second = (await bars.nth(1).boundingBox())!;
  expect(second.x - (first.x + first.width)).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('long public detail descriptions wrap within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = detailFixture('core', 'm1', '24h')!;
  data.monitor.description = 'a'.repeat(100);
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto('/services/core/m1');
  await expect(page.locator('.detail-title p')).toHaveText('a'.repeat(100));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('detail uptime exposes partial sample coverage', async ({ page }) => {
  const data = detailFixture('core', 'm1', '24h')!;
  data.periodUptime = {
    value: 100,
    from: '2026-10-21T11:50:00Z',
    until: '2026-10-21T12:00:00Z',
    basis: 'observed-samples',
  };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto('/services/core/m1');
  const metric = page.locator('.detail-metrics > div').first();
  await expect(metric).toContainText('Partial coverage');
  await metric.getByRole('button').focus();
  await expect(page.getByRole('tooltip')).toContainText('11:50');
  await expect(page.getByRole('tooltip')).toContainText('12:00');
});

test('sorted chart data uses matching chronological axis labels', async ({ page }) => {
  const data = detailFixture('core', 'm1', '24h')!;
  data.response.reverse();
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto('/services/core/m1');
  await expect(page.locator('.chart-labels span').first()).toContainText('10/20');
  await expect(page.locator('.chart-labels span').last()).toContainText('10/21');
});

test('unknown and pending observed states use their semantic colors', async ({ page }) => {
  const data = groupFixture('core');
  data.monitors[0].state = 'unknown';
  data.monitors[1].state = 'pending';
  data.monitors[1].freshness = 'fresh';
  await page.route('**/api/v1/groups/core', (route) => route.fulfill({ json: data }));
  await page.goto('/');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    const colors = await page.evaluate(() =>
      ['.state.operational', '.state.unknown', '.state.pending'].map(
        (s) => getComputedStyle(document.querySelector(s)!).color,
      ),
    );
    expect(colors[1]).not.toBe(colors[0]);
    expect(colors[2]).not.toBe(colors[0]);
  }
});
