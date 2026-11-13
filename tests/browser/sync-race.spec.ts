import {test,expect,origin} from './auth-fixture';
test.use({baseURL:origin});
for(const mutation of ['delete','newer read'] as const)test('late snapshot cannot undo '+mutation,async({page,session})=>{
 const item={id:'race-task',kind:'task',title:'架空の同期テスト',date:'',time:'',done:false,priority:'normal'};
 session.db.prepare('INSERT INTO planner_items (id,owner,data) VALUES (?,?,?)').run(session.userId+':'+item.id,session.userId,JSON.stringify(item));
 await page.goto('/');await expect(page.getByRole('button',{name:'▶ 15分はじめる'})).toBeEnabled();
 await page.getByRole('button',{name:'期間なし',exact:true}).click();
 let release!:()=>void, captured!:()=>void;
 const held=new Promise<void>(r=>release=r),started=new Promise<void>(r=>captured=r);let first=true;
 await page.route('**/api/items',async route=>{
  if(route.request().method()!=='GET'||!first){await route.continue();return}
  first=false;const response=await route.fetch();captured();await held;await route.fulfill({response});
 });
 try{
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await started;
  if(mutation==='delete'){
   await page.locator('.item-main').filter({hasText:item.title}).click();
   page.once('dialog',dialog=>dialog.accept());
   await page.getByRole('button',{name:'削除',exact:true}).click();
   await expect(page.locator('.item-main')).toHaveCount(0);
  }else{
   session.db.prepare('UPDATE planner_items SET data=? WHERE id=? AND owner=?').run(JSON.stringify({...item,title:'更新済みの架空タスク'}),session.userId+':'+item.id,session.userId);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await expect(page.locator('.item-main')).toContainText('更新済みの架空タスク');
  }
  const delivered=page.waitForResponse(r=>r.url().endsWith('/api/items'));release();await delivered;
  await page.waitForTimeout(200);
  if(mutation==='delete')await expect(page.locator('.item-main')).toHaveCount(0);
  else await expect(page.locator('.item-main')).toContainText('更新済みの架空タスク');
 }finally{release()}
});
