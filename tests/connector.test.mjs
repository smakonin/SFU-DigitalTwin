import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createConnector} from '../scripts/connector-server.mjs';
const origin='https://viewer.example', otherOrigin='https://second.example';
const fixture={status:'connected',buildingCode:'004',observedAt:'2026-09-06T00:00:00Z',readings:[],message:'Synthetic test response',source:'Test only'};
async function setup(t, options={}) {
  let clock=Date.parse('2026-09-06T00:00:00Z'), calls=0;
  const connector=createConnector({config:{baseUrl:'http://source.invalid',meters:[]},allowedOrigins:[origin,otherOrigin],now:()=>clock,read:async()=>{calls++;return fixture;},...options});
  const base=await connector.listen(0);t.after(()=>connector.close());
  const request=(path,init={})=>fetch(base+path,{...init,headers:{Origin:origin,...init.headers}});
  const code=async()=>{const text=await(await fetch(base+'/')).text();return text.match(/id="code" readonly value="([^"]+)"/)[1];};
  const pair=async(value)=>{value ??= await code();const r=await request('/v1/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:value})});return {r,...await r.json()};};
  return {base,request,code,pair,calls:()=>calls,advance:ms=>{clock+=ms;}};
}
test('operational endpoint requires both an allowed origin and a paired session',async t=>{
  const s=await setup(t);
  const noAuth=await s.request('/v1/energy?code=004');assert.equal(noAuth.status,401);assert.equal(s.calls(),0);
  for(const bad of ['https://untrusted.example','null','']){const r=await s.request('/v1/energy?code=004',{headers:{Origin:bad}});assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);}
  const rebind=await new Promise((resolve,reject)=>{const req=http.get(s.base+'/v1/energy?code=004',{headers:{Host:'untrusted.example',Origin:origin}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(rebind,403);
  const privatePage=await s.request('/');assert.equal(privatePage.status,403);
  const page=await fetch(s.base+'/');assert.equal(page.headers.get('cache-control'),'no-store');assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
});
test('CORS preflight permits only the intended methods and headers',async t=>{
  const s=await setup(t);
  const preflight=await s.request('/v1/energy',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization','Access-Control-Request-Private-Network':'true'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);assert.equal(preflight.headers.get('access-control-allow-private-network'),'true');assert.equal(preflight.headers.get('access-control-allow-credentials'),null);
  assert.equal((await s.request('/v1/energy',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST'}})).status,403);
  assert.equal((await s.request('/v1/energy',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'x-unexpected'}})).status,403);
});
test('pairing is single-use, origin-bound, revocable and never cached',async t=>{
  const s=await setup(t), code=await s.code();
  const session=await s.pair(code);assert.equal(session.r.status,201);assert.equal(session.r.headers.get('cache-control'),'no-store');assert(session.token);
  assert.equal((await s.pair(code)).r.status,401);
  const headers={Authorization:'Bearer '+session.token};
  const live=await s.request('/v1/energy?code=004',{headers});assert.equal(live.status,200);assert.deepEqual(await live.json(),fixture);assert.equal(live.headers.get('cache-control'),'no-store');
  assert.equal((await s.request('/v1/energy?code=004',{headers:{...headers,Origin:otherOrigin}})).status,401);
  assert.equal((await s.request('/v1/session',{method:'DELETE',headers})).status,204);
  assert.equal((await s.request('/v1/energy?code=004',{headers})).status,401);
});
test('expired pairing codes and sessions stop access',async t=>{
  const s=await setup(t,{pairingLifetimeMs:1000,sessionLifetimeMs:2000});
  const code=await s.code();s.advance(1001);assert.equal((await s.pair(code)).r.status,401);
  const session=await s.pair();assert.equal(session.r.status,201);s.advance(2001);
  assert.equal((await s.request('/v1/energy?code=004',{headers:{Authorization:'Bearer '+session.token}})).status,401);
});
test('reads are cached and clients cannot choose internal targets or write commands',async t=>{
  const s=await setup(t), session=await s.pair(), headers={Authorization:'Bearer '+session.token};
  for(let i=0;i<2;i++)assert.equal((await s.request('/v1/energy?code=004',{headers})).status,200);
  assert.equal(s.calls(),1);s.advance(60_001);await s.request('/v1/energy?code=004',{headers});assert.equal(s.calls(),2);
  for(const query of ['code=004&url=http://untrusted.example','code=004&channelId=1','code=004&code=005','code=../',''])assert.equal((await s.request('/v1/energy?'+query,{headers})).status,400);
  assert.equal((await s.request('/v1/energy?code=004',{method:'POST',headers})).status,405);
  assert.equal((await s.request('/.private/foreseer.json',{headers})).status,404);
});
test('pairing attempts are bounded',async t=>{
  const s=await setup(t);
  for(let i=0;i<8;i++)assert.equal((await s.pair('invalid')).r.status,401);
  assert.equal((await s.pair()).r.status,429);s.advance(60_001);assert.equal((await s.pair()).r.status,201);
});
test('disconnect suppresses an in-flight private response',async t=>{
  let complete,started;const ready=new Promise(resolve=>{started=resolve;});
  const s=await setup(t,{read:async()=>{started();return new Promise(resolve=>{complete=()=>resolve(fixture);});}});
  const session=await s.pair(),headers={Authorization:'Bearer '+session.token};
  const reading=s.request('/v1/energy?code=004',{headers});await ready;
  await s.request('/v1/session',{method:'DELETE',headers});complete();assert.equal((await reading).status,401);
});
test('local relay page permits only approved viewers and same-origin authenticated reads',async t=>{
  const s=await setup(t), nonce='12345678-1234-1234-1234-123456789abc';
  const page=await fetch(s.base+'/relay?viewer='+encodeURIComponent(origin)+'&nonce='+nonce);assert.equal(page.status,200);assert.equal(page.headers.get('access-control-allow-origin'),null);
  assert.equal((await fetch(s.base+'/relay?viewer=https://untrusted.example&nonce='+nonce)).status,403);
  const session=await s.request('/v1/session',{method:'POST',headers:{Origin:s.base,'Content-Type':'application/json'},body:JSON.stringify({code:await s.code()})});assert.equal(session.status,201);const {token}=await session.json();
  const headers={Authorization:'Bearer '+token,'Sec-Fetch-Site':'same-origin'};
  assert.equal((await fetch(s.base+'/v1/energy?code=004',{headers})).status,200);
  assert.equal((await s.request('/v1/energy?code=004',{headers:{Authorization:'Bearer '+token}})).status,401);
});
test('ChargePoint setup is local-only, CSRF protected, and never reads back stored credentials',async t=>{
  let saved=null;
  const charging={configured:()=>!!saved,save:value=>{saved=value;},getSnapshot:async()=>({status:'not_configured',stations:[]})};
  const s=await setup(t,{charging});
  assert.equal((await s.request('/chargepoint/setup')).status,403);
  const response=await fetch(s.base+'/chargepoint/setup'),page=await response.text();assert.equal(response.headers.get('access-control-allow-origin'),null);
  const csrf=page.match(/'X-Connector-Setup':"([^"]+)"/)[1];
  const payload={licenseKey:'synthetic-key',password:'synthetic-private-password',version:'5.1'};
  const init={method:'POST',headers:{Origin:s.base,'Content-Type':'application/json','X-Connector-Setup':csrf},body:JSON.stringify(payload)};
  assert.equal((await fetch(s.base+'/chargepoint/setup',{...init,headers:{...init.headers,Origin:origin}})).status,403);
  assert.equal((await fetch(s.base+'/chargepoint/setup',{...init,headers:{...init.headers,'X-Connector-Setup':'wrong'}})).status,403);
  const result=await fetch(s.base+'/chargepoint/setup',init);assert.equal(result.status,200);assert.deepEqual(saved,payload);
  assert(!JSON.stringify(await result.json()).includes(payload.password));assert(!(await(await fetch(s.base+'/chargepoint/setup')).text()).includes(payload.password));
});
test('charging reads require pairing, reject arbitrary targets and suppress disconnected responses',async t=>{
  let reads=0,complete,started;
  const ready=new Promise(resolve=>{started=resolve;});
  const charging={getSnapshot:async()=>{reads++;return {status:'connected',stations:[]};},getStation:async()=>{started();return new Promise(resolve=>{complete=()=>resolve({station:null});});}};
  const s=await setup(t,{charging});
  assert.equal((await s.request('/v1/charging')).status,401);assert.equal(reads,0);
  const session=await s.pair(),headers={Authorization:'Bearer '+session.token};
  assert.equal((await s.request('/v1/charging',{headers})).status,200);
  assert.equal((await s.request('/v1/charging?url=https://attacker.example',{headers})).status,400);
  assert.equal((await s.request('/v1/charging/station?id=1:999999',{headers})).status,400);
  assert.equal((await s.request('/v1/charging',{method:'POST',headers})).status,405);
  const request=s.request('/v1/charging/station?id=ev-'+'a'.repeat(24),{headers});await ready;
  await s.request('/v1/session',{method:'DELETE',headers});complete();assert.equal((await request).status,401);
});

test('charging routes permit only fixed campus scopes, retaining legacy Burnaby requests',async t=>{
  const calls=[],id='ev-'+'a'.repeat(24);
  const charging={getSnapshot:async campus=>{calls.push(campus);return {stations:[]};},getStation:async(station,campus)=>{calls.push([station,campus]);return {station:null};}};
  const s=await setup(t,{charging}),session=await s.pair(),headers={Authorization:'Bearer '+session.token};
  for(const query of ['', '?campus=vancouver','?campus=surrey'])assert.equal((await s.request('/v1/charging'+query,{headers})).status,200);
  assert.deepEqual(calls,['burnaby','vancouver','surrey']);
  assert.equal((await s.request('/v1/charging/station?id='+id+'&campus=surrey',{headers})).status,200);
  assert.deepEqual(calls[3],[id,'surrey']);
  for(const query of ['campus=','campus=other','campus=__proto__','campus=surrey&campus=burnaby','campus=surrey&url=bad','id='+id])assert.equal((await s.request('/v1/charging?'+query,{headers})).status,400);
  for(const query of ['campus=surrey','id='+id+'&campus=other','id='+id+'&id='+id])assert.equal((await s.request('/v1/charging/station?'+query,{headers})).status,400);
  assert.equal(calls.length,4);
});
