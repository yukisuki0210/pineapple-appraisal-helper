import {getStore} from '@netlify/blobs';

const positions=['left','middle','right'];
const colors=['blue','red'];
const idPattern=/^[a-zA-Z0-9-]{12,80}$/;
const legacyKeyPattern=/^r\/(?:[1-9]|[1-9][0-9])\/(?:left|middle|right)\/(?:blue|red)\/[a-zA-Z0-9-]{12,80}$/;
const sequenceKeyPattern=/^s\/[a-zA-Z0-9-]{12,80}\/[1-6]\/(?:left|middle|right)\/(?:blue|red)\/[a-zA-Z0-9-]{12,80}$/;
const validKey=key=>legacyKeyPattern.test(key)||sequenceKeyPattern.test(key);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const keyOf=entry=>entry.sessionId?`s/${entry.sessionId}/${entry.row}/${entry.position}/${entry.color}/${entry.id}`:`r/${entry.row}/${entry.position}/${entry.color}/${entry.id}`;
const emptyStats=row=>positions.map(position=>({row,position,blue:0,count:0}));
const addRecord=(counts,row,position,color)=>{
  const group=`${row}/${position}`;
  const item=counts.get(group)||{row:Number(row),position,blue:0,count:0};
  item.count++;
  if(color==='blue')item.blue++;
  counts.set(group,item);
};
const parsePath=url=>{
  const raw=url.searchParams.get('path');
  if(!raw)return [];
  const parts=raw.split(',');
  if(parts.length>5||!parts.every(part=>/^(?:left|middle|right)\.(?:blue|red)$/.test(part)))return null;
  return parts.map(part=>{const [position,color]=part.split('.');return {position,color}});
};
const conditionalStats=(sessions,path,mode)=>{
  const row=path.length+1;
  const counts=new Map();
  let matchedSessions=0;
  for(const rows of sessions.values()){
    const matches=mode==='exact'?path.every((step,index)=>rows.get(index+1)?.position===step.position&&rows.get(index+1)?.color===step.color):rows.get(row-1)?.position===path.at(-1).position&&rows.get(row-1)?.color===path.at(-1).color;
    if(!matches)continue;
    matchedSessions++;
    const next=rows.get(row);
    if(next)addRecord(counts,row,next.position,next.color);
  }
  return {matchedSessions,stats:emptyStats(row).map(item=>counts.get(`${row}/${item.position}`)||item)};
};

export function createHandler(store){
  return async request=>{
    if(request.method==='GET'){
      const path=parsePath(new URL(request.url));
      if(path===null)return json({error:'invalid path'},400);
      const counts=new Map();
      const sessions=new Map();
      for await(const page of store.list({paginate:true})){
        for(const {key} of page.blobs){
          if(sequenceKeyPattern.test(key)){
            const [,sessionId,row,position,color]=key.split('/');
            addRecord(counts,row,position,color);
            if(path.length){
              const rows=sessions.get(sessionId)||new Map();
              rows.set(Number(row),{position,color});
              sessions.set(sessionId,rows);
            }
          }else if(legacyKeyPattern.test(key)){
            const [,row,position,color]=key.split('/');
            if(Number(row)<=6)addRecord(counts,row,position,color);
          }
        }
      }
      const stats=[...counts.values()];
      return json({stats,total:stats.reduce((n,item)=>n+item.count,0),conditional:path.length?{
        exact:conditionalStats(sessions,path,'exact'),
        previous:conditionalStats(sessions,path,'previous')
      }:null});
    }
    if(!['POST','DELETE'].includes(request.method))return json({error:'method not allowed'},405);
    if(process.env.CONTEXT&&process.env.CONTEXT!=='production')return json({error:'production only'},403);
    let body;
    try{body=await request.json()}catch{return json({error:'invalid JSON'},400)}
    if(request.method==='DELETE'){
      if(!validKey(body?.key||''))return json({error:'invalid key'},400);
      await store.delete(body.key);
      return json({ok:true});
    }
    const {id,sessionId,row,position,color,previousKey}=body||{};
    if(!idPattern.test(id||'')||sessionId!==undefined&&!idPattern.test(sessionId||'')||!Number.isInteger(row)||row<1||row>6||!positions.includes(position)||!colors.includes(color)||previousKey&&(!validKey(previousKey)||!previousKey.endsWith('/'+id)))return json({error:'invalid record'},400);
    const key=keyOf({id,sessionId,row,position,color});
    await store.set(key,'1',{onlyIfNew:true});
    if(previousKey&&previousKey!==key)await store.delete(previousKey);
    return json({ok:true,key});
  };
}

export default async request=>{
  try{return await createHandler(getStore({name:'appraisal-observations',consistency:'strong'}))(request)}
  catch(error){console.error('shared stats failed',error);return json({error:'shared stats unavailable'},503)}
};
