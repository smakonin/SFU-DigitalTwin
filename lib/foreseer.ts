import {parseReading,type EnergyResponse} from './energy.ts';
export type MeterConfig={channelId:number;device:string;buildingCode:string|null};
export type ForeseerConfig={baseUrl:string;meters:MeterConfig[]};
export function validateConfig(value:unknown):ForeseerConfig {
 if(!value||typeof value!=='object')throw Error('Private configuration is missing');
 const c=value as ForeseerConfig;const url=new URL(c.baseUrl);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!Array.isArray(c.meters))throw Error('Invalid private configuration');
 if(c.meters.length>1000||!c.meters.every(m=>Number.isSafeInteger(m.channelId)&&m.channelId>0&&typeof m.device==='string'&&(m.buildingCode===null||/^\d{3}$/.test(m.buildingCode))))throw Error('Invalid private meter registry');
 return {baseUrl:url.origin,meters:c.meters};
}
export async function readBuilding(config:ForeseerConfig,code:string,read:typeof fetch=fetch):Promise<EnergyResponse>{
 const meters=config.meters.filter(m=>m.buildingCode===code),readings=[];let failures=0;
 if(!meters.length)return {status:'unmapped',buildingCode:code,observedAt:new Date().toISOString(),readings:[],message:'No private meter mapping is configured for this building.',source:'Private operational service'};
 for(let i=0;i<meters.length;i+=4){
  const batch=await Promise.all(meters.slice(i,i+4).map(async m=>{
   try{const url=config.baseUrl+'/React/processCommands.py?folder=WebViews/getchannelproperties.command?id='+m.channelId;
    const r=await read(url,{signal:AbortSignal.timeout(6000),redirect:'manual'});if(!r.ok)throw Error('Source unavailable');
    const d=await r.json() as {channelProperties?:Record<string,unknown>};if(!d.channelProperties)throw Error('Unexpected source response');
    return parseReading(m.channelId,m.device,d.channelProperties,new Date().toISOString());
   }catch{return null;}
  }));for(const r of batch){if(r)readings.push(r);else failures++;}
 }
 return {status:readings.length?(failures?'partial':'connected'):'unavailable',buildingCode:code,observedAt:new Date().toISOString(),readings,source:'Private operational service',message:readings.length?'Source sample timestamps are not provided. Meter coverage is unverified; do not sum.':'The private source is unreachable. Check the approved network connection.'};
}
