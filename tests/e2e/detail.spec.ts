import { test, expect } from '@playwright/test';
test('detail deep links, ranges and back preserve list selection', async ({ page }) => {
  await page.goto('/?g=core&s=web&q=website');
  await page.getByRole('link', { name: 'Website', exact: true }).click();
  await expect(page).toHaveURL(/\/services\/core\/m1/);
  await expect(page.locator('h1')).toHaveText('Website');
  await expect(page.locator('.chart-line')).toHaveCount(2);
  await page.getByRole('button', { name: '7d', exact: true }).click();
  await page.getByRole('button', { name: '30d', exact: true }).click();
  await expect(page.getByRole('button', { name: '30d', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Website');
  await page.getByRole('link', { name: /Back/ }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('website');
  await expect(page.getByRole('tab', { name: /Websites/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
test('unknown IDs and unavailable capabilities do not invent data', async ({ page }) => {
  await page.goto('/services/core/m10');
  await expect(page.locator('h1')).toHaveText('Backup');
  await expect(page.getByRole('button', { name: '7d', exact: true })).toBeDisabled();
  await expect(page.locator('.detail-metrics')).toContainText('—');
  await page.goto('/services/core/not-public');
  await expect(page.getByText('Service unavailable')).toBeVisible();
  await expect(page.locator('.detail-metrics')).toHaveCount(0);
});

test('unavailable ranges explain why and chart times follow timezone without repeating its label', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('uptimepage.preferences', JSON.stringify({ timeZone: 'UTC' }));
  });
  await page.goto('/services/core/m10');
  const range = page.getByRole('button', { name: '7d', exact: true });
  await range.focus();
  await expect(page.getByRole('tooltip')).toHaveText('This source does not provide this range');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '24h', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  await page.goto('/services/core/m1');
  await expect(page.locator('.chart-labels span').first()).toContainText('12:00');
  await expect(page.locator('.chart-timezone')).toHaveCount(0);
  await page.getByRole('button', { name: 'Timezone', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /Shanghai/ }).click();
  await expect(page.locator('.chart-labels span').first()).toContainText('20:00');
  await expect(page.locator('.chart-timezone')).toHaveCount(0);
});
