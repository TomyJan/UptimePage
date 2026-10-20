import {test,expect} from '@playwright/test';
test('groups, subgroups, search and history work without nested interactions',async({page})=>{
 await page.goto('/');await expect(page.locator('.monitor')).toHaveCount(10);
 await page.getByRole('tab',{name:/Websites/}).click();await expect(page.locator('.monitor')).toHaveCount(4);
 await page.getByRole('searchbox').fill('website');await expect(page.locator('.monitor')).toHaveCount(1);
 await page.getByRole('tab',{name:/External services/}).click();await expect(page.getByRole('searchbox')).toHaveValue('');
 await expect(page.locator('.monitor')).toHaveCount(10);
 await expect(page.locator('a button,a [tabindex="0"]')).toHaveCount(0);
 await page.locator('.bars').first().focus();await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('tooltip')).toBeVisible();
 await page.setViewportSize({width:320,height:740});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('all services are retained for a large group and partial failure is explicit',async({page})=>{
 await page.goto('/?demoCount=200&demoPartial=1');await expect(page.locator('.monitor')).toHaveCount(200);
 await expect(page.getByText('Some groups are unavailable')).toBeVisible();
});
