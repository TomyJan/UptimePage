import { expect, test, type Page } from '@playwright/test';
import { publicConfig } from '../../src/data/config.ts';
import { detailFixture, groupFixture } from '../../src/demo/fixtures.ts';

test.use({ baseURL: process.env.UPTIMEPAGE_PREVIEW_URL ?? 'http://127.0.0.1:4173' });
const start = new Date('2026-10-30T12:00:00Z');
const retryAt = '2026-10-30T12:10:00Z';
const first = publicConfig.groups[0];
const second = publicConfig.groups[1];

async function prepareClock(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem('uptimepage.preferences', JSON.stringify({ language: 'en', refresh: 30 })),
  );
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start);
}
async function manualRefresh(page: Page) {
  await Promise.all([
    page.waitForResponse('**/api/v1/groups/' + first.id),
    page.getByRole('button', { name: 'Refresh now', exact: true }).click(),
  ]);
  await page.clock.runFor(100);
  await expect(page.locator('.refresh-main')).toHaveAttribute('aria-busy', 'false');
}
async function changeInterval(page: Page) {
  await page.getByRole('button', { name: 'Refresh interval', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Every minute', exact: true }).click();
  await page.clock.runFor(100);
}

for (const mixed of [true, false]) {
  for (const action of ['interval', 'navigation']) {
    test(`${mixed ? 'mixed errors' : 'rate-limited control'} retain retryAt after ${action}`, async ({
      page,
    }) => {
      await prepareClock(page);
      let requests = 0;
      await page.route('**/api/v1/groups/*', (route) => {
        const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
        const snapshot = groupFixture(id, 2, start.getTime());
        if (id === first.id && ++requests > 1) {
          snapshot.freshness = 'stale';
          snapshot.subgroupErrors = [
            ...(mixed ? [{ subgroupId: first.subgroups[0].id, code: 'unavailable' as const }] : []),
            { subgroupId: first.subgroups.at(-1)!.id, code: 'rate-limited', retryAt },
          ];
        }
        return route.fulfill({ json: snapshot });
      });
      await Promise.all([page.waitForResponse('**/api/v1/groups/' + first.id), page.goto('/')]);
      await page.clock.runFor(100);
      await expect(page.locator('.monitor')).toHaveCount(2);
      const fetchedAt = await page.locator('.refresh-main time').getAttribute('datetime');
      await manualRefresh(page);
      await expect(page.locator('.toast-message')).toContainText('Refresh failed');
      await expect(page.locator('.refresh-main time')).toHaveAttribute('datetime', fetchedAt!);
      await page.clock.fastForward(31_000);
      expect(requests).toBe(2);
      if (action === 'interval') await changeInterval(page);
      else {
        await Promise.all([
          page.waitForResponse('**/api/v1/groups/' + second.id),
          page.locator('.group-tabs').getByRole('tab').nth(1).click(),
        ]);
        await page.clock.runFor(100);
        await Promise.all([
          page.waitForResponse('**/api/v1/groups/' + first.id),
          page.locator('.group-tabs').getByRole('tab').nth(0).click(),
        ]);
        await page.clock.runFor(100);
      }
      // Returning to a group legitimately fetches once; only subsequent polling is deferred.
      const afterRecreation = action === 'interval' ? 2 : 3;
      expect(requests).toBe(afterRecreation);
      await page.clock.fastForward(action === 'interval' ? 61_000 : 31_000);
      expect(requests).toBe(afterRecreation);
      await manualRefresh(page);
      expect(requests).toBe(afterRecreation + 1);
      const remaining = Date.parse(retryAt) - (await page.evaluate(() => Date.now()));
      await page.clock.fastForward(remaining - 1);
      expect(requests).toBe(afterRecreation + 1);
      await page.clock.fastForward(1);
      await expect.poll(() => requests).toBe(afterRecreation + 2);
    });
  }
}

for (const later of ['snapshot', 'error']) {
  test(`scheduler recreation keeps the later ${later} deadline`, async ({ page }) => {
    await prepareClock(page);
    const earlier = '2026-10-30T12:03:00Z';
    let requests = 0;
    await page.route('**/api/v1/groups/' + first.id, (route) => {
      requests++;
      if (requests > 1)
        return route.fulfill({
          status: 503,
          json: { error: { code: 'unavailable', retryAt: later === 'error' ? retryAt : earlier } },
        });
      const snapshot = groupFixture(first.id, 2, start.getTime());
      snapshot.freshness = 'stale';
      snapshot.subgroupErrors = [
        {
          subgroupId: first.subgroups[0].id,
          code: 'rate-limited',
          retryAt: later === 'snapshot' ? retryAt : earlier,
        },
      ];
      return route.fulfill({ json: snapshot });
    });
    await Promise.all([page.waitForResponse('**/api/v1/groups/' + first.id), page.goto('/')]);
    await page.clock.runFor(100);
    await expect(page.locator('.monitor')).toHaveCount(2);
    await manualRefresh(page);
    await changeInterval(page);
    if (later === 'error') {
      await page.clock.fastForward(181_000);
      expect(requests).toBe(2);
    }
    // A later manual failure must not shorten the restored snapshot deadline.
    await manualRefresh(page);
    expect(requests).toBe(3);
    await page.clock.fastForward(181_000);
    expect(requests).toBe(3);
    const remaining = Date.parse(retryAt) - (await page.evaluate(() => Date.now()));
    await page.clock.fastForward(remaining - 1);
    expect(requests).toBe(3);
    await page.clock.fastForward(1);
    await expect.poll(() => requests).toBe(4);
  });
}

for (const replacement of ['shorter', 'none', 'success']) {
  for (const action of ['interval', 'navigation', 'unmount']) {
    if (replacement === 'success' && action !== 'unmount') continue;
    test(`a ${replacement} subsequent refresh retains the known deadline across ${action}`, async ({
      page,
    }) => {
      await prepareClock(page);
      let requests = 0;
      let otherRequests = 0;
      let detailRequests = 0;
      await page.route('**/api/v1/groups/**', (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.includes('/monitors/')) {
          detailRequests++;
          return route.fulfill({ json: detailFixture(first.id, 'm1', '24h', start.getTime()) });
        }
        const id = url.pathname.split('/').at(-1)!;
        const snapshot = groupFixture(id, 2, start.getTime());
        if (id === first.id && ++requests > 1 && !(replacement === 'success' && requests > 2)) {
          snapshot.freshness = 'stale';
          snapshot.subgroupErrors = [
            { subgroupId: first.subgroups[0].id, code: 'unavailable' },
            {
              subgroupId: first.subgroups.at(-1)!.id,
              code: 'rate-limited',
              ...(requests === 2
                ? { retryAt }
                : replacement === 'shorter'
                  ? { retryAt: '2026-10-30T12:03:00Z' }
                  : {}),
            },
          ];
        } else if (id !== first.id) otherRequests++;
        return route.fulfill({ json: snapshot });
      });
      await Promise.all([page.waitForResponse('**/api/v1/groups/' + first.id), page.goto('/')]);
      await page.clock.runFor(100);
      await expect(page.locator('.monitor')).toHaveCount(2);
      await manualRefresh(page);
      await manualRefresh(page);
      expect(requests).toBe(3);
      if (action === 'interval') await changeInterval(page);
      else if (action === 'navigation') {
        await Promise.all([
          page.waitForResponse('**/api/v1/groups/' + second.id),
          page.locator('.group-tabs').getByRole('tab').nth(1).click(),
        ]);
        await page.clock.runFor(100);
        expect(otherRequests).toBe(1);
        // A different group must retain its own normal automatic polling.
        await page.clock.fastForward(31_000);
        await expect.poll(() => otherRequests).toBe(2);
        expect(requests).toBe(3);
        await Promise.all([
          page.waitForResponse('**/api/v1/groups/' + first.id),
          page.locator('.group-tabs').getByRole('tab').nth(0).click(),
        ]);
        await page.clock.runFor(100);
      } else {
        // Let the lazy detail route finish loading before freezing its polling clock.
        await page.clock.resume();
        await Promise.all([
          page.waitForResponse('**/api/v1/groups/' + first.id + '/monitors/m1*'),
          page.getByRole('link', { name: 'Website', exact: true }).click(),
        ]);
        await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
        await page.clock.runFor(100);
        await expect(page.locator('.group-tabs')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Website', exact: true })).toBeVisible();
        expect(detailRequests).toBe(1);
        // The detail identity must poll while the unmounted group's backoff remains known.
        await page.clock.fastForward(31_000);
        await expect.poll(() => detailRequests).toBe(2);
        expect(requests).toBe(3);
        await page.clock.resume();
        if (replacement === 'success') await page.getByRole('link', { name: /Back/ }).click();
        else
          await Promise.all([
            page.waitForResponse('**/api/v1/groups/' + first.id),
            page.getByRole('link', { name: /Back/ }).click(),
          ]);
        await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
        await page.clock.runFor(100);
        await expect(page.locator('.monitor')).toHaveCount(2);
      }
      const afterRecreation = action === 'interval' || replacement === 'success' ? 3 : 4;
      expect(requests).toBe(afterRecreation);
      await page.clock.fastForward(181_000);
      expect(requests).toBe(afterRecreation);
      await manualRefresh(page);
      expect(requests).toBe(afterRecreation + 1);
      const remaining = Date.parse(retryAt) - (await page.evaluate(() => Date.now()));
      await page.clock.fastForward(remaining - 1);
      expect(requests).toBe(afterRecreation + 1);
      await page.clock.fastForward(1);
      await expect.poll(() => requests).toBe(afterRecreation + 2);
      // Once expired, the remembered deadline cannot prevent normal subsequent polling.
      await page.clock.fastForward(action === 'interval' ? 60_000 : 30_000);
      await expect.poll(() => requests).toBe(afterRecreation + 3);
    });
  }
}
