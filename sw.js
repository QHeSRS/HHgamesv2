/* HHgames mini offline v1.23.5: single-page four-game app */
const CACHE='hhgames-mini-v1.23.5';
const FILES=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const full=p=>new URL(p,self.registration.scope).href;
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);for(const f of FILES){const r=await fetch(new Request(full(f),{cache:'reload'}));if(!r.ok)throw new Error('missing '+f+' '+r.status);await c.put(full(f),r.clone())}await self.skipWaiting()})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{await self.clients.claim();const ks=await caches.keys();await Promise.all(ks.filter(k=>k.startsWith('hhgames-mini-')&&k!==CACHE).map(k=>caches.delete(k)))})()));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url),scope=new URL(self.registration.scope);if(r.method!=='GET'||u.origin!==scope.origin||!u.pathname.startsWith(scope.pathname))return;e.respondWith((async()=>{const c=await caches.open(CACHE),isPage=r.mode==='navigate'||u.pathname===scope.pathname||u.pathname===scope.pathname+'index.html',key=isPage?full('./index.html'):r;const hit=await c.match(key,{ignoreSearch:true});if(hit)return hit;try{const res=await fetch(r);if(res.ok)e.waitUntil(c.put(key,res.clone()).catch(()=>{}));return res}catch(e){return Response.error()}})())});
