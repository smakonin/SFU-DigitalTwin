import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const node=process.execPath, children=new Set();
let stopping=false;
function run(args) {const child=spawn(node,args,{stdio:'inherit'});children.add(child);child.on('exit',()=>children.delete(child));return child;}
function stop(code=0) {if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');process.exitCode=code;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
async function step(args) {await new Promise((resolve,reject)=>{const child=run(args);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Startup step failed.')));});}
try {
  await step(['node_modules/vite/bin/vite.js','build','--config','vite.github.config.ts']);
  await step(['scripts/check-public-release.mjs']);
  if(!stopping) {
    const services=[run(['--experimental-strip-types','scripts/start-connector.mjs']),run(['node_modules/vite/bin/vite.js','preview','--config','vite.github.config.ts','--host','127.0.0.1','--port','4173','--strictPort'])];
    for(const service of services){service.on('error',()=>stop(1));service.on('exit',code=>{if(!stopping)stop(code||0);});}
  }
} catch {console.error('Local twin could not start. Review the message above.');stop(1);}
