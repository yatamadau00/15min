export type Segment={start:number;end:number};
export type RecordItem={id:string;kind:string;title:string;date:string;time:string;done:boolean;priority:string;minutes?:number;segments?:Segment[];source?:string;memo?:string;categoryId?:string;timezone?:string;[key:string]:any};
export function union(segments:Segment[]):Segment[]{const out:Segment[]=[];for(const s of [...segments].filter(s=>s.end>s.start).sort((a,b)=>a.start-b.start)){const last=out.at(-1);if(last&&s.start<=last.end)last.end=Math.max(last.end,s.end);else out.push({...s})}return out}
export function duration(segments:Segment[]){return union(segments).reduce((n,s)=>n+s.end-s.start,0)}
export function clip(segments:Segment[],start:number,end:number){return segments.map(s=>({start:Math.max(start,s.start),end:Math.min(end,s.end)})).filter(s=>s.end>s.start)}
export function gaps(segments:Segment[],start:number,end:number){let cursor=start;const result:Segment[]=[];for(const s of union(clip(segments,start,end))){if(s.start>cursor)result.push({start:cursor,end:s.start});cursor=s.end}if(cursor<end)result.push({start:cursor,end});return result}
export function transition(old:RecordItem|undefined,action:string,now:number,args:any){
 let t:RecordItem=old?{...old}:{id:'shared-timer',kind:'timer',title:'集中タイマー',date:'',time:'',done:false,priority:'normal',selected:'activity-0',revision:0};
 const sessions:RecordItem[]=[];
 const legacy=t.trackingVersion!==2;
 // Preserve an in-flight pre-upgrade run rather than inventing its start time.
 if(legacy&&old&&(t.end||(t.remain>0&&t.remain<900))){
  const deadline=t.end;
  if(deadline&&now>=deadline){
   const stamp=new Date(deadline);
   sessions.push({id:'session-'+(t.runId||('legacy-'+t.revision)),kind:'session',title:args.title||'旧タイマー',date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(stamp),time:stamp.toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}),done:true,priority:'normal',minutes:15,source:'legacy',memo:''});
   t={...t,end:null,remain:0};
  }else if(action==='reset'){t={...t,end:null,remain:900};}
  else {
   if(action==='pause'&&t.end){t.remain=Math.max(0,Math.ceil((t.end-now)/1000));t.end=null;}
   if(action==='start'&&!t.end)t.end=now+t.remain*1000;
   if(action==='select')throw Error('旧タイマーの完了後に分類を変更してください。');
   t.state=t.end?'running':'paused';t.remain=t.end?Math.ceil((t.end-now)/1000):t.remain;t.revision=(old.revision||0)+1;
   return {timer:t,sessions,legacy:false};
  }
 }

 if(legacy){t={...t,legacyTimer:old||null,trackingVersion:2,end:null,remain:900,remainingMs:900000,segments:[],segmentStart:null,runId:'',state:'idle'};}
 function closeSegment(at:number){if(t.segmentStart!=null){t.segments=[...(t.segments||[]),{start:t.segmentStart,end:Math.max(t.segmentStart,at)}];t.segmentStart=null}}
 function record(state:string){if(!t.runId||!t.segments?.length)return;const segs=union(t.segments);sessions.push({id:'session-'+t.runId,kind:'session',title:t.activityTitle||'研究',date:'',time:'',done:true,priority:'normal',segments:segs,minutes:duration(segs)/60000,source:'timer',categoryId:t.selected,timezone:t.timezone||'Asia/Tokyo',memo:'',state});}
 if(t.end&&now>=t.end){closeSegment(t.end);record('completed');t={...t,end:null,remainingMs:0,remain:0,state:'completed'};}
 if(action==='start'&&!t.end){if(t.state!=='paused'){t={...t,segments:[],runId:args.runId,remainingMs:900000,activityTitle:args.title||t.activityTitle,timezone:args.timezone||'Asia/Tokyo'};}t.segmentStart=now;t.end=now+t.remainingMs;t.state='running';}
 if(action==='pause'&&t.end){closeSegment(now);t.remainingMs=Math.max(0,t.end-now);t.end=null;t.state='paused';record('paused');}
 if(action==='reset'){if(t.end){closeSegment(now);record('interrupted')}else if(t.state==='paused')record('interrupted');t={...t,end:null,remainingMs:900000,remain:900,segments:[],segmentStart:null,runId:'',state:'idle'};}
 if(action==='select'){if(t.state==='running'||t.state==='paused')throw Error('進行中の分類は変更できません。リセット後に変更してください。');t.selected=args.selected;t.activityTitle=args.title;}
 t.remain=Math.ceil((t.end?Math.max(0,t.end-now):t.remainingMs??900000)/1000);t.revision=(old?.revision||0)+1;
 return {timer:t,sessions,legacy};
}
