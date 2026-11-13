import {test,expect,origin} from './auth-fixture';
test.use({baseURL:origin});
for(const [status,body,message] of [
 [503,'<html>private upstream failure</html>','サーバーに接続できませんでした'],
 [400,'','タイマーを保存できませんでした'],
 [200,'malformed','サーバーから正しい応答を受信できませんでした'],
 [409,'','別の端末で更新されました'],
] as const)test('timer explains non-JSON status '+status,async({page,session})=>{
 expect(session.userId).toBeTruthy();
 await page.goto('/');await expect(page.getByRole('button',{name:'▶ 15分はじめる'})).toBeEnabled();
 let refreshed=false;
 page.on('request',r=>{if(r.url().endsWith('/api/items'))refreshed=true});
 await page.route('**/api/timer',route=>route.fulfill({status,contentType:'text/html',body}));
 await page.getByRole('button',{name:'▶ 15分はじめる'}).click();
 await expect(page.getByRole('alert')).toContainText(message);
 await expect(page.getByRole('alert')).not.toContainText(/SyntaxError|Unexpected|private|<html>/);
 if(status===409)expect(refreshed).toBe(true);
 await expect(page.getByRole('button',{name:'▶ 15分はじめる'})).toBeEnabled();
});
