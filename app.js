(()=>{
  const $=id=>document.getElementById(id);
  const choices=[0.5,0.7,1.2,1.3,1.7,2.0];
  const positions=[['left','左'],['middle','中'],['right','右']];
  const maxRows=6;
  const storageKey='pineapple-appraisal-helper-v2';
  const syncKey='pineapple-appraisal-shared-sync-v1';
  const sharedUrl='/.netlify/functions/shared-stats';
  const newId=()=>`${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
  const validPosition=value=>positions.some(([key])=>key===value);
  const validColor=value=>value==='blue'||value==='red';
  const validFactor=value=>Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<=100;
  const saved=read(storageKey);
  const old=read('pineapple-appraisal-helper-v1');
  const previousBase=saved?.base??old?.base??'';
  const savedBase=previousBase===''?'':Number.isFinite(Number(previousBase))?String(previousBase):'';
  const savedUnit=saved?.baseUnit==='wan'?'wan':'yuan';
  const sessionId=typeof saved?.sessionId==='string'?saved.sessionId:newId();
  const migrated=Array.isArray(old?.rows)?old.rows.filter(validFactor).slice(0,99).map((factor,index)=>({
    id:newId(),sessionId,row:index+1,position:null,color:null,multiplier:Number(factor),at:Date.now()
  })):[];
  const entries=Array.isArray(saved?.entries)?saved.entries.filter(entry=>
    entry&&typeof entry.sessionId==='string'&&Number.isInteger(entry.row)&&entry.row>0&&entry.row<=99&&validFactor(entry.multiplier)
  ).map(entry=>({
    id:typeof entry.id==='string'?entry.id:newId(),sessionId:entry.sessionId,row:entry.row,
    position:validPosition(entry.position)?entry.position:null,
    color:validColor(entry.color)?entry.color:null,
    multiplier:Number(entry.multiplier),at:Number.isFinite(entry.at)?entry.at:Date.now()
  })):migrated;
  const state={
    version:2,sessionId,entries,
    awaiting:Boolean(saved?.awaiting??old?.awaiting),
    stopped:Boolean(saved?.stopped??old?.stopped),
    base:savedBase,baseUnit:savedUnit,
    draft:{
      position:validPosition(saved?.draft?.position)?saved.draft.position:null,
      color:validColor(saved?.draft?.color)?saved.draft.color:null,
      multiplier:validFactor(saved?.draft?.multiplier)?Number(saved.draft.multiplier):null
    }
  };
  let sharedStats=null;
  let sharedConditional=null;
  let sharedPathLoaded=null;
  let requestedPath=null;
  let requestNumber=0;
  let syncMap=read(syncKey)||{};
  if(!syncMap||typeof syncMap!=='object'||Array.isArray(syncMap))syncMap={};
  let syncing=false;
  let syncQueued=false;
  let syncTimer;
  const sharedKey=entry=>`s/${entry.sessionId}/${entry.row}/${entry.position}/${entry.color}/${entry.id}`;
  const validSharedKey=key=>/^r\/(?:[1-9]|[1-9][0-9])\/(?:left|middle|right)\/(?:blue|red)\/[a-zA-Z0-9-]{12,80}$/.test(key)||/^s\/[a-zA-Z0-9-]{12,80}\/[1-6]\/(?:left|middle|right)\/(?:blue|red)\/[a-zA-Z0-9-]{12,80}$/.test(key);
  const currentRows=()=>state.entries.filter(entry=>entry.sessionId===state.sessionId);
  const penaltyCount=()=>currentRows().filter(entry=>entry.color==='red').length;
  const forcedEndReason=()=>penaltyCount()>=2?'penalties':currentRows().length>=maxRows?'rows':null;
  const lastCurrent=()=>currentRows().at(-1);
  if(!currentRows().length)state.awaiting=false;
  if(forcedEndReason())state.stopped=true;
  if(state.awaiting){const last=lastCurrent();state.draft={position:last.position,color:last.color,multiplier:last.multiplier}}
  $('baseValue').value=state.base;
  $('baseUnit').value=state.baseUnit;
  let visibleHistory=30;
  const validBase=value=>value!==''&&Number.isFinite(Number(value))&&Number(value)>=0;
  const total=()=>currentRows().reduce((product,entry)=>product*entry.multiplier,1);
  const baseYuan=()=>Number(state.base)*(state.baseUnit==='wan'?10000:1);
  const money=value=>Number.isFinite(value)?Math.abs(value)>=10000?new Intl.NumberFormat('zh-CN',{maximumFractionDigits:6}).format(value/10000)+'万':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value)+'元':'—';
  const factorText=value=>new Intl.NumberFormat('zh-CN',{minimumFractionDigits:3,maximumFractionDigits:3}).format(value);
  const placeText=value=>positions.find(([key])=>key===value)?.[1]||'旧版未记录';
  const colorText=value=>value==='blue'?'蓝牌':value==='red'?'红牌':'牌色未记录';
  const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(state));return true}catch{return false}};
  const blankDraft=()=>({position:null,color:null,multiplier:null});
  const nextRow=()=>currentRows().length+1;
  const predictionPath=()=>{
    const rows=currentRows();
    return rows.length<maxRows&&rows.every(entry=>validPosition(entry.position)&&validColor(entry.color))?rows.map(entry=>entry.position+'.'+entry.color).join(','):'';
  };
  const pathSteps=()=>currentRows().map(entry=>({position:entry.position,color:entry.color}));
  const pathLabel=steps=>steps.map((step,index)=>`第 ${index+1} 行${placeText(step.position)}${step.color==='blue'?'蓝':'红'}`).join(' → ');
  function statsForRow(row,source='personal'){
    return positions.map(([position,label])=>{
      if(source==='shared'){
        const item=sharedStats?.find(item=>item.row===row&&item.position===position);
        const count=item?.count||0,blue=item?.blue||0;
        return {position,label,count,blue,rate:count?blue/count:null};
      }
      const samples=state.entries.filter(entry=>entry.row===row&&entry.position===position&&validColor(entry.color));
      const blue=samples.filter(entry=>entry.color==='blue').length;
      return {position,label,count:samples.length,blue,rate:samples.length?blue/samples.length:null};
    });
  }
  function recommendation(stats){
    return stats.filter(item=>item.count>0).sort((a,b)=>b.rate-a.rate||b.count-a.count||positions.findIndex(([key])=>key===a.position)-positions.findIndex(([key])=>key===b.position))[0]||null;
  }
  function personalConditional(path,mode){
    const row=path.length+1;
    const sessions=new Map();
    state.entries.filter(entry=>entry.row<=maxRows&&validPosition(entry.position)&&validColor(entry.color)).forEach(entry=>{
      const rows=sessions.get(entry.sessionId)||new Map();
      rows.set(entry.row,entry);
      sessions.set(entry.sessionId,rows);
    });
    const counts=positions.map(([position,label])=>({position,label,count:0,blue:0,rate:null}));
    let matchedSessions=0;
    for(const rows of sessions.values()){
      const matches=mode==='exact'?path.every((step,index)=>rows.get(index+1)?.position===step.position&&rows.get(index+1)?.color===step.color):rows.get(row-1)?.position===path.at(-1).position&&rows.get(row-1)?.color===path.at(-1).color;
      if(!matches)continue;
      matchedSessions++;
      const next=rows.get(row);
      const item=counts.find(item=>item.position===next?.position);
      if(item){item.count++;if(next.color==='blue')item.blue++}
    }
    counts.forEach(item=>item.rate=item.count?item.blue/item.count:null);
    return {matchedSessions,stats:counts};
  }
  const cleanConditional=raw=>{
    if(!raw||!Array.isArray(raw.stats)||!Number.isInteger(raw.matchedSessions))return null;
    const stats=positions.map(([position,label])=>{
      const item=raw.stats.find(item=>item.position===position);
      const count=Number.isInteger(item?.count)&&item.count>=0?item.count:0;
      const blue=Number.isInteger(item?.blue)&&item.blue>=0&&item.blue<=count?item.blue:0;
      return {position,label,count,blue,rate:count?blue/count:null};
    });
    return {matchedSessions:raw.matchedSessions,stats};
  };
  function renderCurrent(){
    const rows=currentRows();
    const t=total();
    const upcoming=rows.length+1;
    const current=state.awaiting?rows.length:upcoming;
    const early=upcoming<=3;
    const maxed=rows.length>=maxRows;
    const forced=forcedEndReason();
    const twoPenalties=forced==='penalties';
    $('totalMultiplier').textContent='×'+factorText(t);
    $('revealedCount').textContent=rows.length+' 行';
    $('currentPayout').textContent=validBase(state.base)?money(baseYuan()*t):'—';
    $('rowPill').textContent=twoPenalties?'红牌 2 张结束':maxed?'第 6 行结束':state.stopped?'已收手':'第 '+current+' 行';
    $('rowInstruction').textContent=twoPenalties?'已出现 2 张惩罚牌，本局自动结束；可撤销或重置':maxed?'已完成第 6 行，本局自动结束；可撤销或重置':state.stopped?'本局已结束；重置可开始新局':(state.awaiting?'第 '+current+' 行已记录，可调整本行或继续':'依次选择第 '+current+' 行的位置、牌色和倍率')+' · 红牌 '+penaltyCount()+'/2';
    $('nextRowLabel').textContent=twoPenalties?'2 张惩罚牌，已结束':maxed?'第 6 行已结束':state.stopped?'本局已收手':'下一张：第 '+upcoming+' 行';
    $('rewardProbability').textContent=state.stopped?'—':early?'2/3':'1/3';
    $('penaltyProbability').textContent=state.stopped?'—':early?'1/3':'2/3';
    $('riskPill').textContent=state.stopped?'已结束':early?'谨慎':'建议收手';
    $('riskBadge').textContent=twoPenalties?'红牌已满':maxed?'已到上限':state.stopped?'已收手':early?'谨慎':'建议收手';
    $('riskText').textContent=twoPenalties?'本局累计 2 张惩罚牌，已自动结束。':maxed?'本局最多 6 行，已自动结束。没有第 7 行。':state.stopped?'本局已收手。':(early?'前 3 行每行有 2 张奖励牌、1 张惩罚牌。无法据此算出盈利概率。':'第 4 行起每行有 1 张奖励牌、2 张惩罚牌。惩罚牌比例更高，建议谨慎收手。')+(penaltyCount()===1?' 已有 1 张红牌，再出 1 张将自动结束。':'');
    $('continueBtn').disabled=state.stopped||!state.awaiting||rows.length>=maxRows;
    $('stopBtn').disabled=state.stopped;
    $('undoBtn').disabled=!rows.length;
    $('addCustom').disabled=state.stopped||(!state.awaiting&&rows.length>=maxRows);
    $('customMultiplier').disabled=state.stopped||(!state.awaiting&&rows.length>=maxRows);
    $('stoppedMessage').hidden=!state.stopped;
    if(state.stopped)$('stoppedMessage').textContent=(twoPenalties?'累计 2 张惩罚牌，已自动结束':maxed?'第 6 行完成，已自动结束':'已收手')+' · '+rows.length+' 行 · 总倍率 ×'+factorText(t)+(validBase(state.base)?' · 预计收益 '+money(baseYuan()*t):'。输入基础价值可查看收益。');
    document.querySelectorAll('[data-position]').forEach(button=>{
      button.disabled=state.stopped||(!state.awaiting&&rows.length>=maxRows);
      button.classList.toggle('selected',button.dataset.position===state.draft.position);
      button.setAttribute('aria-pressed',String(button.dataset.position===state.draft.position));
    });
    document.querySelectorAll('[data-color]').forEach(button=>{
      button.disabled=state.stopped||(!state.awaiting&&rows.length>=maxRows);
      button.classList.toggle('selected',button.dataset.color===state.draft.color);
      button.setAttribute('aria-pressed',String(button.dataset.color===state.draft.color));
    });
    $('currentOptions').querySelectorAll('button').forEach(button=>{
      button.disabled=state.stopped||(!state.awaiting&&rows.length>=maxRows);
      button.classList.toggle('selected',Number(button.dataset.value)===state.draft.multiplier);
      button.setAttribute('aria-pressed',String(Number(button.dataset.value)===state.draft.multiplier));
    });
    const missing=[];
    if(!state.draft.position)missing.push('位置');
    if(!state.draft.color)missing.push('牌色');
    if(!state.draft.multiplier)missing.push('倍率');
    $('entryHint').textContent=twoPenalties?'第 2 张红牌已记录，本局自动结束。撤销上一条可重新录入。':maxed?'第 6 行已记录，本局自动结束。撤销上一条可重新录入第 6 行。':state.stopped?'本局已收手；历史仍保留。':state.awaiting?'本行已自动记录。可调整当前行，或点“继续鉴定”进入下一行。':'还需选择：'+missing.join('、')+'。选齐后自动记录并更新总倍率。';
    $('history').replaceChildren();
    if(!rows.length){const empty=document.createElement('span');empty.className='history-empty';empty.textContent='本局尚无记录';$('history').append(empty)}
    rows.forEach(entry=>{const chip=document.createElement('span');chip.className='history-chip '+(entry.color||'');chip.textContent=`第 ${entry.row} 行 · ${placeText(entry.position)} · ${colorText(entry.color)} · ×${entry.multiplier}`;$('history').append(chip)});
  }
  function renderPrediction(){
    const row=nextRow();
    if(state.stopped){
      const message=penaltyCount()>=2?'已出现 2 张惩罚牌，本局没有下一张。':currentRows().length>=maxRows?'第 6 行已完成，本局没有下一张。':'本局已收手，没有下一张。';
      $('inlinePredictionRow').textContent='本局已结束';
      $('inlineRecommended').textContent=message;
      $('inlinePredictionSummary').textContent='重置本局后可查看第 1 行的历史样本。';
      $('predictionRowLabel').textContent='本局已结束';
      $('sharedStatus').textContent=message;
      $('recommendedPosition').textContent='暂无下一张';
      $('recommendationScope').textContent='本局结束后不再计算下一行条件样本。';
      $('predictionCondition').textContent='';
      $('sampleWarning').textContent='历史样本仅供参考，不能预测随机结果。';
      $('predictionReward').textContent='—';
      $('predictionPenalty').textContent='—';
      $('predictionCards').replaceChildren();
      return;
    }
    const early=row<=3;
    const source=sharedStats===null?'personal':'shared';
    const sourceLabel=source==='shared'?'全员匿名样本':'本机样本';
    const path=pathSteps();
    const canCondition=row>1&&path.length===row-1&&path.every(step=>validPosition(step.position)&&validColor(step.color));
    const pathKey=predictionPath();
    const overall=statsForRow(row,source);
    const exact=canCondition?(source==='shared'?(sharedPathLoaded===pathKey?cleanConditional(sharedConditional?.exact):null):personalConditional(path,'exact')):null;
    const previous=canCondition&&row>2?(source==='shared'?(sharedPathLoaded===pathKey?cleanConditional(sharedConditional?.previous):null):personalConditional(path,'previous')):null;
    const shownStats=exact?.stats||overall;
    const sufficientlySampled=stats=>stats?.every(item=>item.count>=5);
    let recommendationStats=null;
    let tier='';
    if(exact&&sufficientlySampled(exact.stats)){recommendationStats=exact.stats;tier='完整路径'}
    else if(previous&&sufficientlySampled(previous.stats)){recommendationStats=previous.stats;tier='上一行条件'}
    else if(sufficientlySampled(overall)){recommendationStats=overall;tier='同一行总体'}
    const best=recommendationStats?recommendation(recommendationStats):null;
    const insufficient=shownStats.some(item=>item.count<5);
    const rates=shownStats.map(item=>item.label+' '+(item.rate===null?'—':Math.round(item.rate*100)+'%')+'（'+item.count+'条）').join(' · ');
    const conditionText=canCondition?(exact?`条件：${pathLabel(path)}。匹配 ${exact.matchedSessions} 局，其中 ${exact.stats.reduce((n,item)=>n+item.count,0)} 局记录了第 ${row} 行。`:`条件：${pathLabel(path)}。正在读取可关联的历史局。`):`第 ${row} 行按位置统计全部已记录结果。`;
    $('inlinePredictionRow').textContent='待选第 '+row+' 行 · '+sourceLabel+'条件统计';
    $('inlineRecommended').textContent=best?best.label+' · '+tier+'出蓝率 '+Math.round(best.rate*100)+'%':'样本不足，暂不推荐';
    $('inlinePredictionSummary').textContent=conditionText+rates+'。'+(insufficient?'样本不足，仅供参考；':'仅供参考；')+'不能预测随机结果。';
    $('predictionRowLabel').textContent='第 '+row+' 行 · '+sourceLabel;
    $('sharedStatus').textContent=source==='shared'?'正在显示全员匿名统计；条件样本只计算可关联的完整本局记录。':'全员统计暂不可用，当前显示本机记录。';
    $('predictionCondition').textContent=conditionText;
    $('predictionReward').textContent=early?'2/3':'1/3';
    $('predictionPenalty').textContent=early?'1/3':'2/3';
    $('recommendedPosition').textContent=best?best.label+' · '+Math.round(best.rate*100)+'% 历史出蓝率':'样本不足，暂不推荐';
    $('recommendationScope').textContent=best?'推荐依据：'+tier+'；各位置均至少 5 条记录。':'完整路径、上一行条件和同一行总体均未达到各位置至少 5 条。';
    $('sampleWarning').textContent=(insufficient?'样本不足，仅供参考。':'历史样本仅供参考。')+(best&&canCondition&&tier!=='完整路径'?'完整路径样本不够，推荐已退回'+tier+'。':'')+'玩家只记录自己选过的位置，历史出蓝率不能预测随机结果。';
    $('predictionCards').replaceChildren();
    shownStats.forEach(item=>{
      const card=document.createElement('div');card.className='stat-card'+(best?.position===item.position&&(!canCondition||tier==='完整路径')?' recommended':'');
      const label=document.createElement('span');label.className='place';label.textContent=item.label;
      const rate=document.createElement('strong');rate.className='rate';rate.textContent=item.rate===null?'—':Math.round(item.rate*100)+'%';
      const sample=document.createElement('span');sample.className='sample';sample.textContent=`蓝 ${item.blue} / 样本 ${item.count}`;
      card.append(label,rate,sample);$('predictionCards').append(card);
    });
  }
  function renderHistory(){
    const valid=state.entries.filter(entry=>validPosition(entry.position)&&validColor(entry.color));
    $('totalRecords').textContent=String(valid.length);
    $('blueRecords').textContent=String(valid.filter(entry=>entry.color==='blue').length);
    $('sessionCount').textContent=String(new Set(valid.map(entry=>entry.sessionId)).size);
    $('historyRows').replaceChildren();
    const rows=[...new Set(valid.map(entry=>entry.row))].sort((a,b)=>a-b);
    if(!rows.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='暂无可统计的记录。请在“当前鉴定”中选择位置、牌色和倍率。';$('historyRows').append(empty)}
    rows.forEach(row=>{
      const block=document.createElement('div');block.className='row-stat';
      const heading=document.createElement('strong');heading.textContent='第 '+row+' 行';block.append(heading);
      statsForRow(row).forEach(item=>{const line=document.createElement('span');line.textContent=`${item.label}：${item.rate===null?'—':Math.round(item.rate*100)+'%'} 出蓝 · 蓝 ${item.blue} / 样本 ${item.count}`;block.append(line)});
      $('historyRows').append(block);
    });
    $('sharedRows').replaceChildren();
    $('sharedTotal').textContent=sharedStats===null?'—':String(sharedStats.reduce((n,item)=>n+item.count,0));
    $('sharedHistoryStatus').textContent=sharedStats===null?'全员统计暂不可用；本机历史仍可查看。':'汇总所有打开新版网站并完成上传的匿名翻牌记录。';
    const sharedRowNumbers=sharedStats===null?[]:[...new Set(sharedStats.map(item=>item.row))].sort((a,b)=>a-b);
    if(!sharedRowNumbers.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent=sharedStats===null?'连接恢复后可查看全员统计。':'暂无全员样本。记录翻牌后会自动加入。';$('sharedRows').append(empty)}
    sharedRowNumbers.forEach(row=>{
      const block=document.createElement('div');block.className='row-stat';
      const heading=document.createElement('strong');heading.textContent='第 '+row+' 行';block.append(heading);
      statsForRow(row,'shared').forEach(item=>{const line=document.createElement('span');line.textContent=`${item.label}：${item.rate===null?'—':Math.round(item.rate*100)+'%'} 出蓝 · 蓝 ${item.blue} / 样本 ${item.count}`;block.append(line)});
      $('sharedRows').append(block);
    });
    $('historyList').replaceChildren();
    const recent=[...state.entries].reverse().slice(0,visibleHistory);
    if(!recent.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='还没有历史记录。';$('historyList').append(empty)}
    recent.forEach(entry=>{
      const item=document.createElement('div');item.className='history-item';
      const heading=document.createElement('strong');heading.textContent=`第 ${entry.row} 行 · ${placeText(entry.position)} · ${colorText(entry.color)} · ×${entry.multiplier}`;
      const date=document.createElement('span');date.textContent=new Date(entry.at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      item.append(heading,date);$('historyList').append(item);
    });
    $('showMoreHistory').hidden=state.entries.length<=visibleHistory;
  }
  function render(){
    renderCurrent();renderPrediction();renderHistory();
    $('storageWarning').hidden=save();
  }
  async function loadShared(){
    const path=predictionPath();
    requestedPath=path;
    const thisRequest=++requestNumber;
    try{
      const response=await fetch(sharedUrl+(path?'?path='+encodeURIComponent(path):''),{cache:'no-store'});
      if(!response.ok)throw Error('unavailable');
      const body=await response.json();
      if(!Array.isArray(body.stats))throw Error('invalid stats');
      if(thisRequest!==requestNumber||path!==predictionPath())return;
      sharedStats=body.stats.filter(item=>Number.isInteger(item.row)&&item.row>=1&&item.row<=maxRows&&validPosition(item.position)&&Number.isInteger(item.count)&&item.count>=0&&Number.isInteger(item.blue)&&item.blue>=0&&item.blue<=item.count);
      sharedConditional=body.conditional;
      sharedPathLoaded=path;
    }catch{
      if(thisRequest!==requestNumber)return;
      sharedStats=null;sharedConditional=null;sharedPathLoaded=null;
    }
    renderPrediction();renderHistory();
  }
  function refreshPath(){if(predictionPath()!==requestedPath)loadShared()}
  function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(syncShared,350)}
  async function syncShared(){
    if(syncing){syncQueued=true;return}
    if(!navigator.onLine)return;
    syncing=true;
    let changed=false;
    try{
      const desired=new Map(state.entries.filter(entry=>entry.row<=maxRows&&validPosition(entry.position)&&validColor(entry.color)&&/^[a-zA-Z0-9-]{12,80}$/.test(entry.id)&&/^[a-zA-Z0-9-]{12,80}$/.test(entry.sessionId)).map(entry=>[entry.id,entry]));
      for(const [id,oldKey] of Object.entries(syncMap)){
        if(!validSharedKey(oldKey)){delete syncMap[id];continue}
        if(desired.has(id))continue;
        const response=await fetch(sharedUrl,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({key:oldKey})});
        if(!response.ok)throw Error('delete failed');
        delete syncMap[id];changed=true;localStorage.setItem(syncKey,JSON.stringify(syncMap));
      }
      for(const [id,entry] of desired){
        const key=sharedKey(entry);
        if(syncMap[id]===key)continue;
        const response=await fetch(sharedUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,sessionId:entry.sessionId,row:entry.row,position:entry.position,color:entry.color,previousKey:validSharedKey(syncMap[id])?syncMap[id]:undefined})});
        if(!response.ok)throw Error('upload failed');
        syncMap[id]=key;changed=true;localStorage.setItem(syncKey,JSON.stringify(syncMap));
      }
    }catch{}finally{syncing=false}
    if(changed)loadShared();
    if(syncQueued){syncQueued=false;scheduleSync()}
  }
  function choose(field,value){
    if(state.stopped||(!state.awaiting&&currentRows().length>=maxRows))return;
    state.draft[field]=value;
    if(state.awaiting){const entry=lastCurrent();if(entry)entry[field]=value}
    else if(state.draft.position&&state.draft.color&&state.draft.multiplier){
      state.entries.push({id:newId(),sessionId:state.sessionId,row:nextRow(),...state.draft,at:Date.now()});
      state.awaiting=true;
    }
    if(forcedEndReason())state.stopped=true;
    render();
    refreshPath();
    scheduleSync();
  }
  document.querySelectorAll('[data-position]').forEach(button=>button.addEventListener('click',()=>choose('position',button.dataset.position)));
  document.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',()=>choose('color',button.dataset.color)));
  for(const n of choices){
    const button=document.createElement('button');button.type='button';button.className='multiplier-btn';button.dataset.value=String(n);
    button.textContent='×'+n.toFixed(1);button.setAttribute('aria-label','选择倍率 '+n);
    button.addEventListener('click',()=>choose('multiplier',n));$('currentOptions').append(button);
  }
  $('addCustom').addEventListener('click',()=>{const value=$('customMultiplier').value;if(validFactor(value)){choose('multiplier',Number(value));$('customMultiplier').value=''}else $('customMultiplier').reportValidity()});
  $('customMultiplier').addEventListener('keydown',event=>{if(event.key==='Enter')$('addCustom').click()});
  $('baseValue').addEventListener('input',()=>{state.base=$('baseValue').value;render()});
  $('baseUnit').addEventListener('change',()=>{
    if(validBase(state.base))state.base=String(state.baseUnit==='wan'?Number(state.base)*10000:Number(state.base)/10000);
    state.baseUnit=$('baseUnit').value;
    $('baseValue').value=state.base;
    render();
  });
  $('continueBtn').addEventListener('click',()=>{if(state.awaiting&&!state.stopped){state.awaiting=false;state.draft=blankDraft();render()}});
  $('stopBtn').addEventListener('click',()=>{state.stopped=true;render()});
  $('undoBtn').addEventListener('click',()=>{
    const entry=lastCurrent();if(!entry)return;
    state.entries.splice(state.entries.findIndex(item=>item.id===entry.id),1);
    state.awaiting=false;state.stopped=Boolean(forcedEndReason());state.draft=blankDraft();render();refreshPath();scheduleSync();
  });
  $('resetBtn').addEventListener('click',()=>{state.sessionId=newId();state.awaiting=false;state.stopped=false;state.draft=blankDraft();render();refreshPath()});
  $('showMoreHistory').addEventListener('click',()=>{visibleHistory+=30;renderHistory()});
  $('openPrediction').addEventListener('click',()=>{$('tab-prediction').click();window.scrollTo(0,0)});
  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(other=>other.setAttribute('aria-selected',String(other===tab)));
    document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id==='view-'+tab.dataset.view));
  }));
  render();loadShared();scheduleSync();
  window.addEventListener('online',()=>{loadShared();scheduleSync()});
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
})();
