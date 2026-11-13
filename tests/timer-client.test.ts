import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServerClock,createSettlementGate} from '../lib/timer-client.ts';

test('server clock advances monotonically and ignores stale or missing samples',()=>{
 let elapsed=10;const clock=createServerClock(()=>elapsed);
 assert.equal(clock.ready(),false);clock.sync(NaN);clock.sync(0);assert.equal(clock.ready(),false);
 clock.sync(100000);assert.equal(clock.now(),100000);
 elapsed+=2500;assert.equal(clock.now(),102500);
 clock.sync(90000);assert.equal(clock.now(),102500);
 clock.sync(102600);elapsed+=500;assert.equal(clock.now(),103100);
});
test('settlement gate deduplicates ticks and polls, backs off, caps retries and recovers',()=>{
 let time=0;const gate=createSettlementGate(()=>time);
 assert.equal(gate.begin(),true);assert.equal(gate.begin(),false);
 gate.finish(false);
 for(time=250;time<4000;time+=250)assert.equal(gate.begin(),false);
 assert.equal(gate.begin(),true);gate.finish(false);
 time=8000;assert.equal(gate.begin(),false);time=12000;assert.equal(gate.begin(),true);gate.finish(false);
 time=28000;assert.equal(gate.begin(),true);gate.finish(false);
 time=60000;assert.equal(gate.begin(),true);gate.finish(false);
 time=119999;assert.equal(gate.begin(),false);time=120000;assert.equal(gate.begin(),true);gate.finish(true);
 assert.equal(gate.begin(),true);gate.finish(false);time+=4000;assert.equal(gate.begin(),true);
});
