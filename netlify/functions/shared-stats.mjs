import {getStore} from '@netlify/blobs';

const positions=['left','middle','right'];
const colors=['blue','red'];
const idPattern=/^[a-zA-Z0-9-]{12,80}$/;
const keyPattern=/^r\/(?:[1-9]|[1-9][0-9])\/(?:left|middle|right)\/(?:blue|red)\/[a-zA-Z0-9-]{12,80}$/;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const keyOf=entry=>`r/${entry.row}/${entry.position}/${entry.color}/${entry.id}`;

export function createHandler(store){
  return async request=>{
    if(request.method==='GET'){
      const counts=new Map();
      for await(const page of store.list({prefix:'r/',paginate:true})){
        for(const {key} of page.blobs){
          if(!keyPattern.test(key))continue;
          const [,row,position,color]=key.split('/');
          const group=`${row}/${position}`;
          const item=counts.get(group)||{row:Number(row),position,blue:0,count:0};
          item.count++;
          if(color==='blue')item.blue++;
          counts.set(group,item);
        }
      }
      return json({stats:[...counts.values()],total:[...counts.values()].reduce((n,item)=>n+item.count,0)});
    }
    if(!['POST','DELETE'].includes(request.method))return json({error:'method not allowed'},405);
    if(process.env.CONTEXT&&process.env.CONTEXT!=='production')return json({error:'production only'},403);
    let body;
    try{body=await request.json()}catch{return json({error:'invalid JSON'},400)}
    if(request.method==='DELETE'){
      if(!keyPattern.test(body?.key||''))return json({error:'invalid key'},400);
      await store.delete(body.key);
      return json({ok:true});
    }
    const {id,row,position,color,previousKey}=body||{};
    if(!idPattern.test(id||'')||!Number.isInteger(row)||row<1||row>99||!positions.includes(position)||!colors.includes(color)||previousKey&&(!keyPattern.test(previousKey)||!previousKey.endsWith('/'+id)))return json({error:'invalid record'},400);
    const key=keyOf({id,row,position,color});
    await store.set(key,'1',{onlyIfNew:true});
    if(previousKey&&previousKey!==key)await store.delete(previousKey);
    return json({ok:true,key});
  };
}

export default async request=>{
  try{return await createHandler(getStore({name:'appraisal-observations',consistency:'strong'}))(request)}
  catch(error){console.error('shared stats failed',error);return json({error:'shared stats unavailable'},503)}
};
