export type Reading = {channelId:number;device:string;name:string;value:number|null;unit:string;state:string;quality:'normal'|'flagged'|'unavailable';observedAt:string;sampledAt:null};
export type EnergyResponse = {status:'connected'|'partial'|'unavailable'|'unmapped';buildingCode:string;observedAt:string;readings:Reading[];message:string;source:string};
export function parseReading(channelId:number,expectedDevice:string,p:Record<string,unknown>,observedAt:string):Reading {
 const raw=typeof p.value==='string'?p.value.trim():p.value;
 const numeric=(typeof raw==='string' && raw!=='' && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(raw)) || typeof raw==='number';
 const parsed=numeric?Number(raw):NaN;
 const matching=p.device===expectedDevice && p.name==='M_kW Total' && p.units==='kW';
 const value=Number.isFinite(parsed)&&Math.abs(parsed)<1e9&&matching?parsed:null;
 const state=typeof p.state==='string'?p.state:'Unknown';
 const normal=state==='Normal' && p.disabled!=='1' && matching;
 return {channelId,device:expectedDevice,name:'M_kW Total',value,unit:'kW',state:matching?state:'Mapping or units need review',quality:value===null?'unavailable':normal?'normal':'flagged',observedAt,sampledAt:null};
}
