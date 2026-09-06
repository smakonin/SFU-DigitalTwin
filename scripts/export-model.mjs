import fs from 'node:fs/promises';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {createCampusModel} from '../lib/model.ts';
// Browser FileReader equivalent for the binary exporter; no external services.
globalThis.FileReader=class{
 readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}
 readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result='data:'+blob.type+';base64,'+Buffer.from(result).toString('base64');this.onloadend?.();});}
};
const data=JSON.parse(await fs.readFile('public/data/campus.json','utf8'));
const terrain=JSON.parse(await fs.readFile('public/data/terrain.json','utf8'));
const {root}=createCampusModel(data,terrain);
root.traverse(o=>{if(o.userData.decoration)o.visible=false;});
const result=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true});
await fs.writeFile('public/data/sfu-burnaby.glb',Buffer.from(result));
console.log(`Exported ${result.byteLength.toLocaleString()} bytes. EPSG:26910 origin ${data.origin.join(', ')}. Textures omitted; geometry and source metadata retained.`);
