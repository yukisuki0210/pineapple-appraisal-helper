import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const root=new URL('./dist/',import.meta.url);
const mime={'.html':'text/html; charset=utf-8','.webmanifest':'application/manifest+json','.js':'text/javascript','.png':'image/png'};
const server=createServer(async(req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
  if(!['index.html','app.js','manifest.webmanifest','service-worker.js','icon-192.png','icon-512.png','apple-touch-icon.png'].includes(name)){res.writeHead(404).end();return}
  const file=new URL(name,root);
  try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[name.slice(name.lastIndexOf('.'))]||'application/octet-stream'}).end(bytes)}
  catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const targetUrl=process.env.TEST_URL||`http://127.0.0.1:${port}/`;
const screenshotPrefix=process.env.TEST_URL?'preview-live':'preview';
const profile=await mkdtemp(join(tmpdir(),'pineapple-appraisal-test-'));
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',[
  '--headless=new','--disable-gpu','--disable-gpu-sandbox','--no-sandbox','--no-first-run','--disable-extensions',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,targetUrl
],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket;
try{
  let debugPort;
  for(let i=0;i<100;i++){
    try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{await sleep(100)}
  }
  if(!debugPort)throw Error('Could not start the local browser');
  let target;
  for(let i=0;i<30;i++){
    const pages=await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    target=pages.find(page=>page.type==='page');if(target)break;await sleep(100);
  }
  if(!target)throw Error('Could not open a browser page');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
  let nextId=0;
  const pending=new Map();
  socket.addEventListener('message',event=>{
    const msg=JSON.parse(event.data);if(!msg.id)return;
    const item=pending.get(msg.id);if(!item)return;pending.delete(msg.id);
    msg.error?item.reject(Error(msg.error.message)):item.resolve(msg.result);
  });
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
  const evaluate=async expression=>{
    const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const check=(value,message)=>{if(!value)throw Error(message)};
  await cdp('Page.enable');await cdp('Runtime.enable');
  for(const width of [375,390,430]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    await cdp('Page.navigate',{url:targetUrl});
    for(let i=0;i<40;i++){if(await evaluate("document.readyState==='complete' && !!document.getElementById('currentOptions')?.children.length"))break;await sleep(100)}
    const dimensions=await evaluate('({viewport:innerWidth,content:document.documentElement.scrollWidth,tabs:document.querySelector(".tabs").getBoundingClientRect().width})');
    check(dimensions.viewport===width,`Viewport is ${dimensions.viewport}, expected ${width}`);
    check(dimensions.content<=width,`${width}px viewport overflows to ${dimensions.content}px`);
    const capture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(new URL(`${screenshotPrefix}-${width}.png`,import.meta.url),Buffer.from(capture.data,'base64'));
    console.log(`Mobile ${width}px: no horizontal overflow; screenshot ${screenshotPrefix}-${width}.png`);
  }
  const result=await evaluate(`(()=>{
    const el=id=>document.getElementById(id);
    const baseFirst=!!(el('baseValue').compareDocumentPosition(el('totalMultiplier'))&Node.DOCUMENT_POSITION_FOLLOWING);
    el('baseValue').value='2500';el('baseValue').dispatchEvent(new Event('input'));
    document.querySelector('[data-position="left"]').click();
    document.querySelector('[data-color="blue"]').click();
    document.querySelector('[data-value="1.2"]').click();
    const first=[el('totalMultiplier').textContent,el('currentPayout').textContent,el('rewardProbability').textContent];
    const safetyStrict=[el('safeLimit').value,el('safeAction').textContent,el('stopBtn').textContent,el('inlineRecommended').textContent];
    el('safeLimit').value='2';el('safeLimit').dispatchEvent(new Event('change'));
    const safetyExtended=[el('safeAction').textContent,el('continueBtn').textContent];
    el('baseUnit').value='wan';el('baseUnit').dispatchEvent(new Event('change'));
    const converted=[el('baseValue').value,el('currentPayout').textContent];
    el('baseValue').value='2.5';el('baseValue').dispatchEvent(new Event('input'));
    const firstWan=el('currentPayout').textContent;
    document.querySelector('[data-position="middle"]').click();
    document.querySelector('[data-color="red"]').click();
    document.querySelector('[data-value="0.7"]').click();
    const edited=JSON.parse(localStorage.getItem('pineapple-appraisal-helper-v2')).entries;
    const edit=[edited.length,edited[0].position,edited[0].color,edited[0].multiplier];
    document.querySelector('[data-position="left"]').click();
    document.querySelector('[data-color="blue"]').click();
    document.querySelector('[data-value="1.2"]').click();
    el('continueBtn').click();
    document.querySelector('[data-position="right"]').click();
    document.querySelector('[data-color="red"]').click();
    document.querySelector('[data-value="0.5"]').click();
    const second=[el('totalMultiplier').textContent,el('currentPayout').textContent];
    el('continueBtn').click();
    document.querySelector('[data-position="middle"]').click();
    document.querySelector('[data-color="blue"]').click();
    document.querySelector('[data-value="2"]').click();
    const third=[el('totalMultiplier').textContent,el('rewardProbability').textContent,el('penaltyProbability').textContent];
    el('undoBtn').click();
    const undone=el('totalMultiplier').textContent;
    el('resetBtn').click();
    const inline=[el('inlinePredictionRow').textContent,el('inlineRecommended').textContent,el('inlinePredictionSummary').textContent];
    el('openPrediction').click();
    const inlineLinkOpened=el('view-prediction').classList.contains('active');
    const prediction=[el('predictionRowLabel').textContent,el('recommendedPosition').textContent,el('sampleWarning').textContent,el('predictionCards').textContent];
    document.getElementById('tab-history').click();
    const history=[el('totalRecords').textContent,el('blueRecords').textContent,el('sessionCount').textContent,el('historyList').textContent];
    document.getElementById('tab-current').click();
    const trialRemoved=!el('trialBase')&&!el('trialMultiplier')&&!el('trialPayout');
    const stored=JSON.parse(localStorage.getItem('pineapple-appraisal-helper-v2'));
    return {baseFirst,first,safetyStrict,safetyExtended,converted,firstWan,edit,second,third,undone,inline,inlineLinkOpened,prediction,history,trialRemoved,storedCount:stored.entries.length,baseUnit:stored.baseUnit};
  })()`);
  check(result.baseFirst&&result.baseUnit==='wan','Base-value placement or unit failed');
  check(result.first.join('|')==='×1.200|3,000元|2/3',`First row: ${JSON.stringify(result.first)}`);
  check(result.safetyStrict.join('|')==='1|已到设定行数，建议收手|按计划收手|建议现在收手'&&result.safetyExtended.join('|')==='可以继续到第 2 行|继续鉴定','Conservative risk guidance or plan selection failed');
  check(result.converted.join('|')==='0.25|3,000元'&&result.firstWan==='3万','Yuan/wan conversion changed the value');
  check(result.edit.join('|')==='1|middle|red|0.7',`Editing a recorded row: ${JSON.stringify(result.edit)}`);
  check(result.second.join('|')==='×0.600|1.5万',`Second row: ${JSON.stringify(result.second)}`);
  check(result.third.join('|')==='×1.200|1/3|2/3',`Fourth-row risk: ${JSON.stringify(result.third)}`);
  check(result.undone==='×0.600'&&result.trialRemoved,'Undo or trial removal failed');
  check(result.inline[0].includes('第 1 行')&&result.inline[1].includes('样本不足')&&result.inline[2].includes('样本不足')&&result.inlineLinkOpened,'Inline sample warning failed');
  check(result.prediction[0].includes('第 1 行')&&result.prediction[1].includes('样本不足')&&result.prediction[2].includes('少于 5 条')&&result.prediction[3].includes('样本 1'),'Historical sample warning failed');
  check(result.history[0]==='2'&&result.history[1]==='1'&&result.history[2]==='1'&&result.history[3].includes('右')&&result.storedCount===2,'Historical storage failed');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const currentCapture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(new URL('preview-current-with-history-390.png',import.meta.url),Buffer.from(currentCapture.data,'base64'));
  for(const view of ['prediction','history']){
    const width=await evaluate(`(()=>{document.getElementById('tab-${view}').click();return document.documentElement.scrollWidth})()`);
    check(width<=390,`${view} page overflows to ${width}px`);
    const capture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(new URL(`preview-${view}-390.png`,import.meta.url),Buffer.from(capture.data,'base64'));
  }
  await cdp('Page.navigate',{url:targetUrl});
  for(let i=0;i<40;i++){if(await evaluate("document.readyState==='complete' && !!document.getElementById('currentOptions')?.children.length"))break;await sleep(100)}
  const persisted=await evaluate("({total:document.getElementById('totalMultiplier').textContent,count:document.getElementById('totalRecords').textContent,recommendation:document.getElementById('recommendedPosition').textContent,base:document.getElementById('baseValue').value,unit:document.getElementById('baseUnit').value,payout:document.getElementById('currentPayout').textContent})");
  check(persisted.total==='×1.000'&&persisted.count==='2'&&persisted.recommendation.includes('样本不足')&&persisted.base==='2.5'&&persisted.unit==='wan'&&persisted.payout==='2.5万','History or base value did not persist after reload');
  console.log('Position/color/factor recording, payout, row rules, undo, reset, prediction, and reload persistence: passed');
  const limit=await evaluate(`(()=>{
    const el=id=>document.getElementById(id);
    for(let row=1;row<=6;row++){
      document.querySelector('[data-position="left"]').click();
      document.querySelector('[data-color="blue"]').click();
      document.querySelector('[data-value="1.2"]').click();
      if(row<6)el('continueBtn').click();
    }
    const ended={count:el('history').children.length,continueDisabled:el('continueBtn').disabled,positionDisabled:document.querySelector('[data-position="left"]').disabled,row:el('rowPill').textContent,next:el('predictionRowLabel').textContent,reward:el('rewardProbability').textContent};
    el('continueBtn').click();document.querySelector('[data-position="right"]').click();
    ended.afterExtraAttempt=el('history').children.length;
    el('undoBtn').click();
    ended.afterUndo={count:el('history').children.length,row:el('rowPill').textContent,positionEnabled:!document.querySelector('[data-position="left"]').disabled};
    return ended;
  })()`);
  check(limit.count===6&&limit.continueDisabled&&limit.positionDisabled&&limit.row.includes('第 6 行')&&limit.next==='本局已结束'&&limit.reward==='—'&&limit.afterExtraAttempt===6&&limit.afterUndo.count===5&&limit.afterUndo.row==='第 6 行'&&limit.afterUndo.positionEnabled,'Six-row forced finish or undo failed');
  console.log('Six-row limit, forced finish, no seventh row, and undo: passed');
  const penalties=await evaluate(`(()=>{
    const el=id=>document.getElementById(id);
    el('resetBtn').click();
    document.querySelector('[data-position="left"]').click();
    document.querySelector('[data-color="red"]').click();
    document.querySelector('[data-value="0.7"]').click();
    const afterOne={stopped:el('continueBtn').disabled,pill:el('rowPill').textContent};
    el('continueBtn').click();
    document.querySelector('[data-position="right"]').click();
    document.querySelector('[data-color="red"]').click();
    document.querySelector('[data-value="0.5"]').click();
    const afterTwo={count:el('history').children.length,stopped:el('continueBtn').disabled,pill:el('rowPill').textContent,message:el('stoppedMessage').textContent,next:el('predictionRowLabel').textContent};
    return {afterOne,afterTwo};
  })()`);
  check(!penalties.afterOne.stopped&&penalties.afterOne.pill.includes('第 1 行')&&penalties.afterTwo.count===2&&penalties.afterTwo.stopped&&penalties.afterTwo.pill.includes('红牌 2 张')&&penalties.afterTwo.message.includes('2 张惩罚牌')&&penalties.afterTwo.next==='本局已结束','Two-penalty forced finish failed');
  await cdp('Page.navigate',{url:targetUrl});
  for(let i=0;i<40;i++){if(await evaluate("document.readyState==='complete' && !!document.getElementById('currentOptions')?.children.length"))break;await sleep(100)}
  const penaltyReload=await evaluate(`(()=>{
    const el=id=>document.getElementById(id);
    const stillStopped=el('continueBtn').disabled&&el('rowPill').textContent.includes('红牌 2 张');
    el('undoBtn').click();
    const reopens=!el('continueBtn').disabled?false:!document.querySelector('[data-position="left"]').disabled&&el('rowPill').textContent.includes('第 2 行');
    return {stillStopped,reopens,count:el('history').children.length};
  })()`);
  check(penaltyReload.stillStopped&&penaltyReload.reopens&&penaltyReload.count===1,'Two-penalty persistence or undo failed');
  const editedPenalty=await evaluate(`(()=>{
    const el=id=>document.getElementById(id);
    document.querySelector('[data-position="right"]').click();
    document.querySelector('[data-color="blue"]').click();
    document.querySelector('[data-value="1.2"]').click();
    const beforeEdit=el('continueBtn').disabled;
    document.querySelector('[data-color="red"]').click();
    return {beforeEdit,afterEdit:el('continueBtn').disabled,message:el('stoppedMessage').textContent,count:el('history').children.length};
  })()`);
  check(!editedPenalty.beforeEdit&&editedPenalty.afterEdit&&editedPenalty.message.includes('2 张惩罚牌')&&editedPenalty.count===2,'Editing current row to second penalty did not end the game');
  console.log('Two-penalty forced finish, reload persistence, and undo: passed');
  const manifest=await (await fetch(new URL('manifest.webmanifest',targetUrl))).json();
  check(manifest.display==='standalone'&&manifest.icons.length===2,'PWA manifest invalid');
  const worker=await evaluate(`Promise.race([
    navigator.serviceWorker.ready.then(registration=>({scope:registration.scope,state:registration.active?.state})),
    new Promise(resolve=>setTimeout(()=>resolve(null),5000))
  ])`);
  check(worker?.state==='activated','Service worker did not activate');
  check(await evaluate('!!navigator.serviceWorker.controller'),'Service worker does not control the page');
  await cdp('Network.enable');
  await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await cdp('Page.navigate',{url:targetUrl});
  let offlineReady=false;
  for(let i=0;i<40;i++){
    offlineReady=await evaluate("document.readyState==='complete' && !!document.getElementById('currentOptions')?.children.length");
    if(offlineReady)break;await sleep(100);
  }
  check(offlineReady,'PWA did not open offline');
  await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:0,uploadThroughput:0});
  console.log('PWA manifest, service worker, and offline opening: passed');
  await evaluate("(()=>{localStorage.removeItem('pineapple-appraisal-helper-v2');localStorage.setItem('pineapple-appraisal-helper-v1',JSON.stringify({rows:[1.2,0.5],awaiting:true,stopped:false,base:'1000'}));return true})()");
  await cdp('Page.navigate',{url:targetUrl});
  for(let i=0;i<40;i++){if(await evaluate("document.readyState==='complete' && !!document.getElementById('currentOptions')?.children.length"))break;await sleep(100)}
  const migration=await evaluate("({total:document.getElementById('totalMultiplier').textContent,base:document.getElementById('baseValue').value,unit:document.getElementById('baseUnit').value,payout:document.getElementById('currentPayout').textContent,records:document.getElementById('totalRecords').textContent,history:document.getElementById('historyList').textContent})");
  check(migration.total==='×0.600'&&migration.base==='1000'&&migration.unit==='yuan'&&migration.payout==='600元'&&migration.records==='0'&&migration.history.includes('旧版未记录'),'Legacy data migration failed');
  console.log('V1 multiplier history migration without invented position/color: passed');
  await evaluate(`(()=>{
    const entries=[];
    const add=(sessionId,row,position,color)=>entries.push({id:sessionId+'-row-'+row,sessionId,row,position,color,multiplier:1,at:Date.now()});
    for(const position of ['left','middle','right'])for(let i=0;i<5;i++){
      const sessionId='matching-'+position+'-'+i+'-1234567890';
      add(sessionId,1,'left','blue');
      add(sessionId,2,position,position==='middle'?i<4?'blue':'red':position==='left'?i===0?'blue':'red':i<2?'blue':'red');
    }
    for(const position of ['left','middle'])for(let i=0;i<5;i++){
      const sessionId='other-'+position+'-'+i+'-1234567890';
      add(sessionId,1,'right','blue');add(sessionId,2,position,position==='left'?'blue':'red');
    }
    for(let i=0;i<15;i++){
      const sessionId='other-middle-blue-'+i+'-1234567890';
      add(sessionId,1,'middle','blue');add(sessionId,2,'middle','blue');
    }
    const sessionId='current-path-1234567890';
    add(sessionId,1,'left','blue');
    localStorage.setItem('pineapple-appraisal-helper-v2',JSON.stringify({version:2,sessionId,entries,awaiting:true,stopped:false,base:'',baseUnit:'yuan',draft:{position:'left',color:'blue',multiplier:1}}));
    return true;
  })()`);
  await cdp('Page.navigate',{url:targetUrl});
  for(let i=0;i<40;i++){if(await evaluate("document.readyState==='complete' && !!document.getElementById('currentOptions')?.children.length"))break;await sleep(100)}
  const conditional=await evaluate(`(()=>{
    const el=id=>document.getElementById(id);
    const exact={condition:el('predictionCondition').textContent,recommendation:el('recommendedPosition').textContent,scope:el('recommendationScope').textContent,cards:el('predictionCards').textContent};
    document.querySelector('[data-position="right"]').click();
    const fallback={recommendation:el('recommendedPosition').textContent,scope:el('recommendationScope').textContent,cards:el('predictionCards').textContent};
    return {exact,fallback};
  })()`);
  check(conditional.exact.condition.includes('第 1 行左蓝')&&conditional.exact.recommendation.includes('中')&&conditional.exact.scope.includes('完整路径')&&conditional.exact.cards.includes('80%'),'Conditional next-row rates or recommendation failed');
  check(conditional.fallback.recommendation.includes('左')&&conditional.fallback.scope.includes('完整路径')&&conditional.fallback.cards.includes('100%'),'Recommendation must match the partially sampled path cards even when overall statistics prefer another position');
  await evaluate(`(()=>{
    const entries=[];
    const add=(sessionId,row,position,color)=>entries.push({id:sessionId+'-row-'+row,sessionId,row,position,color,multiplier:1,at:Date.now()});
    for(let i=0;i<5;i++){
      const exact='exact-session-'+i+'-1234567890';
      add(exact,1,'left','blue');add(exact,2,'middle','blue');add(exact,3,'right','blue');
      const other='previous-session-'+i+'-1234567890';
      add(other,1,'right','blue');add(other,2,'middle','blue');add(other,3,'left','red');
    }
    const sessionId='current-previous-1234567890';
    add(sessionId,1,'left','blue');add(sessionId,2,'middle','blue');
    localStorage.setItem('pineapple-appraisal-helper-v2',JSON.stringify({version:2,sessionId,entries,awaiting:true,stopped:false,base:'',baseUnit:'yuan',draft:{position:'middle',color:'blue',multiplier:1}}));
    return true;
  })()`);
  await cdp('Page.navigate',{url:targetUrl});
  for(let i=0;i<40;i++){if(await evaluate("document.readyState==='complete' && !!document.getElementById('currentOptions')?.children.length"))break;await sleep(100)}
  const previousFallback=await evaluate("({scope:document.getElementById('recommendationScope').textContent,condition:document.getElementById('predictionCondition').textContent,cards:document.getElementById('predictionCards').textContent,choice:document.getElementById('recommendedPosition').textContent})");
  check(previousFallback.scope.includes('上一行条件')&&previousFallback.condition.includes('卡片和推荐均显示上一行条件')&&previousFallback.cards.includes('样本 5')&&previousFallback.choice.includes('右'),'Fallback cards and recommendation must use the same previous-row sample');
  await evaluate(`(()=>{
    const entries=[];
    for(const [position,count,blue] of [['left',82,60],['middle',32,24],['right',20,14]])for(let i=0;i<count;i++){
      const sessionId='sample-weight-'+position+'-'+i+'-1234567890';
      entries.push({id:sessionId+'-row-1',sessionId,row:1,position,color:i<blue?'blue':'red',multiplier:1,at:Date.now()});
    }
    localStorage.setItem('pineapple-appraisal-helper-v2',JSON.stringify({version:2,sessionId:'empty-current-1234567890',entries,awaiting:false,stopped:false,base:'',baseUnit:'yuan',draft:{position:null,color:null,multiplier:null}}));
    return true;
  })()`);
  await cdp('Page.navigate',{url:targetUrl});
  for(let i=0;i<40;i++){if(await evaluate("document.readyState==='complete' && !!document.getElementById('currentOptions')?.children.length"))break;await sleep(100)}
  const sampleWeighted=await evaluate("({choice:document.getElementById('recommendedPosition').textContent,scope:document.getElementById('recommendationScope').textContent,cards:document.getElementById('predictionCards').textContent})");
  check(sampleWeighted.choice.includes('左')&&sampleWeighted.scope.includes('蓝 60 / 样本 82')&&sampleWeighted.cards.includes('75%'),'Larger reliable sample should outrank a tiny raw-rate advantage');
  console.log('Conditional path rates, sample-aware recommendation, and matching fallback cards: passed');
}finally{
  socket?.close();browser.kill();server.close();server.closeAllConnections();
  await sleep(200);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}
process.exit(0);
