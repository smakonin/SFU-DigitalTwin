import test from 'node:test';
import assert from 'node:assert/strict';
import {readBuilding,validateConfig} from '../lib/foreseer.ts';
const config={baseUrl:'http://source.invalid',meters:[{buildingCode:'004',device:'Synthetic meter',channelId:1}]};
test('source reads remain read-only and missing source data are explicit',async()=>{
  let called=false;
  const result=await readBuilding(config,'004',async(url,options)=>{called=true;assert.equal(url,'http://source.invalid/React/processCommands.py?folder=WebViews/getchannelproperties.command?id=1');assert.equal(options.redirect,'manual');assert.equal(options.method,undefined);return Response.json({channelProperties:{value:'12.5',device:'Synthetic meter',name:'M_kW Total',units:'kW',state:'Normal',disabled:'0'}});});
  assert(called);assert.equal(result.readings[0].value,12.5);assert.equal(result.readings[0].sampledAt,null);
  const failed=await readBuilding(config,'004',async()=>{throw Error('Private network detail that must not be returned');});assert.equal(failed.status,'unavailable');assert(!JSON.stringify(failed).includes('Private network detail'));
  const unmapped=await readBuilding(config,'999',async()=>{throw Error('Should not fetch');});assert.equal(unmapped.status,'unmapped');
});
test('private config rejects embedded credentials and invalid channel mappings',()=>{
  for(const baseUrl of ['file:///tmp/private','http://user:password@source.invalid','http://source.invalid?secret=x'])assert.throws(()=>validateConfig({...config,baseUrl}));
  assert.throws(()=>validateConfig({...config,meters:[{buildingCode:'not-a-code',device:'Synthetic',channelId:1}]}));
});
