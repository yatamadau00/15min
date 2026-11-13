import assert from 'node:assert/strict';
import {test} from 'node:test';
import {itemPayload} from '../lib/item-payload.ts';
import {validateItem} from '../lib/item-validation.ts';
const item={id:'fixture',kind:'task',title:'Example',date:'',time:'',done:false,priority:'normal'};
test('reserved timer and malformed items are rejected',()=>{for(const change of [{id:'shared-timer'},{id:'../bad'},{title:''},{title:'x'.repeat(301)},{kind:'timer'}, {kind:'session',source:'timer'}])assert.throws(()=>validateItem({...item,...change}));});
test('manual intervals reject invalid ranges and future time',()=>{for(const segments of [[{start:100,end:50}],[{start:0,end:200}],[{start:NaN,end:50}]])assert.throws(()=>validateItem({...item,kind:'session',source:'manual',segments},undefined,100));assert.equal(validateItem({...item,kind:'session',source:'manual',segments:[{start:0,end:60000}]},undefined,60000).minutes,1);});
test('timer-owned intervals cannot be rewritten or changed into tasks',()=>{const old={...item,kind:'session',source:'timer',segments:[{start:1,end:99}],memo:'',deleted:true};const saved=validateItem({...old,segments:[{start:1,end:90}],memo:'note',deleted:false},old);assert.deepEqual(saved.segments,old.segments);assert.equal(saved.deleted,true);assert.equal(saved.memo,'note');assert.throws(()=>validateItem(item,old));});

test('uncategorized tasks normalize an empty selection without accepting invalid IDs',()=>{
 assert.equal(validateItem({...item,categoryId:''}).categoryId,undefined);
 assert.equal(validateItem({...item,categoryId:'activity-0'}).categoryId,'activity-0');
 for(const categoryId of ['../invalid',123,null])assert.throws(()=>validateItem({...item,categoryId}));
});
test('legacy SQLite boolean values are accepted narrowly for record editing',()=>{
 const old={...item,kind:'session',source:'timer',segments:[{start:0,end:100}],deleted:0};
 assert.equal(validateItem({...old,memo:'note'},old).deleted,false);
 assert.equal(validateItem({...old,deleted:1},old).deleted,true);
 assert.equal(validateItem({...old,deleted:0},{...old,deleted:1}).deleted,true);
 for(const deleted of ['false',2,null])assert.throws(()=>validateItem({...old,deleted},old));
});

test('server-owned records with hundreds of intervals use small validated patches',()=>{
 const segments=Array.from({length:500},(_,i)=>({start:i*2000,end:i*2000+1000}));
 const old={...item,kind:'session',source:'timer',segments,memo:'before',deleted:false};
 const payload=itemPayload({...old,memo:'after'});
 assert.ok(JSON.stringify(payload).length<300);assert.equal('segments' in payload,false);
 const saved=validateItem(payload,old);assert.deepEqual(saved.segments,segments);assert.equal(saved.memo,'after');
 assert.equal(validateItem({...payload,deleted:true},old).deleted,true);
 assert.throws(()=>validateItem({...payload,memo:'x'.repeat(2001)},old));
 assert.throws(()=>validateItem({...payload,id:'other'},old));
 assert.throws(()=>validateItem(payload));
 assert.throws(()=>validateItem({...old,source:'manual'}));
});
