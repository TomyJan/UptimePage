import { test, expect } from '@playwright/test';
test('preference menus support keyboard, escape and focus restoration', async ({ page }) => {
  await page.goto('/');
  for (const label of ['Language', 'Timezone', 'Appearance']) {
    const trigger = page.getByRole('button', { name: label, exact: true });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menu')).toBeVisible();
    // Visibility can precede Radix's focus effect during the opening animation.
    // Send Escape only once this menu owns keyboard input.
    await expect
      .poll(() => page.getByRole('menu').evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '简体中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('select,[title]')).toHaveCount(0);
});
