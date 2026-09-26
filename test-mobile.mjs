import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const root=new URL('./dist/',import.meta.url);
const mime={'.html':'text/html; charset=utf-8','.webmanifest':'application/manifest+json','.js':'text/javascript','.png':'image/png'};
const server=createServer(async(req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
  if(!['index.html','manifest.webmanifest','service-worker.js','icon-192.png','icon-512.png','apple-touch-icon.png'].includes(name)){res.writeHead(404).end();return}
  const file=new URL(name,root);
  try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[name.slice(name.lastIndexOf('.'))]||'application/octet-stream'}).end(bytes)}
  catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const profile=await mkdtemp(join(tmpdir(),'pineapple-appraisal-test-'));
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',[
  '--headless=new','--disable-gpu','--disable-gpu-sandbox','--no-sandbox','--no-first-run','--disable-extensions',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,`http://127.0.0.1:${port}/`
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
    await cdp('Page.navigate',{url:`http://127.0.0.1:${port}/`});
    for(let i=0;i<40;i++){if(await evaluate("document.readyState==='complete' && !!document.getElementById('currentOptions')?.children.length"))break;await sleep(100)}
    const dimensions=await evaluate('({viewport:innerWidth,content:document.documentElement.scrollWidth,tabs:document.querySelector(".tabs").getBoundingClientRect().width})');
    check(dimensions.viewport===width,`Viewport is ${dimensions.viewport}, expected ${width}`);
    check(dimensions.content<=width,`${width}px viewport overflows to ${dimensions.content}px`);
    const capture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(new URL(`preview-${width}.png`,import.meta.url),Buffer.from(capture.data,'base64'));
    console.log(`Mobile ${width}px: no horizontal overflow; screenshot preview-${width}.png`);
  }
  const result=await evaluate(`(()=>{
    const el=id=>document.getElementById(id);
    el('baseValue').value='1000';el('baseValue').dispatchEvent(new Event('input'));
    document.querySelector('[data-value="1.2"]').click();
    const first=[el('totalMultiplier').textContent,el('currentPayout').textContent,el('rewardProbability').textContent];
    el('continueBtn').click();document.querySelector('[data-value="0.5"]').click();
    const second=[el('totalMultiplier').textContent,el('currentPayout').textContent];
    el('continueBtn').click();document.querySelector('[data-value="2"]').click();
    const third=[el('totalMultiplier').textContent,el('rewardProbability').textContent,el('penaltyProbability').textContent];
    el('undoBtn').click();
    const undone=el('totalMultiplier').textContent;
    document.getElementById('tab-trial').click();
    const trialVisible=document.getElementById('view-trial').classList.contains('active');
    el('trialBase').value='1000';el('trialBase').dispatchEvent(new Event('input'));
    el('trialMultiplier').value='2';el('trialMultiplier').dispatchEvent(new Event('input'));
    const trial=el('trialPayout').textContent;
    el('resetBtn').click();
    return {first,second,third,undone,trialVisible,trial};
  })()`);
  check(result.first.join('|')==='×1.200|1,200|2/3',`First row: ${JSON.stringify(result.first)}`);
  check(result.second.join('|')==='×0.600|600',`Second row: ${JSON.stringify(result.second)}`);
  check(result.third.join('|')==='×1.200|1/3|2/3',`Fourth-row risk: ${JSON.stringify(result.third)}`);
  check(result.undone==='×0.600'&&result.trialVisible&&result.trial==='2,000','Undo, tab, or trial failed');
  console.log('Appraisal, payout, row probability, undo, tab switch, and trial: passed');
  const manifest=await (await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`)).json();
  check(manifest.display==='standalone'&&manifest.icons.length===2,'PWA manifest invalid');
  const worker=await evaluate(`Promise.race([
    navigator.serviceWorker.ready.then(registration=>({scope:registration.scope,state:registration.active?.state})),
    new Promise(resolve=>setTimeout(()=>resolve(null),5000))
  ])`);
  check(worker?.state==='activated','Service worker did not activate');
  console.log('PWA manifest and service worker: passed');
}finally{
  socket?.close();browser.kill();server.close();
  await sleep(200);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}
