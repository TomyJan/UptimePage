import { test, expect } from '@playwright/test';

test('subgroup ID and localized name inputs align in both themes and viewport sizes', async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?configeditor=on');
    await page.getByRole('button', { name: 'Edit configuration', exact: true }).click();
    await page.getByRole('button', { name: 'Keep expanded', exact: true }).click();
    await page.getByRole('tab', { name: 'Groups & sources', exact: true }).click();
    await expect(page.locator('.ce-box .ce-columns')).toHaveCount(2);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      for (const language of ['简中', 'English']) {
        await page.getByRole('button', { name: language, exact: true }).click();
        const differences = await page.locator('.ce-box .ce-columns').evaluateAll((rows) =>
          rows.map((row) => {
            const [id, name] = [...row.querySelectorAll('input')].map((input) =>
              input.getBoundingClientRect(),
            );
            return Math.max(Math.abs(id.top - name.top), Math.abs(id.height - name.height));
          }),
        );
        expect(Math.max(...differences)).toBeLessThan(1);
        expect(
          await page.locator('.ce-panel').evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
      }
    }
  }
});
