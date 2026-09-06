import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {relayPage} from '../scripts/relay-page.mjs';
const origin='https://viewer.example',nonce='12345678-1234-1234-1234-123456789abc';
function setup(){
  const messages=[],calls=[],handlers={},nodes=new Map();
  const owner={closed:false,postMessage:(data,target)=>messages.push({data,target})};
  const window={opener:owner,addEventListener:(name,handler)=>{handlers[name]=handler;},close:()=>{}};
  const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
  const fetch=async(path,init)=>{calls.push({path,init});return {ok:true,status:200,json:async()=>path==='/v1/session'?{token:'private-test-bearer',expiresAt:'2026-09-06T23:00:00Z'}:{status:'connected',readings:[]}};};
  const html=relayPage(origin,nonce,'script-nonce');const script=html.match(/<script nonce="script-nonce">([\s\S]+)<\/script>/)[1];
  vm.runInNewContext(script,{window,document,fetch,AbortSignal,console});
  const message=(operation,extra={},source=owner,from=origin)=>handlers.message({origin:from,source,data:{type:'sfu-relay-request',nonce,id:'test-id',operation,...extra}});
  return {messages,calls,owner,message};
}
test('relay refuses messages from another origin, another window or another nonce',async()=>{
  const r=setup();assert.equal(r.messages[0].target,origin);
  await r.message('pair',{code:'test'},r.owner,'https://attacker.example');
  await r.message('pair',{code:'test'},{},origin);
  await r.message('pair',{code:'test',nonce:'different'});
  assert.equal(r.calls.length,0);assert.equal(r.messages.length,1);
});
test('relay keeps bearer token in the local window and sends results only to its opener',async()=>{
  const r=setup();await r.message('pair',{code:'test'});
  assert.equal(r.calls[0].path,'/v1/session');assert(!JSON.stringify(r.messages).includes('private-test-bearer'));
  await r.message('read',{code:'004'});
  assert.equal(r.calls[1].path,'/v1/energy?code=004');assert.equal(r.calls[1].init.headers.Authorization,'Bearer private-test-bearer');
  assert(r.messages.every(m=>m.target===origin));
  await r.message('read',{code:'004&url=bad'});assert.equal(r.calls.length,2);
  await r.message('disconnect');assert.equal(r.calls[2].init.method,'DELETE');
});
