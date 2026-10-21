import { expect, test } from '@playwright/test';
import { detailFixture } from '../../src/demo/fixtures.ts';

for (const language of ['en', 'zh-CN']) {
  for (const state of ['valid', 'expired', 'missing'] as const) {
    test(`certificate ${state} uses real expiry in ${language}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
      await page.addInitScript((language) => {
        localStorage.setItem('uptimepage.preferences', JSON.stringify({ language }));
      }, language);
      const detail = detailFixture('core', 'm1', '24h')!;
      detail.capabilities.certificate = state === 'missing' ? 'unavailable' : 'available';
      detail.certificateExpiresAt =
        state === 'missing'
          ? null
          : state === 'expired'
            ? '2026-10-20T12:00:00Z'
            : '2026-10-24T12:00:00Z';
      await page.route('**/api/v1/groups/core/monitors/m1?range=*', (route) =>
        route.fulfill({ json: detail }),
      );
      await page.goto('http://127.0.0.1:4173/services/core/m1');
      const card = page.locator('.detail-metrics > div').nth(3);
      await expect(card.locator('strong')).toHaveText(
        state === 'missing'
          ? '—'
          : state === 'expired'
            ? language === 'en'
              ? 'Expired'
              : '已过期'
            : language === 'en'
              ? '3 days'
              : '3 天',
      );
      await expect(card.locator('time')).toHaveCount(state === 'missing' ? 0 : 1);
      if (state !== 'missing')
        await expect(card.locator('time')).toHaveAttribute(
          'datetime',
          detail.certificateExpiresAt!,
        );
    });
  }
}
