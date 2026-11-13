import {test, expect, origin} from './auth-fixture';
test.use({baseURL: origin});

test('browser logout sends same-origin POST, removes cookie and revokes session', async ({page, context, session}) => {
  await page.goto('/');
  await expect(page.getByRole('button', {name: '▶ 15分はじめる'})).toBeEnabled();
  const before = (await context.cookies()).find(c => c.name === '15min-session')!;
  await page.getByRole('button', {name: '設定を開く'}).click();
  const responsePromise = page.waitForResponse(r => r.url().endsWith('/auth/logout'));
  await page.getByRole('button', {name: 'ログアウト', exact: true}).click();
  const response = await responsePromise;
  expect(response.status()).toBe(303);
  expect((await response.request().allHeaders()).origin).toBe(origin);
  await expect(page.getByRole('link', {name: 'Googleでログイン'})).toBeVisible();
  expect((await context.cookies()).some(c => c.name === '15min-session')).toBe(false);
  expect(session.db.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=?').get(session.userId)?.n).toBe(0);
  // Even a copied, previously valid cookie can no longer access records.
  expect((await context.request.get('/api/items', {headers: {cookie: '15min-session=' + before.value}})).status()).toBe(401);
});

test('logout still rejects missing, null and foreign origins', async ({context, session}) => {
  for (const headers of [{}, {origin: 'null'}, {origin: 'https://evil.test'}] as Record<string, string>[]) {
    expect((await context.request.post('/auth/logout', {headers, maxRedirects: 0})).status()).toBe(403);
  }
  expect(session.db.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=?').get(session.userId)?.n).toBe(1);
});

test('paused then ended timer permits memo editing after server reload and preserves deletion', async ({page, context, session}) => {
  await page.goto('/');
  await page.getByRole('button', {name: '▶ 15分はじめる'}).click();
  await page.getByRole('button', {name: 'Ⅱ 一時停止'}).click();
  await page.getByRole('button', {name: '終了', exact: true}).click();
  await expect(page.getByRole('button', {name: '▶ 15分はじめる'})).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('button', {name: '▶ 15分はじめる'})).toBeEnabled();
  const before = (await (await context.request.get('/api/items')).json()).find((r: any) => r.kind === 'session');
  expect(before.deleted).toBe(false);
  await page.getByRole('button', {name: '振り返り', exact: true}).click();
  await page.locator('.log-record').click();
  await page.getByLabel('メモ（任意）').fill('架空の実績メモ');
  await page.getByRole('button', {name: '保存', exact: true}).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const edited = (await (await context.request.get('/api/items')).json()).find((r: any) => r.id === before.id);
  expect(edited.memo).toBe('架空の実績メモ');
  expect(edited.segments).toEqual(before.segments);
  await page.locator('.log-record').click();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', {name: '消去', exact: true}).click();
  await expect(page.locator('.log-record')).toHaveCount(0);
  const row = session.db.prepare('SELECT data FROM planner_items WHERE id=?').get(session.userId + ':' + before.id);
  expect(JSON.parse(String(row?.data)).deleted).toBe(true);
});

test('existing numeric deleted flag remains editable', async ({page, context, session}) => {
  const record = {id:'legacy-flag',kind:'session',title:'架空の旧形式実績',date:'',time:'',done:true,priority:'normal',source:'timer',categoryId:'activity-0',segments:[{start:Date.now()-60000,end:Date.now()-1000}],deleted:0,memo:''};
  session.db.prepare('INSERT INTO planner_items VALUES(?,?,?)').run(session.userId+':'+record.id,session.userId,JSON.stringify(record));
  await page.goto('/');
  await expect(page.getByRole('button',{name:'▶ 15分はじめる'})).toBeEnabled();
  await page.getByRole('button',{name:'振り返り',exact:true}).click();
  await page.locator('.log-record').click();
  await page.getByLabel('メモ（任意）').fill('互換性テスト');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const saved=(await (await context.request.get('/api/items')).json()).find((r:any)=>r.id===record.id);
  expect(saved.memo).toBe('互換性テスト');expect(saved.deleted).toBe(false);expect(saved.segments).toEqual(record.segments);
});

test('task category can be cleared to uncategorized through the editor', async ({page, context, session}) => {
  expect(session.userId).toMatch(/^google:/);
  const task={id:'category-fixture',kind:'task',title:'架空の分類変更タスク',date:'',time:'',done:false,priority:'normal',categoryId:'activity-0'};
  expect((await context.request.post('/api/items',{headers:{origin},data:task})).status()).toBe(200);
  await page.goto('/');await expect(page.getByRole('button',{name:'▶ 15分はじめる'})).toBeEnabled();await page.getByRole('button',{name:'期間なし',exact:true}).click();
  await page.locator('.item-main').filter({hasText:task.title}).click();
  await page.locator('.modal form').getByRole('combobox').nth(1).selectOption('');
  await page.getByRole('button',{name:'保存する',exact:true}).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const saved=(await (await context.request.get('/api/items')).json()).find((r:any)=>r.id===task.id);
  expect(saved.categoryId).toBeUndefined();expect(saved.title).toBe(task.title);
});

test('resuming and ending a timer preserves its saved memo and deletion flag', async ({context, session}) => {
  expect(session.userId).toMatch(/^google:/);
  let revision=0;
  const action=async (action:string)=>{
    const r=await context.request.post('/api/timer',{headers:{origin},data:{action,revision,runId:'preserve-fixture',title:'研究',selected:'activity-0'}});
    expect(r.status()).toBe(200);const result=await r.json();revision=result.timer.revision;return result;
  };
  await action('start');await action('pause');
  const record=(await (await context.request.get('/api/items')).json()).find((r:any)=>r.kind==='session');
  expect((await context.request.post('/api/items',{headers:{origin},data:{...record,memo:'維持する架空メモ',deleted:true}})).status()).toBe(200);
  await action('start');await action('pause');await action('reset');
  const saved=(await (await context.request.get('/api/items')).json()).find((r:any)=>r.id===record.id);
  expect(saved.memo).toBe('維持する架空メモ');expect(saved.deleted).toBe(true);
});

test('hundreds of timer intervals can be edited and deleted without sending intervals',async({page,context,session})=>{
 const now=Date.now();const segments=Array.from({length:500},(_,i)=>({start:now-1100000+i*2000,end:now-1099000+i*2000}));
 const record={id:'many-intervals',kind:'session',title:'架空の多区間実績',date:'',time:'',done:true,priority:'normal',source:'timer',categoryId:'activity-0',segments,memo:'',deleted:false};
 session.db.prepare('INSERT INTO planner_items VALUES(?,?,?)').run(session.userId+':'+record.id,session.userId,JSON.stringify(record));
 const writes:any[]=[];page.on('request',r=>{if(r.url().endsWith('/api/items')&&r.method()==='POST')writes.push(r.postDataJSON());});
 await page.goto('/');await expect(page.getByRole('button',{name:'▶ 15分はじめる'})).toBeEnabled();
 await page.getByRole('button',{name:'振り返り',exact:true}).click();await page.locator('.log-record').click();
 await page.getByLabel('メモ（任意）').fill('多区間でも保存できる');await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.locator('.modal')).toHaveCount(0);
 let saved=(await (await context.request.get('/api/items')).json()).find((r:any)=>r.id===record.id);
 expect(saved.segments).toEqual(segments);expect(saved.memo).toBe('多区間でも保存できる');
 await page.locator('.log-record').click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'消去',exact:true}).click();
 await expect(page.locator('.log-record')).toHaveCount(0);
 saved=(await (await context.request.get('/api/items')).json()).find((r:any)=>r.id===record.id);
 expect(saved.deleted).toBe(true);expect(saved.segments).toEqual(segments);
 expect(writes).toHaveLength(2);for(const payload of writes){expect(payload.segments).toBeUndefined();expect(JSON.stringify(payload).length).toBeLessThan(300);}
});
