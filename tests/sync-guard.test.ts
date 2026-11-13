import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSyncGuard} from '../lib/sync-guard.ts';
test('newer reads and writes invalidate old snapshots including failed reads',()=>{
 const guard=createSyncGuard(),old=guard.read(),newer=guard.read();
 assert.equal(guard.accepts(old),false);assert.equal(guard.accepts(newer),true);
 const finish=guard.write();assert.equal(guard.read(),null);assert.equal(guard.accepts(newer),false);
 finish();finish();assert.equal(guard.accepts(newer),false);assert.equal(guard.accepts(guard.read()),true);
});
test('overlapping writes block reads until every write completes',()=>{
 const guard=createSyncGuard(),a=guard.write(),b=guard.write();
 a();a();assert.equal(guard.read(),null);b();assert.equal(guard.accepts(guard.read()),true);
});
