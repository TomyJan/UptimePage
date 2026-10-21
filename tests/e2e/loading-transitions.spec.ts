import { test, expect } from '@playwright/test';
import { detailFixture, groupFixture } from '../../src/demo/fixtures.ts';

test.use({ baseURL: 'http://127.0.0.1:4173' });

test('visited group counts remain visible without fetching unselected groups', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/v1/groups/*', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
    requests.push(id);
    return route.fulfill({ json: groupFixture(id) });
  });
  await page.goto('/');
  const groups = page.getByRole('tablist', { name: 'Groups', exact: true });
  await expect(groups.getByRole('tab').first().locator('.count')).toHaveText('10');
  expect(requests).toEqual(['core']);
  await groups.getByRole('tab').nth(1).click();
  await expect(groups.getByRole('tab').nth(1).locator('.count')).toHaveText('10');
  await expect(groups.getByRole('tab').first().locator('.count')).toHaveText('10');
  await groups.getByRole('tab').first().click();
  await expect(groups.getByRole('tab').nth(1).locator('.count')).toHaveText('10');
  expect(requests).toEqual(['core', 'external']);
});

test('a newly known count expands without snapping the tab width', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/v1/groups/core', async (route) => {
    await pending;
    await route.fulfill({ json: groupFixture('core') });
  });
  await page.goto('/');
  const count = page.locator('.group-tabs .count-shell').first();
  await expect(count).toHaveAttribute('data-visible', 'false');
  const pin = page.locator('.pin-toggle');
  await pin.focus();
  const frames = page.evaluate(async () => {
    const widths: number[] = [];
    const until = performance.now() + 700;
    while (performance.now() < until) {
      widths.push(
        document.querySelector('.group-tabs .count-shell')!.getBoundingClientRect().width,
      );
      await new Promise(requestAnimationFrame);
    }
    return widths;
  });
  release();
  await expect(count).toHaveText('10');
  const widths = await frames;
  expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(10);
  expect(new Set(widths.map(Math.round)).size).toBeGreaterThan(5);
  await expect(pin).toBeFocused();
});

test('home card heights animate from the measured skeleton size', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  const data = groupFixture('core');
  data.monitors.forEach((m) => {
    m.description = 'An optional service description';
  });
  await page.route('**/api/v1/groups/core', async (route) => {
    await pending;
    await route.fulfill({ json: data });
  });
  await page.goto('/');
  await expect(page.locator('.monitor-loading').first()).toBeVisible();
  await page.waitForTimeout(500);
  const frames = page.evaluate(async () => {
    const heights: number[] = [];
    const totals: number[] = [];
    const until = performance.now() + 900;
    while (performance.now() < until) {
      heights.push(document.querySelector('.monitor')!.getBoundingClientRect().height);
      totals.push(document.querySelector('.status-body')!.getBoundingClientRect().height);
      await new Promise(requestAnimationFrame);
    }
    return { heights, totals };
  });
  release();
  await expect(page.locator('.monitor-description').first()).toBeVisible();
  const { heights, totals } = await frames;
  const delta = Math.max(...heights) - Math.min(...heights);
  // The layouts are intentionally close; even their small size difference must interpolate.
  expect(delta).toBeGreaterThan(1);
  expect(new Set(heights.map((h) => Math.round(h * 10))).size).toBeGreaterThan(5);
  expect(Math.max(...heights.slice(1).map((h, i) => Math.abs(h - heights[i])))).toBeLessThan(
    delta * 0.7,
  );
  const totalDelta = Math.max(...totals) - Math.min(...totals);
  expect(totalDelta).toBeGreaterThan(300);
  expect(Math.max(...totals.slice(1).map((h, i) => Math.abs(h - totals[i])))).toBeLessThan(
    totalDelta * 0.6,
  );
});

for (const reduced of [false, true]) {
  test(`initial detail cards keep their shells and resize smoothly (reduced=${reduced})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const detail = detailFixture('core', 'm1', '24h')!;
    detail.events = Array.from({ length: 5 }, (_, i) => ({
      id: `event-${i}`,
      state: 'down',
      from: new Date(Date.UTC(2026, 9, 20, i)).toISOString(),
      until: new Date(Date.UTC(2026, 9, 20, i, 15)).toISOString(),
    }));
    await page.route('**/api/v1/groups/core/monitors/m1?range=24h', async (route) => {
      await pending;
      await route.fulfill({ json: detail });
    });
    await page.goto('/services/core/m1');
    // The route module has its own identical fallback; measure the data request shell.
    await expect(page.getByRole('button', { name: 'Refresh now', exact: true })).toBeVisible();
    await expect(page.locator('.events-panel')).toHaveAttribute('aria-busy', 'true');
    const shell = await page.locator('.events-panel').elementHandle();
    await page.waitForTimeout(500);
    const frames = page.evaluate(async () => {
      const heights: number[] = [];
      const until = performance.now() + 1000;
      while (performance.now() < until) {
        heights.push(document.querySelector('.events-panel')!.getBoundingClientRect().height);
        await new Promise(requestAnimationFrame);
      }
      return heights;
    });
    release();
    await expect(page.locator('.event')).toHaveCount(5);
    expect(await shell!.evaluate((node) => node === document.querySelector('.events-panel'))).toBe(
      true,
    );
    const heights = await frames;
    const delta = Math.max(...heights) - Math.min(...heights);
    expect(delta).toBeGreaterThan(80);
    if (reduced) {
      expect(
        await page
          .locator('.events-panel')
          .evaluate((el) =>
            el.getAnimations({ subtree: true }).some((a) => a.playState === 'running'),
          ),
      ).toBe(false);
    } else {
      expect(new Set(heights.map(Math.round)).size).toBeGreaterThan(8);
      expect(Math.max(...heights.slice(1).map((h, i) => Math.abs(h - heights[i])))).toBeLessThan(
        delta * 0.6,
      );
    }
  });
}
