import assert from 'node:assert/strict';
import {createHandler} from './netlify/functions/shared-stats.mjs';

const records=new Map();
const store={
  async *list(){yield {blobs:[...records.keys()].map(key=>({key}))}},
  async set(key,value,{onlyIfNew}={}){if(!onlyIfNew||!records.has(key))records.set(key,value)},
  async delete(key){records.delete(key)}
};
const handle=createHandler(store);
const endpoint='https://example.netlify.app/.netlify/functions/shared-stats';
const call=async(method,body)=>handle(new Request(endpoint,{method,body:body?JSON.stringify(body):undefined,headers:body?{'content-type':'application/json'}:{}}));
const query=async path=>handle(new Request(endpoint+'?path='+encodeURIComponent(path)));
const id='test-1234567890';
let response=await call('POST',{id,row:4,position:'left',color:'blue'});
assert.equal(response.status,200);
await call('POST',{id,row:4,position:'left',color:'blue'});
assert.equal(records.size,1,'retry must not double count');
response=await call('GET');
assert.deepEqual((await response.json()).stats,[{row:4,position:'left',blue:1,count:1}]);
response=await call('POST',{id,row:4,position:'middle',color:'red',previousKey:`r/4/left/blue/${id}`});
assert.equal(response.status,200);
assert.equal(records.size,1,'editing a result must replace the old result');
response=await call('GET');
assert.deepEqual((await response.json()).stats,[{row:4,position:'middle',blue:0,count:1}]);
response=await call('POST',{id,row:100,position:'middle',color:'red'});
assert.equal(response.status,400);
response=await call('POST',{id,row:7,position:'middle',color:'red'});
assert.equal(response.status,400,'seventh-row records are invalid');
response=await call('DELETE',{key:`r/4/middle/red/${id}`});
assert.equal(response.status,200);
response=await call('GET');
assert.equal((await response.json()).total,0);
const sessionA='session-a-1234567890',sessionB='session-b-1234567890',sessionC='session-c-1234567890',sessionD='session-d-1234567890';
const add=async(sessionId,row,position,color)=>{
  const id=`event-${sessionId}-${row}`;
  const result=await call('POST',{id,sessionId,row,position,color});
  assert.equal(result.status,200);
};
await add(sessionA,1,'left','blue');await add(sessionA,2,'middle','blue');await add(sessionA,3,'left','blue');
await add(sessionB,1,'left','blue');await add(sessionB,2,'middle','red');
await add(sessionC,1,'left','red');await add(sessionC,2,'right','blue');
await add(sessionD,1,'right','blue');await add(sessionD,2,'middle','blue');await add(sessionD,3,'right','red');
response=await query('left.blue');
let conditional=(await response.json()).conditional;
assert.equal(conditional.exact.matchedSessions,2);
assert.deepEqual(conditional.exact.stats.find(item=>item.position==='middle'),{row:2,position:'middle',blue:1,count:2});
response=await query('left.blue,middle.blue');
conditional=(await response.json()).conditional;
assert.equal(conditional.exact.matchedSessions,1);
assert.deepEqual(conditional.exact.stats.find(item=>item.position==='left'),{row:3,position:'left',blue:1,count:1});
assert.equal(conditional.previous.matchedSessions,2);
assert.deepEqual(conditional.previous.stats.find(item=>item.position==='right'),{row:3,position:'right',blue:0,count:1});
response=await query('left.blue,invalid');
assert.equal(response.status,400);
const migratedId='migration-1234567890';
await call('POST',{id:migratedId,row:4,position:'left',color:'blue'});
await call('POST',{id:migratedId,sessionId:sessionA,row:4,position:'left',color:'blue',previousKey:`r/4/left/blue/${migratedId}`});
assert.equal([...records.keys()].filter(key=>key.endsWith('/'+migratedId)).length,1,'legacy key migration must not double count');
console.log('Shared statistics: dedupe, edit, validation, aggregate, undo, conditional paths, and migration passed');
