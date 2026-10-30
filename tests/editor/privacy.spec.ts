import { test, expect } from '@playwright/test';

test('privacy navigation preserves editing and denied storage acknowledgment survives editor exit', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    }),
  );
  await page.goto('/?configeditor=on');
  const notice = page.getByRole('region', { name: 'Cookie & privacy' });
  await notice.getByRole('link', { name: 'Privacy policy' }).click();
  await expect(page).toHaveURL(/configeditor=on$/);
  expect(new URL(page.url()).pathname).toBe('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Configuration editor' })).toBeVisible();
  await notice.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('.privacy-notice')).toHaveCount(0);
  await page.getByRole('button', { name: 'Exit preview' }).click();
  await expect(page.locator('.ce-workspace')).toHaveCount(0);
  await expect(page.locator('.privacy-notice')).toHaveCount(0);
});

for (const width of [568, 480, 390, 320]) {
  for (const locale of ['en', 'zh-CN']) {
    test(`short editor layout stays clear at ${width}px in ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 320 });
      await page.addInitScript((language) => {
        localStorage.setItem('uptimepage.preferences', JSON.stringify({ language }));
      }, locale);
      await page.goto('/?configeditor=on');
      const notice = page.getByRole('region', {
        name: locale === 'zh-CN' ? 'Cookie 与隐私' : 'Cookie & privacy',
      });
      await expect(notice).toBeVisible();
      await expect(page.locator('.ce-panel')).toBeHidden();
      await page.evaluate(async () => {
        const { toastStore } = await import(
          /* @vite-ignore */ '/src/features/toasts/store.ts' as string
        );
        toastStore.push('Privacy layout test', 10000);
      });
      await expect(page.locator('.toast-card')).toBeVisible();
      await expect
        .poll(async () => {
          const toast = await page.locator('.toast-position:not(.is-exiting)').boundingBox();
          const navigation = await page.locator('.site-nav').boundingBox();
          const banner = await notice.boundingBox();
          return (
            toast!.y >= navigation!.y + navigation!.height && toast!.y + toast!.height < banner!.y
          );
        })
        .toBe(true);
      await notice.getByRole('button', { name: locale === 'zh-CN' ? '知道了' : 'Got it' }).click();
      await expect(page.locator('.privacy-notice')).toHaveCount(0);
      await expect(page.locator('.ce-panel')).toBeVisible();
      const box = await page.locator('.ce-panel').boundingBox();
      expect(box!.height).toBeGreaterThan(180);
      expect(box!.y).toBeGreaterThanOrEqual(34);
    });
  }
}
