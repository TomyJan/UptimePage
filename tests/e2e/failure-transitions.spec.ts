import { test, expect } from '@playwright/test';
import { detailFixture } from '../../src/demo/fixtures.ts';

test.use({ baseURL: 'http://127.0.0.1:4173' });

test('a successful chart and response value fade out before unavailable content replaces them', async ({
  page,
}) => {
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', async (route) => {
    const detail = detailFixture('core', 'm1', '24h')!;
    if (calls++ > 0) {
      await pending;
      detail.capabilities.response = 'unavailable';
      detail.response = [];
      detail.monitor.responseMs = null;
      detail.monitor.observedAt = null;
    }
    await route.fulfill({ json: detail });
  });
  await page.goto('/services/core/m1');
  await expect(page.locator('.chart-line')).toHaveCount(2);
  await page.waitForTimeout(700);
  const frames = page.evaluate(async () => {
    const chart = document.querySelector('.chart-host')!;
    const metric = document.querySelectorAll('.detail-metrics strong')[1];
    const chartOpacity: number[] = [],
      metricOpacity: number[] = [];
    const until = performance.now() + 1000;
    while (performance.now() < until) {
      if (chart.isConnected)
        chartOpacity.push(Number(getComputedStyle(chart.closest('.content-swap')!).opacity));
      if (metric.isConnected && metric.textContent!.includes('ms'))
        metricOpacity.push(Number(getComputedStyle(metric.closest('.content-swap')!).opacity));
      await new Promise(requestAnimationFrame);
    }
    return { chartOpacity, metricOpacity };
  });
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  release();
  await expect(page.locator('.chart-panel')).toContainText('No data');
  await expect(page.locator('.detail-metrics > div').nth(1).locator('strong')).toHaveText('—');
  const samples = await frames;
  for (const values of [samples.chartOpacity, samples.metricOpacity])
    expect(values.filter((value) => value > 0.05 && value < 0.95).length).toBeGreaterThan(2);
});

test('initial detail failure and retry animate the page height instead of replacing the shell', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', async (route) => {
    if (calls++ === 0) {
      await pending;
      return route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } });
    }
    return route.fulfill({ json: detailFixture('core', 'm1', '24h') });
  });
  await page.goto('/services/core/m1');
  await expect(page.locator('.chart-panel')).toHaveAttribute('aria-busy', 'true');
  await page.waitForTimeout(700);
  const sample = () =>
    page.evaluate(async () => {
      const heights: number[] = [];
      const until = performance.now() + 1100;
      while (performance.now() < until) {
        heights.push(
          document.querySelector('main')!.firstElementChild!.getBoundingClientRect().height,
        );
        await new Promise(requestAnimationFrame);
      }
      return heights;
    });
  const failure = sample();
  await page.evaluate(() => true);
  release();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  const failureHeights = await failure;
  const recovery = sample();
  await page.evaluate(() => true);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.chart-line')).toHaveCount(2);
  const recoveryHeights = await recovery;
  for (const heights of [failureHeights, recoveryHeights]) {
    const delta = Math.max(...heights) - Math.min(...heights);
    expect(delta).toBeGreaterThan(100);
    expect(new Set(heights.map(Math.round)).size).toBeGreaterThan(8);
    expect(Math.max(...heights.slice(1).map((h, i) => Math.abs(h - heights[i])))).toBeLessThan(
      delta * 0.6,
    );
  }
});

test('reduced motion switches failure and recovery without delayed views or resize errors', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let calls = 0;
  await page.route('**/api/v1/groups/core/monitors/m1?range=24h', (route) => {
    const detail = detailFixture('core', 'm1', '24h')!;
    if (calls++ % 2) {
      detail.capabilities.response = 'unavailable';
      detail.response = [];
      detail.monitor.responseMs = null;
      detail.monitor.observedAt = null;
    }
    return route.fulfill({ json: detail });
  });
  await page.goto('/services/core/m1');
  await expect(page.locator('.chart-line')).toHaveCount(2);
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
    if (i % 2) await expect(page.locator('.chart-line')).toHaveCount(2);
    else await expect(page.locator('.chart-panel')).toContainText('No data');
    await expect(page.locator('.content-swap.is-leaving')).toHaveCount(0);
    expect(
      await page
        .locator('.detail-stage')
        .evaluate((el) =>
          el
            .getAnimations({ subtree: true })
            .some((animation) => animation.playState === 'running'),
        ),
    ).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('rapid range changes cancel old exits, and revoked monitors are removed immediately', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  let revoked = false;
  await page.route('**/api/v1/groups/core/monitors/m1?range=*', async (route) => {
    const range = new URL(route.request().url()).searchParams.get('range');
    if (range !== '24h') {
      await pending;
      return route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } });
    }
    return revoked
      ? route.fulfill({ status: 404, json: { error: { code: 'not-found' } } })
      : route.fulfill({ json: detailFixture('core', 'm1', '24h') });
  });
  await page.goto('/services/core/m1');
  await expect(page.locator('.chart-line')).toHaveCount(2);
  await page.getByRole('button', { name: '7d', exact: true }).click();
  await page.getByRole('button', { name: '30d', exact: true }).click();
  await page.getByRole('button', { name: '24h', exact: true }).click();
  release();
  await expect(page.locator('.chart-line')).toHaveCount(2);
  await expect(page.locator('.content-swap.is-leaving')).toHaveCount(0);
  await page.waitForTimeout(650);
  await expect(page.locator('.chart-panel')).not.toContainText('Unable to load');
  await expect(page.locator('.chart-panel')).toHaveAttribute('aria-busy', 'false');
  revoked = true;
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('.detail-stage')).toHaveCount(0);
  await expect(page.locator('.chart-host')).toHaveCount(0);
  await expect(page.locator('.detail-name')).toHaveCount(0);
});

test('reversing an unfinished exit restores the current opacity without flashing transparent', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/v1/groups/core/monitors/m1?range=*', async (route) => {
    if (route.request().url().endsWith('7d')) await pending;
    return route.fulfill({
      json: detailFixture('core', 'm1', route.request().url().endsWith('7d') ? '7d' : '24h'),
    });
  });
  await page.goto('/services/core/m1');
  await expect(page.locator('.chart-line')).toHaveCount(2);
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '7d', exact: true }).click();
  const samples = page.evaluate(async () => {
    const view = document.querySelector('.chart-host')!.closest('.content-swap')!;
    const values: number[] = [];
    const until = performance.now() + 650;
    while (performance.now() < until) {
      values.push(view.isConnected ? Number(getComputedStyle(view).opacity) : 0);
      await new Promise(requestAnimationFrame);
    }
    return values;
  });
  await page.evaluate(() => true);
  await page.getByRole('button', { name: '24h', exact: true }).click();
  release();
  expect(Math.min(...(await samples))).toBeGreaterThan(0.15);
  await expect(page.locator('.chart-line')).toHaveCount(2);
  await expect(page.locator('.content-swap.is-leaving')).toHaveCount(0);
});
