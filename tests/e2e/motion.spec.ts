import {test,expect} from '@playwright/test';
test('scroll chrome follows direction and keeps back-to-top at rest',async({page})=>{
 await page.goto('/?demoCount=50');await expect(page.locator('.monitor')).toHaveCount(50);
 await page.mouse.wheel(0,800);await expect(page.locator('.site-nav')).toHaveAttribute('data-hidden','true');
 await page.mouse.wheel(0,-180);const top=page.getByRole('button',{name:'Back to top'});await expect(top).toBeVisible();
 await page.waitForTimeout(500);await expect(top).toBeVisible();
 await top.click();await expect(top).toBeHidden();
});
test('latest toast replaces old messages and stays clear of back-to-top on a short screen',async({page})=>{
 await page.setViewportSize({width:568,height:320});await page.goto('/?demoCount=30');await expect(page.locator('.monitor')).toHaveCount(30);
 await page.mouse.wheel(0,700);await page.mouse.wheel(0,-150);await expect(page.getByRole('button',{name:'Back to top'})).toBeVisible();
 await page.evaluate(async()=>{const {toastStore}=await import(/* @vite-ignore */ '/src/features/toasts/store.ts' as string);for(let i=0;i<12;i++)toastStore.push(`notice ${i}`,10000)});
 await expect(page.locator('.toast-message').filter({hasText:'notice 11'})).toBeVisible();
 expect(await page.locator('.toast-position:not(.is-exiting)').count()).toBeLessThanOrEqual(3);
 const top=await page.getByRole('button',{name:'Back to top'}).boundingBox();const newest=await page.locator('.toast-position:not(.is-exiting)').last().boundingBox();
 expect(newest!.y+newest!.height).toBeLessThan(top!.y);
 await page.locator('.toast-close').last().click();await expect(page.getByText('notice 0',{exact:true})).toHaveCount(0);
});
test('a first message does not permanently reduce a full viewport to one toast',async({page})=>{
 await page.goto('/');await expect(page.locator('.monitor')).toHaveCount(10);
 await page.getByRole('button',{name:'Refresh now',exact:true}).click();await expect(page.locator('.toast-message')).toHaveCount(1);
 await page.evaluate(async()=>{const {toastStore}=await import(/* @vite-ignore */ '/src/features/toasts/store.ts' as string);for(let i=0;i<12;i++)toastStore.push(`burst ${i}`,10000)});
 await expect(page.locator('.toast-position:not(.is-exiting)')).toHaveCount(5);
 await expect(page.locator('.toast-message').filter({hasText:'burst 11'})).toBeVisible();
});
test('reduced motion and rapid menu, subgroup and route changes leave one live view',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await expect(page.locator('.monitor')).toHaveCount(10);
 await page.getByRole('tab',{name:/Websites/}).click();await page.getByRole('tab',{name:/Infrastructure/}).click();await page.getByRole('tab',{name:/All/}).click();
 await page.getByRole('button',{name:'Language',exact:true}).click();await page.getByRole('button',{name:'Appearance',exact:true}).click();
 await expect(page.getByRole('menu')).toHaveCount(1);await page.keyboard.press('Escape');
 await page.getByRole('link',{name:'Website',exact:true}).click();await page.getByRole('link',{name:/Back/}).click();
 await expect(page.locator('#main')).toHaveCount(1);await expect(page.locator('.monitor')).toHaveCount(10);
});

test('without the transition API navigation works and eviction moves focus to a live control',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(document,'startViewTransition',{value:undefined,configurable:true})});
 await page.goto('/');await expect(page.locator('.monitor')).toHaveCount(10);
 await page.getByRole('button',{name:'Refresh now',exact:true}).click();const close=page.locator('.toast-close').first();await close.focus();
 await page.evaluate(async()=>{const {toastStore}=await import(/* @vite-ignore */ '/src/features/toasts/store.ts' as string);for(let i=0;i<12;i++)toastStore.push(`focus ${i}`,10000)});
 expect(await page.evaluate(()=>document.activeElement?.isConnected&&document.activeElement!==document.body)).toBeTruthy();
 await page.getByRole('link',{name:'Website',exact:true}).click();await expect(page.locator('h1')).toHaveText('Website');
});
