import { getGoogleUser } from '../../auth';
import { getDb } from '../../../db';
import { items } from '../../../db/schema';
import { validateItem } from '../../../lib/item-validation';
import { eq, and } from 'drizzle-orm';
export async function GET() {
 const user = await getGoogleUser(); if(!user) return new Response(null,{status:401});
 const rows = await getDb().select().from(items).where(eq(items.owner,user.userId));
 return Response.json(rows.map(row=>JSON.parse(row.data)),{headers:{'Cache-Control':'no-store','X-Server-Time':String(Date.now())}});
}
export async function POST(req:Request) {
 const user = await getGoogleUser(); if(!user) return new Response(null,{status:401});
 let body: any; try {body=await req.json();} catch {return new Response(null,{status:400});}
 if(!body || typeof body.id!=='string' || !/^[-\w]{1,80}$/.test(body.id) || body.id==='shared-timer') return new Response(null,{status:400});
 const id = user.userId+':'+body.id;
 const rows = await getDb().select().from(items).where(and(eq(items.id,id),eq(items.owner,user.userId)));
 let value; try {value=validateItem(body,rows[0]?JSON.parse(rows[0].data):undefined);} catch {return Response.json({error:'入力内容を確認してください'},{status:400});}
 // Timer sessions can only update memo/deletion; never overwrite concurrently added segments.
 if(rows[0] && ['timer','legacy'].includes(JSON.parse(rows[0].data).source)) {
   const {env}=await import('cloudflare:workers');
   await env.DB!.prepare("UPDATE planner_items SET data=json_set(data,'$.memo',?,'$.deleted',json(?)) WHERE id=? AND owner=?").bind(value.memo,JSON.stringify(!!value.deleted),id,user.userId).run();
 } else await getDb().insert(items).values({id,owner:user.userId,data:JSON.stringify(value)}).onConflictDoUpdate({target:items.id,set:{data:JSON.stringify(value)}});
 return Response.json({ok:true});
}
export async function DELETE(req:Request) {
 const user = await getGoogleUser(); if(!user) return new Response(null,{status:401});
 const id = new URL(req.url).searchParams.get('id');
 if(!id || !/^[-\w]{1,80}$/.test(id) || id==='shared-timer') return new Response(null,{status:400});
 const {env}=await import('cloudflare:workers');
 await env.DB!.prepare("DELETE FROM planner_items WHERE id=? AND owner=? AND json_extract(data,'$.kind') IN ('task','event','category')").bind(user.userId+':'+id,user.userId).run();
 return Response.json({ok:true});
}
