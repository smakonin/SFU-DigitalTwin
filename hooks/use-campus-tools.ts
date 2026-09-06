'use client';
import {useEffect} from 'react';
import type {Campus} from '@/lib/campus-types';
type Tool={name:string;description:string;inputSchema:object;annotations:object;execute:(input:unknown)=>unknown};
export function useCampusTools(campus:Campus|null,select:(id:string)=>void){
 useEffect(()=>{
  const context=(document as Document&{modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>unknown}}).modelContext;
  if(!campus||!context?.registerTool)return;const life=new AbortController();
  const tools:Tool[]=[{name:'list_campus_buildings',description:'List SFU building IDs, names, official codes in this campus model.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>campus.buildings.filter(b=>b.source==='sfu').map(b=>({id:b.id,name:b.name,code:b.buildingCode}))},{name:'select_campus_building',description:'Select a known campus feature in the visible model and inspector.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async(input)=>{if(!input||typeof input!=='object'||!('id'in input)||typeof input.id!=='string')throw Error('A campus feature id is required');const b=campus.buildings.find(b=>b.id===input.id);if(!b)throw Error('Unknown campus feature');select(b.id);await new Promise(requestAnimationFrame);return{id:b.id,name:b.name,buildingCode:b.buildingCode,action:'selected'};}}];
  for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:life.signal})).catch(()=>{});}catch{}}
  return()=>life.abort();
 },[campus,select]);
}
