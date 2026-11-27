/* HHgames private room relay, protocol 1. Host runs the game; relay never broadcasts guest moves to other guests. */
const headers={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'};
const reply=(text,status=200)=>new Response(text,{status,headers});
const valid=(s,n=100)=>typeof s==='string'&&s.length<=n&&/^[A-Za-z0-9_-]+$/.test(s);
export default {async fetch(req,env){const u=new URL(req.url);if(u.pathname==='/relay')return reply('hhgames relay ok v1');if(u.pathname==='/health')return reply('HHgames relay protocol 1');const m=u.pathname.match(/^\/room\/((?:G-|T-)?[A-Z2-9]{6,16})$/);if(!m)return reply('HHgames private room relay',404);if(req.headers.get('Upgrade')?.toLowerCase()!=='websocket')return reply('WebSocket required',426);return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);}};
export class Room {
 constructor(ctx){this.ctx=ctx;}
 peers(){return this.ctx.getWebSockets().map(ws=>({ws,...ws.deserializeAttachment()}));}
 emit(ws,msg){try{ws.send(JSON.stringify(msg))}catch{}}
 async fetch(req){const u=new URL(req.url),cid=u.searchParams.get('cid'),token=u.searchParams.get('token'),key=u.searchParams.get('key'),host=u.searchParams.get('host')==='1';if(!valid(cid)||!valid(token)||token.length<20||host&&(!valid(key)||key.length<20))return reply('Invalid credentials',400);
 const [pairClient,server]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(server);server.serializeAttachment({cid,host:false,token,authorized:false});
 // Persist private credentials for reconnect; the public seat IDs alone cannot reclaim seats.
 const auth=await this.ctx.storage.transaction(async tx=>{const oldHost=await tx.get('host'),old=await tx.get('client:'+cid);if(host&&oldHost&&(oldHost.key!==key||oldHost.cid!==cid))return false;if(old&&old!==token)return false;if(!old){const count=await tx.get('count')||0;if(count>=32)return false;await tx.put('count',count+1);await tx.put('client:'+cid,token);}if(host&&!oldHost)await tx.put('host',{key,cid});return true;});
 if(!auth){server.close(4003,'Unauthorized');return new Response(null,{status:101,webSocket:pairClient});}
 for(const p of this.peers())if(p.ws!==server&&p.cid===cid&&p.authorized){p.ws.close(4000,'Replaced');}
 server.serializeAttachment({cid,host,authorized:true});const peers=this.peers().filter(p=>p.ws!==server&&p.authorized&&p.cid!==cid);
 if(host){for(const p of peers.filter(p=>!p.host)){this.emit(server,{sys:'join',cid:p.cid});this.emit(p.ws,{m:{t:'hostback'}});}}
 else {const h=peers.find(p=>p.host);if(h)this.emit(h.ws,{sys:'join',cid});else this.emit(server,{m:{t:'hostgone'}});}
 return new Response(null,{status:101,webSocket:pairClient});}
 webSocketMessage(ws,raw){const a=ws.deserializeAttachment();if(!a?.authorized||typeof raw!=='string'||raw.length>800000)return;if(raw==='ping'){try{ws.send('pong')}catch{}return;}let d;try{d=JSON.parse(raw)}catch{return;}if(!d||typeof d.m!=='object'||!d.m)return;const peers=this.peers().filter(p=>p.authorized&&p.ws!==ws);if(a.host){if(d.to==='*'){for(const p of peers.filter(p=>!p.host))this.emit(p.ws,{m:d.m});}else if(valid(d.to)){const p=peers.find(p=>p.cid===d.to&&!p.host);if(p)this.emit(p.ws,{m:d.m});}}else{const h=peers.find(p=>p.host);if(h)this.emit(h.ws,{from:a.cid,m:d.m});else this.emit(ws,{m:{t:'hostgone'}});}}
 webSocketClose(ws){this.depart(ws)} webSocketError(ws){this.depart(ws)}
 depart(ws){const a=ws.deserializeAttachment();if(!a?.authorized)return;const peers=this.peers().filter(p=>p.ws!==ws&&p.authorized&&p.ws.readyState===1);if(peers.some(p=>p.cid===a.cid))return;if(a.host){for(const p of peers.filter(p=>!p.host))this.emit(p.ws,{m:{t:'hostgone'}});}else{const h=peers.find(p=>p.host);if(h)this.emit(h.ws,{sys:'leave',cid:a.cid});}}
}
