import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:20*1024*1024});
const ref=process.argv[2]||'HEAD';
const forbidden=/(^|\/)(\.private|\.openai|sfu-grid|\.pnpm-store|node_modules|data\/raw)(\/|$)|(^|\/)(meter-registry\.json|\.env[^/]*|\.dev\.vars[^/]*|[^/]*\.(pem|key))$/;
let secrets=[], ids=[];
if(fs.existsSync('.private/foreseer.json')) {
  const config=JSON.parse(fs.readFileSync('.private/foreseer.json','utf8'));
  secrets=[new URL(config.baseUrl).hostname,...config.meters.map(m=>m.device)].filter(s=>s?.length>4);
  ids=config.meters.map(m=>m.channelId);
}
const checked=new Set();
const commits=git('rev-list',ref).trim().split('\n').filter(Boolean);
for(const commit of commits) {
  const entries=git('ls-tree','-r','-z',commit).split('\0').filter(Boolean);
  for(const entry of entries) {
    const [metadata,file]=entry.split('\t');
    assert(!forbidden.test(file),`Private path in public history: ${file}`);
    const [mode,type,sha]=metadata.split(' ');
    assert(type==='blob'&&mode!=='120000',`Unexpected linked content in public history: ${file}`);
    if(checked.has(sha))continue;
    checked.add(sha);
    const bytes=execFileSync('git',['cat-file','blob',sha],{maxBuffer:20*1024*1024}),text=bytes.toString('utf8');
    for(const secret of secrets)assert(!text.includes(secret),`Known private source value in public history: ${file}`);
    assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,}/.test(text),`Credential pattern in public history: ${file}`);
    for(const id of ids)assert(!new RegExp('channelId["\\\']?\\s*:\\s*'+id+'\\b').test(text),`Private channel mapping in public history: ${file}`);
  }
}
console.log(`Checked ${commits.length} public commits and ${checked.size} unique source files; no forbidden paths or known private source values found.`);
