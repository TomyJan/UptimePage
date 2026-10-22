import { test, expect } from '@playwright/test';
import { detailFixture } from '../../src/demo/fixtures.ts';

test('history tooltip follows the selected record on the list and detail pages', async ({
  page,
}) => {
  for (const url of ['/', '/services/core/m3']) {
    await page.goto(url);
    const history = page.locator('.bars').first();
    await expect(history).toBeVisible();
    // Keep scaled cells clear of viewport edges: hover's automatic 1 px scroll
    // correctly dismisses the tooltip, which is separate from positioning.
    await page.mouse.move(0, 0);
    await history.evaluate(async (node) => {
      node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      let last = '',
        stable = 0;
      while (stable < 4) {
        await new Promise(requestAnimationFrame);
        const box = node.getBoundingClientRect();
        const position = `${scrollY}:${box.x}:${box.y}:${box.width}:${box.height}`;
        stable = position === last ? stable + 1 : 0;
        last = position;
      }
    });
    const lastIndex = (await history.locator('.bar').count()) - 4;
    for (const index of [4, lastIndex]) {
      const bar = history.locator('.bar').nth(index);
      const target = (await bar.boundingBox())!;
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
      const tip = page.getByRole('tooltip');
      await expect(tip).toBeVisible();
      await expect
        .poll(async () => {
          const target = (await bar.boundingBox())!;
          const popup = (await tip.boundingBox())!;
          return Math.abs(popup.x + popup.width / 2 - target.x - target.width / 2);
        })
        .toBeLessThan(4);
    }
    await history.focus();
    await history.press('ArrowLeft');
    const selected = history.locator('.bar').nth(lastIndex - 1);
    await expect
      .poll(async () => {
        const target = (await selected.boundingBox())!;
        const popup = (await page.getByRole('tooltip').boundingBox())!;
        return Math.abs(popup.x + popup.width / 2 - target.x - target.width / 2);
      })
      .toBeLessThan(4);
    await history.press('Escape');
    await expect(page.getByRole('tooltip')).toBeHidden();
  }
});

test('response panel height and following content move smoothly through loading and failure', async ({
  page,
}) => {
  await page.route('**/api/v1/groups/core/monitors/m1?range=*', async (route) => {
    if (route.request().url().endsWith('24h'))
      return route.fulfill({ json: detailFixture('core', 'm1', '24h') });
    await new Promise((resolve) => setTimeout(resolve, 220));
    return route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } });
  });
  await page.goto('http://127.0.0.1:4173/services/core/m1');
  await expect(page.locator('.chart-line')).toHaveCount(2);
  // Wait for the first layout to settle before measuring a user-triggered change.
  await page.waitForTimeout(550);
  const frames = page.evaluate(async () => {
    const heights: number[] = [];
    const until = performance.now() + 1300;
    while (performance.now() < until) {
      heights.push(document.querySelector('.chart-panel')!.getBoundingClientRect().height);
      await new Promise(requestAnimationFrame);
    }
    return heights;
  });
  await page.getByRole('button', { name: '7d', exact: true }).click();
  await expect(page.locator('.chart-panel')).toContainText('Unable to load');
  const heights = await frames;
  const range = Math.max(...heights) - Math.min(...heights);
  expect(range).toBeGreaterThan(40);
  expect(new Set(heights.map(Math.round)).size).toBeGreaterThan(8);
  expect(Math.max(...heights.slice(1).map((h, i) => Math.abs(h - heights[i])))).toBeLessThan(
    range * 0.6,
  );
  await page.getByRole('button', { name: '24h', exact: true }).click();
  await expect(page.locator('.chart-line')).toHaveCount(2);
  await expect
    .poll(async () =>
      Math.abs(
        (await page.locator('.chart-body').boundingBox())!.height -
          (await page.locator('.chart-body > .resize-content').boundingBox())!.height,
      ),
    )
    .toBeLessThan(1);
});

test('missing samples stay disconnected and recent events distinguish ongoing and ended incidents', async ({
  page,
}, info) => {
  const data = detailFixture('core', 'm1', '24h')!;
  data.events = [
    { id: 'ended', state: 'down', from: '2026-10-20T10:00:00Z', until: '2026-10-20T10:15:00Z' },
    { id: 'ongoing', state: 'maintenance', from: '2026-10-21T11:00:00Z', until: null },
  ];
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto('http://127.0.0.1:4173/services/core/m1');
  await expect(page.locator('.chart-line')).toHaveCount(2);
  await expect(page.locator('.chart-note')).toContainText('Missing samples');
  const events = page.getByRole('list', { name: 'Recent events' }).getByRole('listitem');
  await expect(events).toHaveCount(2);
  await expect(events.first()).toContainText('Maintenance');
  await expect(events.first()).toContainText('Ongoing');
  await expect(events.last()).toContainText('Ended');
  await expect(events.last().locator('time')).toHaveCount(2);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: info.outputPath('events-light.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await page.waitForTimeout(550);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(events.first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('events-mobile-dark.png'), fullPage: true });
});

test('recent events scroll inside the card after reaching its maximum height', async ({ page }) => {
  const data = detailFixture('core', 'm1', '24h')!;
  data.events = Array.from({ length: 18 }, (_, i) => ({
    id: `event-${i}`,
    state: i % 2 ? 'maintenance' : 'down',
    from: new Date(Date.UTC(2026, 9, 20, i % 24)).toISOString(),
    until: new Date(Date.UTC(2026, 9, 20, i % 24, 15)).toISOString(),
  }));
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto('http://127.0.0.1:4173/services/core/m1');
  await expect(page.locator('.event')).toHaveCount(18);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const list = page.getByRole('list', { name: 'Recent events' });
    const metrics = await list.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: getComputedStyle(node).overflowY,
    }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.clientHeight).toBeLessThanOrEqual(width === 390 ? 308 : 368);
    expect(metrics.overflowY).toBe('auto');
    await list.evaluate((node) => (node.scrollTop = node.scrollHeight));
    expect(await list.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'Recent events' })).toBeVisible();
  }
});

test('filtering the home list animates its height without losing search focus', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(10);
  await page.waitForTimeout(550);
  const samples = page.evaluate(async () => {
    const values: number[] = [];
    const until = performance.now() + 850;
    while (performance.now() < until) {
      values.push(document.querySelector('.status-body')!.getBoundingClientRect().height);
      await new Promise(requestAnimationFrame);
    }
    return values;
  });
  const search = page.getByRole('searchbox');
  await search.fill('website');
  await expect(page.locator('.monitor')).toHaveCount(1);
  const values = await samples;
  expect(new Set(values.map(Math.round)).size).toBeGreaterThan(8);
  expect(Math.max(...values.slice(1).map((h, i) => Math.abs(h - values[i])))).toBeLessThan(
    (Math.max(...values) - Math.min(...values)) * 0.6,
  );
  await expect(search).toBeFocused();
  await search.fill('');
  await expect(page.locator('.monitor')).toHaveCount(10);
});

test('history tooltips stay on screen at both ends on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/services/core/m1');
  const history = page.locator('.bars');
  for (const bar of [history.locator('.bar').first(), history.locator('.bar').last()]) {
    await bar.hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    const box = (await tip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(10);
    expect(box.x + box.width).toBeLessThanOrEqual(310);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(740);
  }
});

test('reduced motion skips size and content animations during range changes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.addEventListener('error', (event) => {
      if (event.message.includes('ResizeObserver')) {
        const observed = window as Window & { resizeErrors?: string[] };
        (observed.resizeErrors ??= []).push(event.message);
      }
    });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/services/core/m1');
  await expect(page.locator('.chart-line')).toHaveCount(2);
  await page.getByRole('button', { name: '7d', exact: true }).click();
  await expect(page.locator('.chart-loading')).toBeVisible();
  await expect(page.locator('.chart-line')).toHaveCount(2);
  const panel = page.locator('.chart-body');
  await expect(panel).toBeVisible();
  expect(
    await panel.evaluate((el) =>
      el.getAnimations({ subtree: true }).some((a) => a.playState === 'running'),
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(() => (window as Window & { resizeErrors?: string[] }).resizeErrors ?? []),
  ).toEqual([]);
});

test('continuous samples have no gap notice and unavailable events do not look like a healthy history', async ({
  page,
}) => {
  const data = detailFixture('core', 'm1', '24h')!;
  data.response = data.response.map((point) => ({ ...point, valueMs: 100 }));
  data.capabilities.events = 'unavailable';
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto('http://127.0.0.1:4173/services/core/m1');
  await expect(page.locator('.chart-line')).toHaveCount(1);
  await expect(page.locator('.chart-note')).toHaveCount(0);
  await expect(page.locator('.events-panel')).toContainText('No data');
  await expect(page.locator('.events-empty.is-clear')).toHaveCount(0);
});

test('recent event cards resize smoothly when a refresh changes the incident history', async ({
  page,
}) => {
  const data = detailFixture('core', 'm1', '24h')!;
  const events = Array.from({ length: 6 }, (_, i) => ({
    id: `incident-${i}`,
    state: 'down' as const,
    from: new Date(Date.UTC(2026, 9, 20, i)).toISOString(),
    until: new Date(Date.UTC(2026, 9, 20, i, 15)).toISOString(),
  }));
  let requests = 0;
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', (route) =>
    route.fulfill({ json: { ...data, events: requests++ === 0 ? events : [] } }),
  );
  await page.goto('http://127.0.0.1:4173/services/core/m1');
  await expect(page.locator('.event')).toHaveCount(6);
  await page.waitForTimeout(550);
  const samples = page.evaluate(async () => {
    const values: number[] = [];
    const until = performance.now() + 950;
    while (performance.now() < until) {
      values.push(document.querySelector('.detail-bottom')!.getBoundingClientRect().height);
      await new Promise(requestAnimationFrame);
    }
    return values;
  });
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('.event')).toHaveCount(0);
  const values = await samples;
  expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(80);
  expect(new Set(values.map(Math.round)).size).toBeGreaterThan(8);
});
