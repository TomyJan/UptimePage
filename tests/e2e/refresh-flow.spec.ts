import { expect, test } from '@playwright/test';
import { detailFixture, groupFixture } from '../../src/demo/fixtures.ts';

test.use({ baseURL: 'http://127.0.0.1:4173' });
const first = '2026-10-21T12:00:00.000Z';
const next = '2026-10-21T12:01:00.000Z';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'uptimepage.preferences',
      JSON.stringify({ language: 'en', refresh: 0, timeZone: 'UTC' }),
    );
  });
});

for (const view of ['home', 'detail'] as const) {
  const path = view === 'home' ? '/' : '/services/core/m1';
  const endpoint =
    view === 'home' ? '**/api/v1/groups/core' : '**/api/v1/groups/core/monitors/m1?range=24h';
  const fixture = (at: string) =>
    view === 'home'
      ? groupFixture('core', 2, Date.parse(at))
      : detailFixture('core', 'm1', '24h', Date.parse(at))!;

  test(`${view}: cached partial data keeps its time and retry shares the refresh state`, async ({
    page,
  }) => {
    let requests = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    await page.route(endpoint, async (route) => {
      const data = fixture(++requests === 1 ? first : next);
      if (requests === 1) {
        if ('monitors' in data) {
          data.freshness = 'stale';
          data.monitors[0].freshness = 'unavailable';
          data.subgroupErrors = [
            { subgroupId: 'web', code: 'unavailable', diagnostic: { reason: 'timeout' } },
          ];
        } else {
          data.monitor.freshness = 'stale';
          data.diagnostic = { reason: 'timeout' };
        }
      } else await pending;
      await route.fulfill({ json: data });
    });
    await page.goto(path);
    await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', first);
    await expect(page.locator('.load-notice')).toContainText('timed out');
    if (view === 'home') {
      await expect(page.locator('.load-notice')).toContainText('Websites');
      await expect(page.locator('.monitor-load-error')).toHaveCount(1);
    }
    await page.locator('.load-notice').getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('.refresh-main')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.refresh-main')).toBeDisabled();
    await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', first);
    release();
    await expect(page.locator('.refresh-main')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', next);
    await expect(page.locator('.load-notice')).toHaveCount(0);
    await expect(page.locator('.monitor-load-error')).toHaveCount(0);
    await expect(page.locator('.toast-message')).toHaveText('Refreshed');
    expect(requests).toBe(2);
  });

  test(`${view}: retrying an initial failure drives the same loading and timestamp lifecycle`, async ({
    page,
  }) => {
    let requests = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    await page.route(endpoint, async (route) => {
      if (++requests === 1)
        return route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } });
      await pending;
      await route.fulfill({ json: fixture(next) });
    });
    await page.goto(path);
    await expect(page.locator('.empty')).toContainText('Unable to load');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('.refresh-main')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.refresh-main')).toBeDisabled();
    release();
    await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', next);
    await expect(page.locator('.toast-message')).toHaveText('Refreshed');
    expect(requests).toBe(2);
  });

  test(`${view}: automatic refresh shares the busy state, preserves the time on failure and recovers`, async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'uptimepage.preferences',
        JSON.stringify({ language: 'en', refresh: 30, timeZone: 'UTC' }),
      ),
    );
    await page.clock.install({ time: new Date(first) });
    let requests = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    await page.route(endpoint, async (route) => {
      if (++requests === 2) {
        await pending;
        return route.fulfill({
          status: 503,
          json: { error: { code: 'unavailable', diagnostic: { reason: 'timeout' } } },
        });
      }
      await route.fulfill({ json: fixture(requests === 1 ? first : next) });
    });
    await page.goto(path);
    await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', first);
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
    await page.clock.fastForward(30_000);
    await expect(page.locator('.refresh-main')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.refresh-main')).toBeDisabled();
    await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', first);
    release();
    await expect(page.locator('.refresh-main')).toHaveAttribute('aria-busy', 'false');
    await page.clock.resume();
    await expect(page.locator('.load-notice')).toContainText('timed out');
    await expect(page.locator('.toast-message')).toContainText('timed out');
    await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', first);
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
    await page.clock.fastForward(30_000);
    await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', next);
    await page.clock.resume();
    await expect(page.locator('.load-notice')).toHaveCount(0);
    await expect(page.locator('.toast-message').filter({ hasText: /^Refreshed$/ })).toHaveCount(1);
    expect(requests).toBe(3);
  });
}

test('a partial refresh preserves the prior time and identifies the failed members', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/api/v1/groups/core', async (route) => {
    const data = groupFixture('core', 2, Date.parse(++requests === 1 ? first : next));
    if (requests > 1) {
      data.freshness = 'stale';
      data.monitors[0].freshness = 'unavailable';
      data.subgroupErrors = [
        { subgroupId: 'web', code: 'unavailable', diagnostic: { reason: 'timeout' } },
      ];
    }
    await route.fulfill({ json: data });
  });
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(2);
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('.load-notice')).toContainText('Websites');
  await expect(page.locator('.load-notice')).toContainText('timed out');
  await expect(page.locator('.monitor-load-error')).toHaveCount(1);
  await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', first);
  await expect(page.locator('.monitor .state.operational')).toHaveCount(1);
  await expect(page.locator('.toast-message')).toContainText('timed out');
});

test('range changes drive refresh loading without clearing the last snapshot time', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/v1/groups/core/monitors/m1?range=*', async (route) => {
    const range = new URL(route.request().url()).searchParams.get('range') === '7d' ? '7d' : '24h';
    if (range === '7d') await pending;
    await route.fulfill({
      json: detailFixture('core', 'm1', range, Date.parse(range === '7d' ? next : first)),
    });
  });
  await page.goto('/services/core/m1');
  await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', first);
  await page.getByRole('button', { name: '7d', exact: true }).click();
  await expect(page.locator('.refresh-main')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', first);
  await expect(page.locator('.chart-panel')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.checks-panel')).toHaveAttribute('aria-busy', 'true');
  release();
  await expect(page.locator('.refresh-main')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', next);
});
