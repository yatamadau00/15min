'use client';
import {useState,useEffect,useRef} from 'react';
import ActivityLog from './activity-log';
import {createDemoTransport} from '../lib/demo';
import {createServerClock,createSettlementGate} from '../lib/timer-client';
import {duration,clip,type Segment} from '../lib/tracking';
type Item={id:string;kind:'task'|'event'|'session'|'timer'|'category';title:string;date:string;time:string;done:boolean;priority:string;minutes?:number;end?:number|null;remain?:number;selected?:string;revision?:number;categoryId?:string;runId?:string;segments?:Segment[];source?:string;memo?:string;timezone?:string;state?:string;trackingVersion?:number;[key:string]:any};
const day=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const defaultCategories:Item[]=['研究','就活','授業','バイト','家事','休憩'].map((title,i)=>({id:'activity-'+i,kind:'category',title,date:'',time:'',done:false,priority:'normal'}));
const empty=():Item=>({id:crypto.randomUUID(),kind:'task',title:'',date:day(),time:'',done:false,priority:'normal'});
export default function Planner({demo=false}:{demo?:boolean}){
 const [transport]=useState(()=>demo?createDemoTransport():fetch);
 const [view,setView]=useState('record');
 const [data,setData]=useState<Item[]>([]),[date,setDate]=useState(''),[mode,setMode]=useState('today'),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [selected,setSelected]=useState('activity-0'),[remain,setRemain]=useState(900),[end,setEnd]=useState<number|null>(null),[ready,setReady]=useState(false),[notice,setNotice]=useState(''),[editor,setEditor]=useState<Item|null>(null),[showDone,setShowDone]=useState(false),[categoryFilter,setCategoryFilter]=useState(''),[newCategory,setNewCategory]=useState('');
 const currentTimer=useRef<Item|null>(null),actionLock=useRef(false);
 const settings=useRef<HTMLDialogElement|null>(null);
 const audio=useRef<AudioContext|null>(null),timerRevision=useRef(0),notifiedRun=useRef('');
 const [serverClock]=useState(()=>createServerClock());
 const [settlementGate]=useState(()=>createSettlementGate());

 function announceCompletion(t:Item){
  if(t.state!=='completed'||!t.runId||notifiedRun.current===t.runId)return;
  notifiedRun.current=t.runId;setNotice('15分の集中が終了しました。');
  try{if(audio.current){const o=audio.current.createOscillator(),g=audio.current.createGain();o.connect(g);g.connect(audio.current.destination);g.gain.value=.15;o.frequency.value=660;o.start();o.stop(audio.current.currentTime+.35)}if('Notification'in window&&Notification.permission==='granted')new Notification('15分、おつかれさま！',{body:'集中タイマーが終了しました。'})}catch{}
 }
 function adopt(t:Item){
  if((t.revision||0)<timerRevision.current)return;
  const previous=currentTimer.current;
  currentTimer.current=t;timerRevision.current=t.revision||0;setEnd(t.end??null);
  setRemain(t.end?Math.max(0,Math.ceil((t.end-serverClock.now())/1000)):Math.ceil((t.remainingMs??(t.remain??900)*1000)/1000));setSelected(t.selected||'activity-0');
  if(previous?.state==='running'&&previous.runId===t.runId)announceCompletion(t);
 }
 async function settleTimer(){
  const t=currentTimer.current;
  if(!t||!serverClock.ready()||actionLock.current)return;
  const legacyIdle=t.trackingVersion!==2&&!t.end&&!((t.remain??900)>0&&(t.remain??900)<900);
  if(!legacyIdle&&(!t.end||t.end>serverClock.now()))return;
  if(!settlementGate.begin())return;
  const result=await timerAction('settle');
  settlementGate.finish(!!result&&result.timer.state!=='running');
 }
 async function refresh(allowSettle=true){
  try{const r=await transport('/api/items');if(!r.ok)throw Error();const rows:Item[]=await r.json();
   serverClock.sync(Number(r.headers.get('X-Server-Time')??NaN));
   setData(rows.filter(x=>x.kind!=='timer'));const t=rows.find(x=>x.kind==='timer');if(t)adopt(t);setError('');if(allowSettle)await settleTimer();
  }catch{setError('読み込みに失敗しました。通信を確認して再読み込みしてください。')}finally{setLoading(false)}
 }
 useEffect(()=>{setDate(day());refresh();setReady(true);const h=()=>refresh();window.addEventListener('focus',h);const poll=setInterval(refresh,4000);return()=>{window.removeEventListener('focus',h);clearInterval(poll)}},[]);
 async function timerAction(action:string,selectedId=selected):Promise<{timer:Item;sessions:Item[];legacy?:boolean}|null>{
  if(actionLock.current)return null;actionLock.current=true;setBusy(true);
  try{const title=[...defaultCategories,...data].find(x=>x.id===selectedId)?.title||'研究';
   const r=await transport('/api/timer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,revision:timerRevision.current,selected:selectedId,title,runId:crypto.randomUUID(),timezone:'Asia/Tokyo'})});
   const result:any=await r.json();
   if(r.status===409){await refresh(false);if(action==='settle'&&currentTimer.current?.state==='completed')return {timer:currentTimer.current,sessions:[]};}
   if(!r.ok)throw Error(result.error||'タイマーを保存できませんでした');
   serverClock.sync(result.serverNow);
   adopt(result.timer);setData(rows=>{let next=[...rows];for(const x of result.sessions||[])next=[...next.filter(y=>y.id!==x.id),x];return next});
   if(result.legacy&&currentTimer.current?.state==='idle')setNotice('以前のタイマー状態を更新しました。新しい計測を開始できます。旧記録は保持しています。');
   setError('');return result;
  }catch(e){setError(String(e));return null}finally{actionLock.current=false;setBusy(false)}
 }
 async function save(x:Item){setBusy(true);try{const r=await transport('/api/items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(x)});if(!r.ok)throw Error();if(x.kind!=='timer')setData(a=>[...a.filter(t=>t.id!==x.id),x]);setError('');return true}catch{setError('保存できませんでした。入力内容はそのままです。再度お試しください。');return false}finally{setBusy(false)}}

 useEffect(()=>{
  if(!end)return;
  const tick=()=>{setRemain(Math.max(0,Math.ceil((end-serverClock.now())/1000)));void settleTimer();};
  tick();const interval=setInterval(tick,250);return()=>clearInterval(interval);
 },[end]);
 function start(){setNotice('');try{audio.current??=new AudioContext();audio.current.resume()}catch{}timerAction('start')}
 function pause(){timerAction('pause')}
 function reset(){setNotice('');timerAction('reset')}
 async function notify(){if(!('Notification'in window)){setNotice('このブラウザでは通知に対応していません。');return}const p=await Notification.requestPermission();setNotice(p==='granted'?'通知を有効にしました。':'通知は無効です。画面内で終了をお知らせします。')}
 async function remove(x:Item){if(!confirm(`「${x.title}」を削除しますか？`))return;try{const r=await transport('/api/items?id='+encodeURIComponent(x.id),{method:'DELETE'});if(!r.ok)throw Error();setData(a=>a.filter(t=>t.id!==x.id));setEditor(null)}catch{setError('削除できませんでした')}}
 const categories=[...defaultCategories,...data.filter(x=>x.kind==='category')];
 const tasks=data.filter(x=>x.kind==='task'),sessions=data.filter(x=>x.kind==='session'&&x.date===day()),active=categories.find(x=>x.id===selected);
 const filtered=data.filter(x=>x.kind!=='session'&&x.kind!=='timer'&&x.kind!=='category'&&(!categoryFilter||x.categoryId===categoryFilter)&&(showDone||!x.done)&&(mode==='all'||(mode==='undated'?!x.date:mode==='today'?x.date===date:!!x.date&&x.date>=date&&x.date<day(new Date(new Date(date+'T00:00').getTime()+7*86400000))))).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)||Number(b.priority==='high')-Number(a.priority==='high'));
 const overdue=tasks.filter(x=>!x.done&&x.date&&x.date<day());
 return <main>{demo&&<div className="demo-banner">デモ · 架空データ / 操作内容は保存されません <a href="/">ログイン画面へ</a></div>}<header><a className="brand" href={demo?"/demo":"/"}>◷ <span>PAU <small>FOCUS & PLAN</small></span></a><nav className="view-switch" aria-label="画面切り替え"><button className={view==='record'?'selected':''} aria-pressed={view==='record'} onClick={()=>setView('record')}>記録</button><button className={view==='review'?'selected':''} aria-pressed={view==='review'} onClick={()=>setView('review')}>振り返り</button></nav><div className="summary-bar"><b>{new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'short'}).format(new Date())}</b><span>今日の集中 <strong>{Math.round(duration(data.filter(x=>x.kind==='session'&&!x.deleted&&x.source==='timer').flatMap(x=>clip(x.segments||[],Date.parse(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())+'T00:00:00+09:00'),Date.now())))/6000)/10}</strong> 分</span></div><button className="settings-button" aria-label="設定を開く" title="設定" onClick={()=>settings.current?.showModal()}>⚙</button></header>
 <div className="workspace" style={{display:view==='record'?undefined:'none'}}><section className="focus"><h1 className="sr-only">15分タイマー</h1><label className="sr-only" htmlFor="target">活動分類</label><select id="target" value={selected} disabled={!!end||currentTimer.current?.state==='paused'||loading||busy} onChange={e=>timerAction('select',e.target.value)}>{categories.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select><div className={'clock '+(end?'running':'')} style={{'--progress':`${(900-remain)/900*360}deg`} as React.CSSProperties}><div><span className="digits" aria-label={`残り${Math.floor(remain/60)}分${remain%60}秒`}>{loading?'—':String(Math.floor(remain/60)).padStart(2,'0')}<em>:</em>{loading?'—':String(remain%60).padStart(2,'0')}</span></div></div><div className="timer-actions"><button className="primary" disabled={loading||busy} onClick={end?pause:start}>{end?'Ⅱ 一時停止':currentTimer.current?.state==='paused'?'▶ 再開する':'▶ 15分はじめる'}</button>{(!!end||currentTimer.current?.state==='paused')&&<button className="secondary" disabled={loading||busy} onClick={reset}>{currentTimer.current?.state==='paused'?'終了':'リセット'}</button>}</div>{notice&&<p role="status" className="notice">{notice}</p>}</section>
 <section className="plan"><div className="section-top"><span>個別タスク・予定</span><button className="add" onClick={()=>setEditor(empty())}>＋ 追加</button></div><div className="tabs">{[['today','今日'],['week','1週間'],['undated','期間なし'],['all','すべて']].map(([v,l])=><button key={v} className={mode===v?'chosen':''} onClick={()=>setMode(v)}>{l}</button>)}</div><div className="category-filter"><label htmlFor="category-filter">分類</label><select id="category-filter" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">すべての分類</option>{categories.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></div><div className="filters">{(mode==='today'||mode==='week')&&<input aria-label="表示開始日" type="date" value={date} onChange={e=>setDate(e.target.value)}/>}<label><input type="checkbox" checked={showDone} onChange={e=>setShowDone(e.target.checked)}/> 完了も表示</label></div>{overdue.length>0&&<button className="overdue" onClick={()=>setMode('all')}>期限を過ぎたタスク {overdue.length} 件 →</button>}{error&&<div role="alert" className="error">{error}<button onClick={()=>refresh()}>再読み込み</button></div>}<div className="items">{loading?<p className="empty">予定を読み込み中…</p>:filtered.length===0?<div className="empty"><div>✦</div><h3>予定・タスクはありません</h3><button onClick={()=>setEditor(empty())}>最初のひとつを追加 →</button></div>:filtered.map(x=><article key={x.id} className={'item '+(x.done?'done':'')}><button className="check" disabled={busy} aria-label={x.done?'未完了に戻す':'完了にする'} onClick={()=>save({...x,done:!x.done})}>{x.done?'✓':x.kind==='event'?'◷':''}</button><button className="item-main" onClick={()=>setEditor({...x})}><span className="item-meta">{x.kind==='event'?'予定':'タスク'} {x.date||'期限なし'} {x.time} {x.priority==='high'&&'・ 優先'}</span>{x.categoryId&&<span className="category-badge">{categories.find(c=>c.id===x.categoryId)?.title||'未分類'}</span>}<b>{x.title}</b></button></article>)}</div><footer className="plan-footer">{demo?'架空データ · この画面内だけのデモ':'☁ 予定・タスクはアカウントに保存'}<br/><span>外部カレンダーとは未連携・時刻は端末の現地時間</span></footer></section></div>
 <div hidden={view!=='review'}>{ready&&<ActivityLog records={data} categories={categories} save={save} busy={busy}/>}</div>
 <dialog ref={settings} className="settings-dialog" aria-labelledby="settings-title"><div className="modal-top"><h2 id="settings-title">設定</h2><button type="button" aria-label="設定を閉じる" onClick={()=>settings.current?.close()}>×</button></div><section className="settings-section"><h3>分類を追加</h3><div className="new-category"><input aria-label="活動分類名" maxLength={60} placeholder="例：運動" value={newCategory} onChange={e=>setNewCategory(e.target.value)}/><button type="button" disabled={busy||!newCategory.trim()} onClick={async()=>{const name=newCategory.trim();const existing=categories.find(c=>c.title===name);if(existing){setNotice('この分類はすでにあります。');return}if(await save({...empty(),kind:'category',title:name,date:''}))setNewCategory('')}}>追加</button></div></section><section className="settings-section"><h3>通知・同期</h3>{!demo&&<form action="/auth/logout" method="post"><button type="submit">ログアウト</button></form>}<button onClick={notify}>終了通知を有効にする ↗</button><p>タイマーは約4秒ごとに端末間で同期します。画面ロック・タブを閉じた状態の通知は保証されません。</p></section>{notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}</dialog>
 {editor&&<div className="modal" onClick={e=>{if(e.target===e.currentTarget&&!busy)setEditor(null)}}><form onSubmit={async e=>{e.preventDefault();if(await save({...editor,title:editor.title.trim()}))setEditor(null)}}><div className="modal-top"><h2>{data.some(x=>x.id===editor.id)?'予定・タスクを編集':'予定・タスクを追加'}</h2><button type="button" aria-label="閉じる" onClick={()=>setEditor(null)}>×</button></div><label>種類<select value={editor.kind} onChange={e=>setEditor({...editor,kind:e.target.value as Item['kind']})}><option value="task">タスク</option><option value="event">予定</option></select></label><label>タイトル<input autoFocus required maxLength={300} value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})} placeholder="例：関連研究を1本読む"/></label><div className="form-grid"><label>日付（任意）<input type="date" value={editor.date} onChange={e=>setEditor({...editor,date:e.target.value})}/></label><label>時刻（任意）<input type="time" value={editor.time} onChange={e=>setEditor({...editor,time:e.target.value})}/></label></div><label>分類<select value={editor.categoryId||''} onChange={e=>setEditor({...editor,categoryId:e.target.value})}><option value="">未分類</option>{categories.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><div className="new-category"><input aria-label="新しい分類名" maxLength={60} placeholder="新しい分類名" value={newCategory} onChange={e=>setNewCategory(e.target.value)}/><button type="button" disabled={busy||!newCategory.trim()} onClick={async()=>{const name=newCategory.trim();const existing=categories.find(c=>c.title===name);if(existing){setEditor({...editor,categoryId:existing.id});setNewCategory('');return}const c={...empty(),kind:'category' as const,title:name,date:''};if(await save(c)){setEditor({...editor,categoryId:c.id});setNewCategory('')}}}>分類を追加</button></div><label>優先度<select value={editor.priority} onChange={e=>setEditor({...editor,priority:e.target.value})}><option value="normal">通常</option><option value="high">優先</option></select></label>{error&&<p className="error">{error}</p>}<div className="modal-actions">{data.some(x=>x.id===editor.id)&&<button type="button" onClick={()=>remove(editor)} className="delete">削除</button>}<button className="primary" disabled={busy}>{busy?'保存中…':'保存する'}</button></div></form></div>}
 </main>
}
