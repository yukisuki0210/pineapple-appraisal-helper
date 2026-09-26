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
response=await call('DELETE',{key:`r/4/middle/red/${id}`});
assert.equal(response.status,200);
response=await call('GET');
assert.equal((await response.json()).total,0);
console.log('Shared statistics: dedupe, edit, validation, aggregate, undo passed');
