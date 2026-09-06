export function relayPage(viewerOrigin, nonce, scriptNonce) {
  const settings=JSON.stringify({viewerOrigin,nonce}).replaceAll('<','\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SFU · Live connection window</title><style nonce="${scriptNonce}">body{margin:0;background:#111f29;color:#e7eff2;font:16px/1.6 system-ui}main{padding:30px;max-width:500px;margin:auto}h1{font-size:26px}p{color:#b1c4ce}button{background:#a6192e;color:white;font:inherit;border:0;border-radius:5px;padding:12px 18px;cursor:pointer}code{overflow-wrap:anywhere}</style></head><body><main><p>SFU CAMPUS TWIN</p><h1>Private live connection</h1><p id="status" role="status">Pairing with your campus viewer…</p><p>Minimize this window and return to your campus viewer. Keep this window open while using live data.</p><p>Connected website: <code id="viewer"></code></p><button id="disconnect">Disconnect and close</button></main><script nonce="${scriptNonce}">
const {viewerOrigin,nonce}=${settings};
const owner=window.opener,status=document.getElementById('status');document.getElementById('viewer').textContent=viewerOrigin;
let session=null;
const reply=(id,result,error)=>{if(owner&&!owner.closed)owner.postMessage({type:'sfu-relay-response',nonce,id,result,error},viewerOrigin);};
async function request(path,init={}){const r=await fetch(path,{...init,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(30000)});if(!r.ok){const error=Error(r.status===401?'Pairing code or session is invalid, expired or already used.':'The local connector could not complete the request.');error.status=r.status;throw error;}return r.status===204?null:r.json();}
async function disconnect(){const prior=session;session=null;if(prior)try{await request('/v1/session',{method:'DELETE',headers:{Authorization:'Bearer '+prior.token}});}catch{}}
window.addEventListener('message',async event=>{
 if(event.origin!==viewerOrigin||event.source!==owner)return;const d=event.data;
 if(!d||d.type!=='sfu-relay-request'||d.nonce!==nonce||typeof d.id!=='string')return;
 try{
  if(d.operation==='pair'){
   if(session)throw Error('Already paired.');
   session=await request('/v1/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:d.code})});
   status.textContent='Paired. Live readings travel through this window to your campus viewer.';reply(d.id,{expiresAt:session.expiresAt});
  }else if(d.operation==='read'){
   if(!session){const error=Error('Local session ended.');error.status=401;throw error;}
   if(typeof d.code!=='string'||!/^\u005cd{3}$/.test(d.code))throw Error('Invalid building code.');
   const result=await request('/v1/energy?code='+d.code,{headers:{Authorization:'Bearer '+session.token}});reply(d.id,result);
  }else if(d.operation==='disconnect'){await disconnect();reply(d.id,{disconnected:true});window.close();}
  else throw Error('Unknown request.');
 }catch(error){reply(d.id,null,{message:error.message,status:error.status||0});}
});
document.getElementById('disconnect').onclick=async()=>{await disconnect();if(owner&&!owner.closed)owner.postMessage({type:'sfu-relay-ended',nonce},viewerOrigin);window.close();};
window.addEventListener('pagehide',()=>{if(session)fetch('/v1/session',{method:'DELETE',headers:{Authorization:'Bearer '+session.token},keepalive:true}).catch(()=>{});});
if(owner)owner.postMessage({type:'sfu-relay-ready',nonce},viewerOrigin);else status.textContent='Open this connection window using Pair this tab in the campus viewer.';
</script></body></html>`;
}
