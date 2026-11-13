import assert from 'node:assert/strict';
import {test} from 'node:test';
import {timerResponse,ApiResponseError} from '../lib/api-response.ts';
test('HTTP errors never expose HTML, parser errors or internal server messages',async()=>{
 for(const [status,body] of [[503,'<html>private upstream detail</html>'],[400,''],[409,'conflict'],[401,'{}']] as const){
  await assert.rejects(timerResponse(new Response(body,{status})),error=>error instanceof ApiResponseError&&!/html|SyntaxError|private|Unexpected/.test(error.message));
 }
});
test('malformed success responses are explained and valid timer responses are preserved',async()=>{
 for(const body of ['', 'not json','{}','{"timer":{},"sessions":null}'])
  await assert.rejects(timerResponse(new Response(body)),ApiResponseError);
 const value={timer:{state:'running'},sessions:[],serverNow:1};
 assert.deepEqual(await timerResponse(Response.json(value)),value);
});
