import { test, expect } from '@playwright/test';

test('both privacy entry points work and acknowledgment survives navigation and reload', async ({
  page,
}) => {
  await page.goto('/');
  const notice = page.getByRole('region', { name: 'Cookie & privacy' });
  await expect(notice).toBeVisible();
  await expect(notice.locator('p').getByRole('link', { name: 'Privacy policy' })).toBeVisible();
  await expect(page.locator('.site-footer a').first()).toHaveText('Privacy policy');
  await notice.getByRole('link', { name: 'Privacy policy' }).click();
  await expect(page).toHaveURL(/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible();
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: 'Got it' }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.locator('#main')).toBeFocused();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible();
  await expect(notice).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to status' }).click();
  await expect(page.locator('.monitor')).toHaveCount(10);
  await page.locator('.site-footer').getByRole('link', { name: 'Privacy policy' }).click();
  await expect(page).toHaveURL(/privacy$/);
  await expect(notice).toHaveCount(0);
});

test('page transitions keep the privacy notice visually above the page', async ({ page }) => {
  await page.addInitScript(() => {
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => {
      const current = start(...args);
      Object.assign(window, { privacyTransition: current });
      return current;
    };
  });
  await page.goto('/');
  await expect(page.locator('.monitor')).toHaveCount(10);
  const notice = page.getByRole('region', { name: 'Cookie & privacy' });
  const link = notice.getByRole('link', { name: 'Privacy policy' });
  await link.hover();
  await notice.evaluate((node) =>
    Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
  const box = (await notice.boundingBox())!;
  const before = await page.screenshot({ clip: box });
  await link.click();
  await page.evaluate(async () => {
    const current = (window as unknown as { privacyTransition: ViewTransition }).privacyTransition;
    await current.ready;
    for (const animation of document.getAnimations()) {
      if ((animation.effect as KeyframeEffect).pseudoElement?.includes('view-transition')) {
        animation.pause();
        animation.currentTime = 280;
      }
    }
  });
  const during = await page.screenshot({ clip: box });
  const changedFraction = await page.evaluate(
    async ({ before, during }) => {
      const pixels = async (data: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const a = await pixels(before);
      const b = await pixels(during);
      let changed = 0;
      for (let i = 0; i < a.length; i += 4)
        if (
          Math.max(...[0, 1, 2].map((channel) => Math.abs(a[i + channel]! - b[i + channel]!))) > 24
        )
          changed++;
      return changed / (a.length / 4);
    },
    { before: before.toString('base64'), during: during.toString('base64') },
  );
  await page.evaluate(() => {
    (window as unknown as { privacyTransition: ViewTransition }).privacyTransition.skipTransition();
  });
  expect(changedFraction).toBeLessThan(0.01);
  await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible();
});

test('blocked browser storage does not prevent acknowledging the notice or reading the policy', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible();
  const notice = page.getByRole('region', { name: 'Cookie & privacy' });
  await notice.getByRole('button', { name: 'Got it' }).click();
  await expect(notice).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to status' }).click();
  await expect(page.locator('.monitor')).toHaveCount(10);
  await expect(notice).toHaveCount(0);
});

test('an acknowledgment in another tab dismisses this notice', async ({ page, context }) => {
  await page.goto('/privacy');
  await page.getByRole('button', { name: 'Got it' }).focus();
  const other = await context.newPage();
  await other.goto('/privacy');
  await other.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('region', { name: 'Cookie & privacy' })).toHaveCount(0);
  await expect(page.locator('#main')).toBeFocused();
  await other.close();
});

test('invalid acknowledgment data still shows the notice and it clears after confirmation', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('uptimepage.privacy-notice', 'invalid'));
  await page.goto('/privacy');
  const notice = page.getByRole('region', { name: 'Cookie & privacy' });
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('.privacy-notice')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('uptimepage.privacy-notice'))).toBe('1');
  expect(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--privacy-notice-offset'),
    ),
  ).toBe('');
});

for (const height of [480, 320]) {
  test(`notice leaves room for notifications at height ${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 568, height });
    await page.goto('/?demoCount=50');
    await expect(page.locator('.monitor')).toHaveCount(50);
    await page.mouse.wheel(0, 700);
    await page.mouse.wheel(0, -150);
    const top = page.getByRole('button', { name: 'Back to top' });
    if (height > 400) await expect(top).toBeVisible();
    else await expect(top).toBeHidden();
    await page.evaluate(async () => {
      const { toastStore } = await import(
        /* @vite-ignore */ '/src/features/toasts/store.ts' as string
      );
      toastStore.push('Privacy layout test', 10000);
    });
    const toast = page.locator('.toast-position:not(.is-exiting)').last();
    await expect(toast).toBeVisible();
    const bannerBox = await page.locator('.privacy-notice').boundingBox();
    const toastBox = await toast.boundingBox();
    expect(toastBox!.y + toastBox!.height).toBeLessThan(bannerBox!.y);
    if (height > 400) {
      const topBox = await top.boundingBox();
      expect(topBox!.y + topBox!.height).toBeLessThan(bannerBox!.y);
      expect(toastBox!.y + toastBox!.height).toBeLessThan(topBox!.y);
    }
    await page.evaluate(async () => {
      const { toastStore } = await import(
        /* @vite-ignore */ '/src/features/toasts/store.ts' as string
      );
      for (let i = 0; i < 12; i++) toastStore.push(`Privacy burst ${i}`, 10000);
    });
    await expect(
      page.locator('.toast-message').filter({ hasText: 'Privacy burst 11' }),
    ).toBeVisible();
    await page.waitForTimeout(450);
    await expect
      .poll(async () =>
        page
          .locator('.toast-position:not(.is-exiting)')
          .evaluateAll(
            (nodes) =>
              nodes.length > 0 && nodes.every((node) => node.getBoundingClientRect().top >= 88),
          ),
      )
      .toBe(true);
  });
}

for (const theme of ['light', 'dark']) {
  test(`Chinese privacy notice fits a narrow ${theme} viewport without obscuring controls`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((theme) => {
      localStorage.setItem('uptimepage.preferences', JSON.stringify({ language: 'zh-CN', theme }));
    }, theme);
    await page.goto('/?demoCount=50');
    await expect(page.locator('.monitor')).toHaveCount(50);
    const notice = page.getByRole('region', { name: 'Cookie 与隐私' });
    await expect(notice).toBeVisible();
    const box = await notice.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(8);
    expect(box!.x + box!.width).toBeLessThanOrEqual(312);
    expect(box!.y + box!.height).toBeLessThanOrEqual(640);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await notice.getByRole('link', { name: '隐私政策' }).click();
    await expect(page.getByRole('heading', { name: '隐私政策', level: 1 })).toBeVisible();
    await notice.getByRole('button', { name: '知道了' }).click();
    await expect(notice).toHaveCount(0);
  });
}
