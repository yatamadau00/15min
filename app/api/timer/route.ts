import {env} from 'cloudflare:workers';
import {getGoogleUser} from '../../auth';
import {transition} from '../../../lib/tracking';
export async function POST(req:Request){
 const u=await getGoogleUser();if(!u)return Response.json({error:'サインインが必要です'},{status:401});
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return new Response(null,{status:403});
 let a:any;try{a=await req.json()}catch{return new Response(null,{status:400})}if(!a||typeof a!=='object'||!['start','pause','reset','select','settle'].includes(a.action)||!Number.isSafeInteger(a.revision)||a.revision<0)return new Response(null,{status:400});
 if((a.title!=null&&(typeof a.title!=='string'||a.title.length>300))||(a.selected!=null&&(typeof a.selected!=='string'||a.selected.length>80)))return new Response(null,{status:400});
 if(a.action==='start'&&!/^[-\w]{1,80}$/.test(a.runId||''))return new Response(null,{status:400});
 const id=u.userId+':shared-timer';const db=env.DB;if(!db)return new Response(null,{status:503});
 const row=await db.prepare('SELECT data FROM planner_items WHERE id=? AND owner=?').bind(id,u.userId).first<{data:string}>();
 const old=row?JSON.parse(row.data):undefined;
 if((old?.revision||0)!==a.revision)return Response.json({error:'別端末で更新されました。再度操作してください。'},{status:409});
 if(a.timezone!==undefined&&a.timezone!=='Asia/Tokyo')return new Response(null,{status:400});
 let result;try{result=transition(old,a.action,Date.now(),a)}catch(e){return Response.json({error:String(e)},{status:400})}
 const condition=old?'EXISTS(SELECT 1 FROM planner_items WHERE id=? AND data=?)':'NOT EXISTS(SELECT 1 FROM planner_items WHERE id=?)';
 const match=old?[id,row!.data]:[id];
 const statements=result.sessions.map(s=>db.prepare('INSERT INTO planner_items(id,owner,data) SELECT ?,?,? WHERE '+condition+' ON CONFLICT(id) DO UPDATE SET data=json_set(excluded.data,\'$.memo\',COALESCE(json_extract(planner_items.data,\'$.memo\'),\'\'),\'$.deleted\',json(CASE WHEN json_extract(planner_items.data,\'$.deleted\') THEN \'true\' ELSE \'false\' END))').bind(u.userId+':'+s.id,u.userId,JSON.stringify(s),...match));
 statements.push(db.prepare('INSERT INTO planner_items(id,owner,data) SELECT ?,?,? WHERE '+condition+' ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(id,u.userId,JSON.stringify(result.timer),...match));
 const responses=await db.batch(statements);
 if(!responses.at(-1)?.meta.changes)return Response.json({error:'別端末で更新されました。再度操作してください。'},{status:409});
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}
