import {test,expect} from '@playwright/test';
test('detail deep links, ranges and back preserve list selection',async({page})=>{
 await page.goto('/?g=core&s=web&q=website');await page.getByRole('link',{name:'Website',exact:true}).click();
 await expect(page).toHaveURL(/\/services\/core\/m1/);await expect(page.locator('h1')).toHaveText('Website');
 await expect(page.locator('.chart-line')).toHaveCount(2);
 await page.getByRole('button',{name:'7d',exact:true}).click();await page.getByRole('button',{name:'30d',exact:true}).click();
 await expect(page.getByRole('button',{name:'30d',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.reload();await expect(page.locator('h1')).toHaveText('Website');
 await page.getByRole('link',{name:/Back/}).click();await expect(page.getByRole('searchbox')).toHaveValue('website');
 await expect(page.getByRole('tab',{name:/Websites/})).toHaveAttribute('aria-selected','true');
});
test('unknown IDs and unavailable capabilities do not invent data',async({page})=>{
 await page.goto('/services/core/m10');await expect(page.locator('h1')).toHaveText('Backup');
 await expect(page.getByRole('button',{name:'7d',exact:true})).toBeDisabled();
 await expect(page.locator('.detail-metrics')).toContainText('—');
 await page.goto('/services/core/not-public');await expect(page.getByText('Service unavailable')).toBeVisible();
 await expect(page.locator('.detail-metrics')).toHaveCount(0);
});
