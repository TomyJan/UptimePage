import { test, expect } from '@playwright/test';
import { groupFixture } from '../../src/demo/fixtures.ts';

test.use({ baseURL: 'http://127.0.0.1:4173' });

for (const width of [1440, 1024, 390]) {
  test(`home cards center their content before and after loading at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/v1/groups/core', async (route) => {
      await pending;
      const data = groupFixture('core', 2);
      data.monitors[0].description = null;
      data.monitors[1].description = 'A service with a description';
      await route.fulfill({ json: data });
    });
    await page.goto('/');
    await expect(page.locator('.monitor-loading').first()).toBeVisible();
    const offsets = () =>
      page.locator('.monitor').evaluateAll((cards) =>
        cards.map((card) => {
          const bounds = card.getBoundingClientRect();
          const content = card.querySelector('.monitor-grid')!.getBoundingClientRect();
          return Math.abs((bounds.top + bounds.bottom) / 2 - (content.top + content.bottom) / 2);
        }),
      );
    expect(Math.max(...(await offsets()))).toBeLessThan(1);
    release();
    await expect(page.locator('.monitor-loading')).toHaveCount(0);
    await expect(page.locator('.monitor')).toHaveCount(2);
    // Height and entry animations must settle before checking the resting position.
    await expect.poll(async () => Math.max(...(await offsets()))).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
