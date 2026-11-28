/* HHgames release: update VERSION and manifest hhgames_version together. */
const VERSION='1.36.4';
const SCOPE=new URL(self.registration.scope);
const PREFIX='hhgames-release-'+encodeURIComponent(SCOPE.pathname)+'-';
const CACHE=PREFIX+VERSION;
const FILES=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const url=p=>new URL(p,SCOPE).href;
async function fresh(p){const r=await fetch(new Request(url(p),{cache:'no-store',credentials:'same-origin'}));if(!r.ok)throw Error('HTTP '+r.status+' '+p);return r;}
async function installRelease(){
 const c=await caches.open(CACHE);
 // Validate the two release markers before publishing a complete offline package.
 const manifest=await fresh('./manifest.webmanifest');
 if((await manifest.clone().json()).hhgames_version!==VERSION)throw Error('Manifest version mismatch');
 const page=await fresh('./index.html');
 const html=await page.clone().text();
 if(!html.includes('<meta name="hhgames-version" content="'+VERSION+'">'))throw Error('HTML version mismatch');
 const icons=await Promise.all(FILES.slice(3).map(fresh));
 if(icons.some(r=>!/^image\//i.test(r.headers.get('content-type')||'')))throw Error('Invalid icon response');
 await Promise.all([c.put(url('./'),page.clone()),c.put(url('./index.html'),page),c.put(url('./manifest.webmanifest'),manifest),...icons.map((r,i)=>c.put(url(FILES[i+3]),r))]);
 if(!(await Promise.all(FILES.map(p=>c.match(url(p))))).every(Boolean))throw Error('Incomplete cache');
}
self.addEventListener('install',e=>e.waitUntil((async()=>{await installRelease();await self.skipWaiting()})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 await self.clients.claim();
 // Keep the active release; clean only superseded caches owned by this scope.
 const c=await caches.open(CACHE);if((await Promise.all(FILES.map(p=>c.match(url(p))))).every(Boolean)){
  for(const k of await caches.keys())if(k.startsWith(PREFIX)&&k!==CACHE)await caches.delete(k);
 }
})()));
let repairTask=null;
self.addEventListener('message',e=>{if(!e.ports[0])return;
 if(e.data?.type==='HH_RELEASE_STATUS')e.waitUntil((async()=>{const c=await caches.open(CACHE);const n=(await Promise.all(FILES.map(p=>c.match(url(p))))).filter(Boolean).length;e.ports[0].postMessage({version:VERSION,cached:n,total:FILES.length})})());
 if(e.data?.type==='HH_REPAIR_RELEASE'&&e.data.version===VERSION)e.waitUntil((async()=>{try{if(!repairTask)repairTask=installRelease().finally(()=>repairTask=null);await repairTask;e.ports[0].postMessage({ok:true})}catch(err){e.ports[0].postMessage({ok:false,error:String(err.message||err)})}})());
});
async function networkPage(r){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
 try{const net=await fetch(r,{cache:'no-store',signal:controller.signal});if(net.ok)return net;throw Error('HTTP '+net.status)}finally{clearTimeout(timer)}
}
self.addEventListener('fetch',e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==SCOPE.origin||!u.href.startsWith(SCOPE.href))return;
 // Release probes must go directly to the network, never the offline cache.
 if(u.pathname===new URL('./manifest.webmanifest',SCOPE).pathname&&u.searchParams.has('hh-check'))return;
 const known=FILES.some(p=>url(p)===u.href);
 if(r.mode==='navigate'&&(u.pathname===SCOPE.pathname||u.pathname===new URL('./index.html',SCOPE).pathname)){
  e.respondWith((async()=>{try{return await networkPage(r)}catch(_){const c=await caches.open(CACHE);return await c.match(url('./index.html'))||Response.error()}})());return;
 }
 if(known)e.respondWith((async()=>{const c=await caches.open(CACHE);return await c.match(r)||fetch(r,{cache:'no-store'})})());
});
