(()=>{
  const $=id=>document.getElementById(id);
  const choices=[0.5,0.7,1.2,1.3,1.7,2.0];
  const positions=[['left','左'],['middle','中'],['right','右']];
  const storageKey='pineapple-appraisal-helper-v2';
  const newId=()=>`${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
  const validPosition=value=>positions.some(([key])=>key===value);
  const validColor=value=>value==='blue'||value==='red';
  const validFactor=value=>Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<=100;
  const saved=read(storageKey);
  const old=read('pineapple-appraisal-helper-v1');
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
    base:saved?.base??old?.base??'',
    draft:{
      position:validPosition(saved?.draft?.position)?saved.draft.position:null,
      color:validColor(saved?.draft?.color)?saved.draft.color:null,
      multiplier:validFactor(saved?.draft?.multiplier)?Number(saved.draft.multiplier):null
    }
  };
  const currentRows=()=>state.entries.filter(entry=>entry.sessionId===state.sessionId);
  const lastCurrent=()=>currentRows().at(-1);
  if(!currentRows().length)state.awaiting=false;
  if(state.awaiting){const last=lastCurrent();state.draft={position:last.position,color:last.color,multiplier:last.multiplier}}
  $('baseValue').value=state.base;
  let visibleHistory=30;
  const validBase=value=>value!==''&&Number.isFinite(Number(value))&&Number(value)>=0;
  const total=()=>currentRows().reduce((product,entry)=>product*entry.multiplier,1);
  const money=value=>Number.isFinite(value)?new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value):'—';
  const factorText=value=>new Intl.NumberFormat('zh-CN',{minimumFractionDigits:3,maximumFractionDigits:3}).format(value);
  const placeText=value=>positions.find(([key])=>key===value)?.[1]||'旧版未记录';
  const colorText=value=>value==='blue'?'蓝牌':value==='red'?'红牌':'牌色未记录';
  const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(state));return true}catch{return false}};
  const blankDraft=()=>({position:null,color:null,multiplier:null});
  const nextRow=()=>currentRows().length+1;
  function statsForRow(row){
    return positions.map(([position,label])=>{
      const samples=state.entries.filter(entry=>entry.row===row&&entry.position===position&&validColor(entry.color));
      const blue=samples.filter(entry=>entry.color==='blue').length;
      return {position,label,count:samples.length,blue,rate:samples.length?blue/samples.length:null};
    });
  }
  function recommendation(stats){
    return stats.filter(item=>item.count>0).sort((a,b)=>b.rate-a.rate||b.count-a.count||positions.findIndex(([key])=>key===a.position)-positions.findIndex(([key])=>key===b.position))[0]||null;
  }
  function renderCurrent(){
    const rows=currentRows();
    const t=total();
    const upcoming=rows.length+1;
    const current=state.awaiting?rows.length:upcoming;
    const early=upcoming<=3;
    $('totalMultiplier').textContent='×'+factorText(t);
    $('revealedCount').textContent=rows.length+' 行';
    $('currentPayout').textContent=validBase(state.base)?money(Number(state.base)*t):'—';
    $('rowPill').textContent=state.stopped?'已收手':'第 '+current+' 行';
    $('rowInstruction').textContent=state.stopped?'本局已结束；重置可开始新局':state.awaiting?'第 '+current+' 行已记录，可调整本行或继续':'依次选择第 '+current+' 行的位置、牌色和倍率';
    $('nextRowLabel').textContent=state.stopped?'本局已结束':'下一张：第 '+upcoming+' 行';
    $('rewardProbability').textContent=early?'2/3':'1/3';
    $('penaltyProbability').textContent=early?'1/3':'2/3';
    $('riskPill').textContent=state.stopped?'已结束':early?'谨慎':'建议收手';
    $('riskBadge').textContent=state.stopped?'已收手':early?'谨慎':'建议收手';
    $('riskText').textContent=early?'前 3 行每行有 2 张奖励牌、1 张惩罚牌。无法据此算出盈利概率。':'第 4 行起每行有 1 张奖励牌、2 张惩罚牌。惩罚牌比例更高，建议谨慎收手。';
    $('continueBtn').disabled=state.stopped||!state.awaiting||rows.length>=99;
    $('stopBtn').disabled=state.stopped;
    $('undoBtn').disabled=!rows.length;
    $('addCustom').disabled=state.stopped||(!state.awaiting&&rows.length>=99);
    $('customMultiplier').disabled=state.stopped||(!state.awaiting&&rows.length>=99);
    $('stoppedMessage').hidden=!state.stopped;
    if(state.stopped)$('stoppedMessage').textContent='已收手 · '+rows.length+' 行 · 总倍率 ×'+factorText(t)+(validBase(state.base)?' · 预计收益 '+money(Number(state.base)*t):'。输入基础价值可查看收益。');
    document.querySelectorAll('[data-position]').forEach(button=>{
      button.disabled=state.stopped||(!state.awaiting&&rows.length>=99);
      button.classList.toggle('selected',button.dataset.position===state.draft.position);
      button.setAttribute('aria-pressed',String(button.dataset.position===state.draft.position));
    });
    document.querySelectorAll('[data-color]').forEach(button=>{
      button.disabled=state.stopped||(!state.awaiting&&rows.length>=99);
      button.classList.toggle('selected',button.dataset.color===state.draft.color);
      button.setAttribute('aria-pressed',String(button.dataset.color===state.draft.color));
    });
    $('currentOptions').querySelectorAll('button').forEach(button=>{
      button.disabled=state.stopped||(!state.awaiting&&rows.length>=99);
      button.classList.toggle('selected',Number(button.dataset.value)===state.draft.multiplier);
      button.setAttribute('aria-pressed',String(Number(button.dataset.value)===state.draft.multiplier));
    });
    const missing=[];
    if(!state.draft.position)missing.push('位置');
    if(!state.draft.color)missing.push('牌色');
    if(!state.draft.multiplier)missing.push('倍率');
    $('entryHint').textContent=state.stopped?'本局已收手；历史仍保留。':state.awaiting?'本行已自动记录。可调整当前行，或点“继续鉴定”进入下一行。':rows.length>=99?'本局最多记录 99 行。':'还需选择：'+missing.join('、')+'。选齐后自动记录并更新总倍率。';
    $('history').replaceChildren();
    if(!rows.length){const empty=document.createElement('span');empty.className='history-empty';empty.textContent='本局尚无记录';$('history').append(empty)}
    rows.forEach(entry=>{const chip=document.createElement('span');chip.className='history-chip '+(entry.color||'');chip.textContent=`第 ${entry.row} 行 · ${placeText(entry.position)} · ${colorText(entry.color)} · ×${entry.multiplier}`;$('history').append(chip)});
  }
  function renderPrediction(){
    const row=nextRow();
    const early=row<=3;
    const stats=statsForRow(row);
    const best=recommendation(stats);
    $('predictionRowLabel').textContent='统计第 '+row+' 行的历史选择';
    $('predictionReward').textContent=early?'2/3':'1/3';
    $('predictionPenalty').textContent=early?'1/3':'2/3';
    $('recommendedPosition').textContent=best?best.label+' · '+Math.round(best.rate*100)+'% 历史出蓝率':'暂无推荐';
    $('sampleWarning').textContent=stats.some(item=>item.count<5)?'样本不足，仅供参考。当前行至少一个位置少于 5 条记录；即使样本增加，也不能预测随机结果。':'历史样本仅供参考；即使每个位置都有记录，也不能预测随机结果。';
    $('predictionCards').replaceChildren();
    stats.forEach(item=>{
      const card=document.createElement('div');card.className='stat-card'+(best?.position===item.position?' recommended':'');
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
  function choose(field,value){
    if(state.stopped||(!state.awaiting&&currentRows().length>=99))return;
    state.draft[field]=value;
    if(state.awaiting){const entry=lastCurrent();if(entry)entry[field]=value}
    else if(state.draft.position&&state.draft.color&&state.draft.multiplier){
      state.entries.push({id:newId(),sessionId:state.sessionId,row:nextRow(),...state.draft,at:Date.now()});
      state.awaiting=true;
    }
    render();
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
  $('continueBtn').addEventListener('click',()=>{if(state.awaiting&&!state.stopped){state.awaiting=false;state.draft=blankDraft();render()}});
  $('stopBtn').addEventListener('click',()=>{state.stopped=true;render()});
  $('undoBtn').addEventListener('click',()=>{
    const entry=lastCurrent();if(!entry)return;
    state.entries.splice(state.entries.findIndex(item=>item.id===entry.id),1);
    state.awaiting=false;state.stopped=false;state.draft=blankDraft();render();
  });
  $('resetBtn').addEventListener('click',()=>{state.sessionId=newId();state.awaiting=false;state.stopped=false;state.draft=blankDraft();render()});
  $('showMoreHistory').addEventListener('click',()=>{visibleHistory+=30;renderHistory()});
  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(other=>other.setAttribute('aria-selected',String(other===tab)));
    document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id==='view-'+tab.dataset.view));
  }));
  function trial(){
    const base=$('trialBase').value;
    const current=Number($('trialMultiplier').value);
    const valid=validBase(base)&&Number.isFinite(current)&&current>0&&current<=1000000;
    $('trialPayout').textContent=valid?money(Number(base)*current):'—';
    $('trialGrid').replaceChildren();
    choices.forEach(n=>{
      const button=document.createElement('button');button.type='button';button.className='trial-option';
      const heading=document.createElement('b');heading.textContent='×'+n.toFixed(1);
      const value=document.createElement('span');value.textContent=valid?'总倍率 ×'+factorText(current*n)+' · 收益 '+money(Number(base)*current*n):'输入基础价值查看';
      button.append(heading,value);button.addEventListener('click',()=>{$('trialMultiplier').value=Number.isFinite(current)&&current>0?String(current*n):String(n);trial()});$('trialGrid').append(button);
    });
  }
  ['trialBase','trialMultiplier'].forEach(id=>$(id).addEventListener('input',trial));
  $('useCurrent').addEventListener('click',()=>{$('trialBase').value=state.base;$('trialMultiplier').value=String(total());trial()});
  render();trial();
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
})();
