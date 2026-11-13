// Local-only integration test. Never run against a deployed service.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {globSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
const origin='http://127.0.0.1:8788';
const paths=globSync('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite').filter(p=>!p.endsWith('metadata.sqlite'));
assert.equal(paths.length,1,'Apply local migrations first');
const db=new DatabaseSync(paths[0]);
const tokens=[randomBytes(32).toString('base64url'),randomBytes(32).toString('base64url')];
const users=['google:integration-a','google:integration-b'];
for(let i=0;i<2;i++)db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,?)').run(createHash('sha256').update(tokens[i]).digest('base64url'),users[i],`fixture-${i}@example.test`,'Fictional test user',Date.now()+600000);
const call=(path,method='GET',body,who=0,originHeader=origin)=>fetch(origin+path,{method,headers:{cookie:'15min-session='+tokens[who],...(originHeader?{origin:originHeader}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
try{
 assert.equal((await fetch(origin+'/api/items',{headers:{'oai-authenticated-user-id':users[0],'oai-authenticated-user-email':'fixture@example.test'}})).status,401);
 const item={id:'integration-task',kind:'task',title:'Fictional test task',date:'',time:'',done:false,priority:'normal'};
 assert.equal((await call('/api/items','POST',item)).status,200);
 assert.equal((await call('/api/items','POST',item,0,'https://evil.test')).status,403);
 assert.equal((await call('/api/items?id=integration-task','DELETE',undefined,0,'')).status,403);
 assert.deepEqual(await (await call('/api/items','GET',undefined,1)).json(),[]);
 await call('/api/items?id=integration-task','DELETE',undefined,1);
 assert.equal((await (await call('/api/items')).json()).length,1);
 assert.equal((await call('/api/items','POST',{...item,id:'shared-timer'})).status,400);
 assert.equal((await call('/api/timer','POST',null)).status,400);
 const start=await call('/api/timer','POST',{action:'start',revision:0,runId:'integration-run',title:'研究',selected:'activity-0'});assert.equal(start.status,200);let timer=(await start.json()).timer;
 assert.equal(timer.end-timer.segmentStart,900000);
 assert.equal((await call('/api/timer','POST',{action:'pause',revision:0})).status,409);
 const paused=await call('/api/timer','POST',{action:'pause',revision:timer.revision});assert.equal(paused.status,200);timer=(await paused.json()).timer;
 const concurrent=await Promise.all([call('/api/timer','POST',{action:'start',revision:timer.revision,runId:'next'}),call('/api/timer','POST',{action:'reset',revision:timer.revision})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 assert.deepEqual(await (await call('/api/items','GET',undefined,1)).json(),[]);
 const logout=await fetch(origin+'/auth/logout',{method:'POST',redirect:'manual',headers:{origin,cookie:'15min-session='+tokens[0]}});assert.equal(logout.status,303);
 assert.equal((await call('/api/items')).status,401);
 console.log('PASS: real Worker/D1 authentication, user isolation, CSRF, reserved timer, revision conflict, concurrent update, logout');
}finally{
 for(const user of users){db.prepare('DELETE FROM planner_items WHERE owner=?').run(user);db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(user);}db.close();
}
