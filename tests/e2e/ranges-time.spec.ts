import { test, expect } from '@playwright/test';
import { detailFixture } from '../../src/demo/fixtures.ts';
import type { Range } from '../../src/shared/contracts.ts';

test.use({ baseURL: 'http://127.0.0.1:4173', timezoneId: 'UTC' });

test('latest response and check timestamps include seconds, intervals use readable units', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'uptimepage.preferences',
      JSON.stringify({ language: 'zh-CN', timeZone: 'UTC' }),
    ),
  );
  await page.route('**/api/v1/groups/core/monitors/m1?range=*', (route) => {
    const d = detailFixture(
      'core',
      'm1',
      new URL(route.request().url()).searchParams.get('range') as Range,
    )!;
    d.monitor.observedAt = '2026-10-21T11:59:37.000Z';
    d.intervalSeconds = 300;
    return route.fulfill({ json: d });
  });
  await page.goto('/services/core/m1');
  await expect(page.locator('.detail-metrics > div').nth(1).locator('time')).toHaveText(/11:59:37/);
  await expect(page.locator('.facts')).toContainText('5 分钟');
  await expect(page.locator('.facts time')).toHaveText(/11:59:37/);
  for (const range of ['7d', '30d']) {
    await page.getByRole('button', { name: range, exact: true }).click();
    await expect(page.locator('.detail-metrics small').first()).toHaveText(`${range} 可用率`);
    await expect(page.locator('.panel h2').filter({ hasText: '检查记录' })).toContainText(range);
    await expect(page.locator('.chart-labels span').first()).toHaveText(/\d{2}:\d{2}:\d{2}/);
  }
});

test('short missing checks use a dashed connector while outages remain disconnected', async ({
  page,
}) => {
  await page.route('**/api/v1/groups/core/monitors/m1?range=*', (route) => {
    const d = detailFixture('core', 'm1', '24h')!;
    const at = (i: number) =>
      new Date(Date.parse(d.fetchedAt) - 3000000 + i * 300000).toISOString();
    d.response = [
      { at: at(0), valueMs: 42 },
      { at: at(1), valueMs: null, gap: 'short-missing' },
      { at: at(2), valueMs: 44 },
      { at: at(3), valueMs: null },
      { at: at(4), valueMs: 45 },
    ];
    return route.fulfill({ json: d });
  });
  await page.goto('/services/core/m1');
  await expect(page.locator('.chart-line')).toHaveCount(3);
  await expect(page.locator('.chart-bridge')).toHaveCount(1);
  await expect(page.locator('.chart-bridge')).toHaveAttribute('stroke-dasharray', '3 4');
});
