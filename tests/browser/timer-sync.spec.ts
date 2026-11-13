import {test,expect,origin} from './auth-fixture';
import type {DatabaseSync} from 'node:sqlite';
test.use({baseURL:origin});
function seedTimer(session:{userId:string;db:DatabaseSync}, until=Date.now()+900000) {
 const timer={id:'shared-timer',kind:'timer',title:'集中タイマー',date:'',time:'',done:false,priority:'normal',selected:'activity-0',revision:1,trackingVersion:2,end:until,remain:900,remainingMs:900000,segments:[],segmentStart:until-900000,runId:'clock-fixture',state:'running',activityTitle:'研究',timezone:'Asia/Tokyo'};
 session.db.prepare('INSERT INTO planner_items VALUES(?,?,?)').run(session.userId+':shared-timer',session.userId,JSON.stringify(timer));return timer;
}

test('device wall-clock skew and jumps cannot end a running server timer',async({page,session})=>{
 seedTimer(session);let settles=0;
 page.on('request',r=>{if(r.url().endsWith('/api/timer')&&r.postDataJSON()?.action==='settle')settles++;});
 await page.addInitScript(()=>{const realNow=Date.now;(window as any).testClockOffset=3600000;Date.now=()=>realNow()+(window as any).testClockOffset;});
 await page.goto('/');await expect(page.getByRole('button',{name:'Ⅱ 一時停止'})).toBeEnabled();
 await expect(page.locator('.digits')).toHaveText(/^14:5\d$|^15:00$/);
 await page.evaluate(()=>{(window as any).testClockOffset=-3600000;});
 await page.waitForTimeout(4300);
 await expect(page.locator('.digits')).toHaveText(/^14:5\d$/);
 await expect(page.locator('.focus .notice').filter({hasText:'15分の集中が終了しました。'})).toHaveCount(0);
 expect(settles).toBe(0);
});

test('successful but still-running settle response must not announce completion',async({page,session})=>{
 const timer=seedTimer(session,Date.now()-1000);let settles=0;
 await page.route('**/api/timer',async route=>{
  settles++;await route.fulfill({json:{timer:{...timer,end:Date.now()+60000,revision:2},sessions:[],serverNow:Date.now()}});
 });
 await page.goto('/');await expect.poll(()=>settles).toBe(1);
 await expect(page.getByRole('button',{name:'Ⅱ 一時停止'})).toBeEnabled();
 await expect(page.locator('.focus .notice').filter({hasText:'15分の集中が終了しました。'})).toHaveCount(0);
});

test('failed settlement backs off across both display ticks and synchronization polls',async({page,session})=>{
 seedTimer(session,Date.now()-1000);let attempts=0;
 await page.route('**/api/timer',async route=>{attempts++;await route.fulfill({status:503,json:{error:'Fictional temporary failure'}});});
 await page.goto('/');await expect.poll(()=>attempts).toBe(1);
 await page.waitForTimeout(2500);expect(attempts).toBe(1);
 await expect.poll(()=>attempts,{timeout:3500}).toBe(2);
 await page.waitForTimeout(4500);expect(attempts).toBe(2);
 await expect(page.locator('.focus .notice').filter({hasText:'15分の集中が終了しました。'})).toHaveCount(0);
});

test('revision conflict refreshes immediately and accepts completion by another device',async({page,session})=>{
 const timer=seedTimer(session,Date.now()-1000);let reads=0,attempts=0;
 page.on('request',r=>{if(r.url().endsWith('/api/items'))reads++;});
 await page.route('**/api/timer',async route=>{
  attempts++;session.db.prepare('UPDATE planner_items SET data=? WHERE id=?').run(JSON.stringify({...timer,end:null,state:'completed',remainingMs:0,remain:0,revision:2}),session.userId+':shared-timer');
  await route.fulfill({status:409,json:{error:'Fictional revision conflict'}});
 });
 await page.goto('/');await expect.poll(()=>reads,{timeout:2000}).toBe(2);
 await expect(page.locator('.focus .notice').filter({hasText:'15分の集中が終了しました。'})).toBeVisible();
 await expect(page.getByRole('button',{name:'▶ 15分はじめる'})).toBeEnabled();
 expect(attempts).toBe(1);
});

test('server-confirmed expiry records one completed session and stops settlement',async({page,context,session})=>{
 seedTimer(session,Date.now()+1200);let attempts=0;
 page.on('request',r=>{if(r.url().endsWith('/api/timer')&&r.postDataJSON()?.action==='settle')attempts++;});
 await page.goto('/');await expect(page.locator('.focus .notice').filter({hasText:'15分の集中が終了しました。'})).toBeVisible();
 const rows=await (await context.request.get('/api/items')).json();
 expect(rows.filter((r:any)=>r.kind==='session')).toHaveLength(1);
 expect(rows.find((r:any)=>r.kind==='timer').state).toBe('completed');
 await page.waitForTimeout(4300);expect(attempts).toBe(1);
});
