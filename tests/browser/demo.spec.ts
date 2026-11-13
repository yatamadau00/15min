import {test,expect} from '@playwright/test';
test('unconfigured production blocks protected routes and spoofed identity',async({request})=>{
 for(const path of ['/','/api/items','/auth/login'])expect((await request.get(path,{headers:{'oai-authenticated-user-id':'fake','oai-authenticated-user-email':'fake@example.test'}})).status()).toBe(503);
});
test('demo timer, review and actual desktop screenshot',async({page})=>{
 const calls:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))calls.push(r.url());});
 await page.goto('/demo');await expect(page.getByRole('button',{name:'▶ 15分はじめる'})).toBeEnabled();
 await expect(page.getByRole('button',{name:'リセット',exact:true})).toHaveCount(0);
 await page.screenshot({path:'docs/screenshots/desktop-record.png',fullPage:true});
 await page.getByRole('button',{name:'▶ 15分はじめる'}).click();
 await expect(page.locator('.digits')).not.toHaveText('15:00',{timeout:5000});
 await page.waitForTimeout(4300);await expect(page.locator('.digits')).not.toHaveText('15:00');
 await page.getByRole('button',{name:'Ⅱ 一時停止'}).click();await expect(page.getByRole('button',{name:'終了',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'終了',exact:true}).click();await expect(page.getByRole('button',{name:'▶ 15分はじめる'})).toBeEnabled();
 await page.getByRole('button',{name:'振り返り',exact:true}).click();await expect(page.getByRole('heading',{name:'1日の実績'})).toBeVisible();
 await page.screenshot({path:'docs/screenshots/desktop-review.png',fullPage:true});expect(calls).toEqual([]);
});
test('mobile initial viewport contains timer controls and focus total',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/demo');const start=page.getByRole('button',{name:'▶ 15分はじめる'});await expect(start).toBeEnabled();
 const box=await start.boundingBox();expect(box!.y+box!.height).toBeLessThan(844);await expect(page.getByText('今日の集中')).toBeVisible();
 await page.screenshot({path:'docs/screenshots/mobile-record.png',fullPage:true});
 await page.getByRole('button',{name:'設定を開く'}).click();await expect(page.getByRole('heading',{name:'設定',exact:true})).toBeVisible();
});
