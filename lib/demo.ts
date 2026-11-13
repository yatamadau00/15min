import {transition, type RecordItem} from './tracking';
// Fictional fixtures only. This transport never reads or writes server data.
export function createDemoTransport() {
 const now=Date.now(), date=new Intl.DateTimeFormat('sv-SE').format(new Date());
 let rows:RecordItem[]=[
  {id:'demo-task',kind:'task',title:'参考文献を1本読む',date,time:'',done:false,priority:'high',categoryId:'activity-0'},
  {id:'demo-event',kind:'event',title:'サンプルゼミ',date,time:'14:00',done:false,priority:'normal',categoryId:'activity-2'},
  {id:'demo-task-2',kind:'task',title:'買い物リストをまとめる',date,time:'',done:false,priority:'normal',categoryId:'activity-4'},
  {id:'demo-session-1',kind:'session',title:'研究',date:'',time:'',done:true,priority:'normal',categoryId:'activity-0',source:'timer',segments:[{start:now-5400000,end:now-4500000}],memo:'サンプル：要点を整理した。'},
  {id:'demo-session-2',kind:'session',title:'サンプル授業',date:'',time:'',done:true,priority:'normal',categoryId:'activity-2',source:'manual',segments:[{start:now-4200000,end:now-600000}],memo:''},
 ];
 return async (url:string, options?:RequestInit):Promise<Response>=>{
   if(url==='/api/timer') {
    const args=JSON.parse(String(options?.body));const old=rows.find(r=>r.kind==='timer');
    const result=transition(old,args.action,Date.now(),args);
    for(const r of [result.timer,...result.sessions]) rows=[...rows.filter(x=>x.id!==r.id),r];
    return Response.json({...result,serverNow:Date.now()});
   }
   if(options?.method==='POST') {const value=JSON.parse(String(options.body));rows=[...rows.filter(r=>r.id!==value.id),value];return Response.json({ok:true});}
   if(options?.method==='DELETE') {const id=new URL(url,'https://demo.invalid').searchParams.get('id');rows=rows.filter(r=>r.id!==id);return Response.json({ok:true});}
   return Response.json(rows,{headers:{'X-Server-Time':String(Date.now())}});
 };
}
