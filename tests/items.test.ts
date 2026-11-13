import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateItem} from '../lib/item-validation.ts';
const item={id:'fixture',kind:'task',title:'Example',date:'',time:'',done:false,priority:'normal'};
test('reserved timer and malformed items are rejected',()=>{for(const change of [{id:'shared-timer'},{id:'../bad'},{title:''},{title:'x'.repeat(301)},{kind:'timer'}, {kind:'session',source:'timer'}])assert.throws(()=>validateItem({...item,...change}));});
test('manual intervals reject invalid ranges and future time',()=>{for(const segments of [[{start:100,end:50}],[{start:0,end:200}],[{start:NaN,end:50}]])assert.throws(()=>validateItem({...item,kind:'session',source:'manual',segments},undefined,100));assert.equal(validateItem({...item,kind:'session',source:'manual',segments:[{start:0,end:60000}]},undefined,60000).minutes,1);});
test('timer-owned intervals cannot be rewritten or changed into tasks',()=>{const old={...item,kind:'session',source:'timer',segments:[{start:1,end:99}],memo:'',deleted:true};const saved=validateItem({...old,segments:[{start:1,end:90}],memo:'note',deleted:false},old);assert.deepEqual(saved.segments,old.segments);assert.equal(saved.deleted,true);assert.equal(saved.memo,'note');assert.throws(()=>validateItem(item,old));});
