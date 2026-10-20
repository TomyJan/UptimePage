import {test,expect} from '@playwright/test';
test('refresh control combines timestamp and configurable frequency',async({page})=>{
 await page.goto('/');const refresh=page.getByRole('button',{name:'Refresh now',exact:true});
 await expect(refresh.locator('time')).not.toHaveText('—');
 await page.getByRole('button',{name:'Refresh interval',exact:true}).click();
 await page.getByRole('menuitemradio',{name:'Manual only',exact:true}).click();
 await expect(page.locator('.refresh-cycle')).toHaveText('Manual only');
 await refresh.click();await expect(refresh).toBeEnabled();
});
