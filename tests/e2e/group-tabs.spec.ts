import { expect, test } from '@playwright/test';
import { groupFixture } from '../../src/demo/fixtures.ts';

test.use({ baseURL: 'http://127.0.0.1:4173' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'uptimepage.preferences',
      JSON.stringify({ language: 'en', refresh: 0, timeZone: 'UTC' }),
    );
  });
});

test('narrow subgroup tabs keep names and counts separate and scroll the selected tab into view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 840 });
  await page.route('**/api/v1/groups/core', (route) =>
    route.fulfill({ json: groupFixture('core') }),
  );
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(10);
  const tabs = page.getByRole('tablist', { name: 'Subgroups', exact: true });
  expect(await tabs.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  for (const tab of await tabs.getByRole('tab').all()) {
    const layout = await tab.evaluate((el) => {
      const label = el.querySelector(':scope > span:not(.logo):not(.count-shell)')!;
      const count = el.querySelector('.count-shell')!;
      return {
        textEnd: label.getBoundingClientRect().right,
        countStart: count.getBoundingClientRect().left,
      };
    });
    expect(layout.countStart).toBeGreaterThanOrEqual(layout.textEnd);
  }
  await tabs.getByRole('tab').first().focus();
  await page.keyboard.press('End');
  const last = tabs.getByRole('tab').last();
  await expect(last).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(async () => {
      const [outer, item] = await Promise.all([tabs.boundingBox(), last.boundingBox()]);
      return item!.x >= outer!.x && item!.x + item!.width <= outer!.x + outer!.width + 1;
    })
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the selected subgroup stays visible when asynchronously loaded counts widen the tabs', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 840 });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/v1/groups/core', async (route) => {
    await pending;
    await route.fulfill({ json: groupFixture('core', 4) });
  });
  await page.goto('/?s=infra');
  const tabs = page.getByRole('tablist', { name: 'Subgroups', exact: true });
  const selected = tabs.getByRole('tab', { selected: true });
  const fullyVisible = async () => {
    const [outer, item] = await Promise.all([tabs.boundingBox(), selected.boundingBox()]);
    return item!.x >= outer!.x && item!.x + item!.width <= outer!.x + outer!.width + 1;
  };
  await expect.poll(fullyVisible).toBe(true);
  release();
  await expect(selected.locator('.count-shell')).toHaveAttribute('data-visible', 'true');
  await expect(selected.locator('.count-shell')).toHaveCSS('opacity', '1');
  await expect.poll(fullyVisible).toBe(true);
});

test('a preceding group count keeps the active indicator aligned after navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 840 });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/v1/groups/core', async (route) => {
    await pending;
    await route.fulfill({ json: groupFixture('core', 2) });
  });
  await page.route('**/api/v1/groups/external', (route) =>
    route.fulfill({ json: groupFixture('external', 2) }),
  );
  await page.goto('/');
  const tabs = page.getByRole('tablist', { name: 'Groups', exact: true });
  const selected = tabs.getByRole('tab').nth(1);
  await selected.click();
  await expect(selected.locator('.count-shell')).toHaveAttribute('data-visible', 'true');
  await expect(selected.locator('.count-shell')).toHaveCSS('opacity', '1');
  await selected.evaluate(async (node) => {
    await Promise.allSettled(
      node.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  release();
  const preceding = tabs.getByRole('tab').first();
  await expect(preceding.locator('.count-shell')).toHaveAttribute('data-visible', 'true');
  await expect(preceding.locator('.count-shell')).toHaveCSS('opacity', '1');
  await expect
    .poll(async () => {
      const [item, indicator] = await Promise.all([
        selected.boundingBox(),
        tabs.locator('.tab-indicator').boundingBox(),
      ]);
      return Math.abs(indicator!.x - item!.x - 12);
    })
    .toBeLessThan(1);
});
