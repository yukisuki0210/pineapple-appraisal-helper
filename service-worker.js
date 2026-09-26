const CACHE_NAME = 'pineapple-appraisal-v1';
const ASSETS = ['./','./index.html','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('pineapple-appraisal-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(async response=>{
      if(response.ok){const cache=await caches.open(CACHE_NAME);await cache.put('./index.html',response.clone())}
      return response;
    }).catch(()=>caches.match('./index.html')));
    return;
  }
  if(new URL(event.request.url).pathname.endsWith('/app.js')){
    event.respondWith(fetch(event.request).then(async response=>{
      if(response.ok){const cache=await caches.open(CACHE_NAME);await cache.put(event.request,response.clone())}
      return response;
    }).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy))}
    return response;
  })));
});
