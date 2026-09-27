import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chargePointPrivateValues} from './private-release-values.mjs';
const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['public','dist-pages'];
const forbiddenKeys = new Set(['meters','channelId','device','readings','observedAt','sampledAt','baseUrl','token','mappedBuildings','powerChannels','licenseKey','password','credentialID','sessionID','userID','driverEmail','powerKw','inSession']);
function checkKeys(value, file) {
  if (!value || typeof value !== 'object') return;
  for (const [key,item] of Object.entries(value)) {assert(!forbiddenKeys.has(key), `Operational field found in ${file}: ${key}`);checkKeys(item,file);}
}
let secrets=[];
if(fs.existsSync('.private/foreseer.json')) {
  const privateConfig=JSON.parse(fs.readFileSync('.private/foreseer.json','utf8'));
  const url=new URL(privateConfig.baseUrl);
  secrets=[url.hostname,...privateConfig.meters.map(m=>m.device)].filter(s=>s?.length>4);
}
secrets.push(...chargePointPrivateValues());
let count=0;
function inspect(file) {
  const bytes=fs.readFileSync(file), text=bytes.toString('utf8');
  for(const secret of secrets) assert(!text.includes(secret),`Private source value found in ${file}`);
  assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,}/.test(text),`Credential pattern found in ${file}`);
  if(file.endsWith('.json')) checkKeys(JSON.parse(text),file);
  if(file.endsWith('.glb')) {
    assert.equal(bytes.readUInt32LE(0),0x46546c67,'Invalid GLB');
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());checkKeys(json,file);
  }
  count++;
}
function walk(dir) {
  assert(fs.existsSync(dir),`Build output missing: ${dir}`);
  for(const item of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,item.name);
    assert(!/(^|\/)(\.private|sfu-grid|\.git|\.env[^/]*|meter-registry\.json)(\/|$)/.test(file),`Private path found in ${file}`);
    assert(!item.isSymbolicLink(),`Unexpected symlink in ${file}`);
    if(item.isDirectory())walk(file);else{assert(!file.endsWith('.map'),`Source map in ${file}`);inspect(file);}
  }
}
roots.forEach(walk);
console.log(`Checked ${count} public artifact files: no operational fields, known private source values, or credential patterns found.`);
