'use client';
import {useEffect,useState,useRef} from 'react';
import {Radio,RefreshCw,WifiOff,Zap} from 'lucide-react';
import type {Building} from '@/lib/campus-types';
import type {EnergyResponse,Reading} from '@/lib/energy';
import {readEnergy,ConnectorError,type ConnectorSession} from '@/lib/local-connector';
export default function EnergyPanel({building,session,onSessionEnded}:{building?:Building;session:ConnectorSession;onSessionEnded:()=>void}){
 const ended=useRef(onSessionEnded);ended.current=onSessionEnded;
 const [data,setData]=useState<EnergyResponse|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [history,setHistory]=useState<Record<string,{value:number;time:string}[]>>({});
 const [clock,setClock]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),10000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{
  setData(null);setError('');setHistory({});if(!building?.buildingCode)return;
  const life=new AbortController();let timer:ReturnType<typeof setTimeout>;const poll=async()=>{
   setBusy(true);
   try{const d=await readEnergy(session,building.buildingCode!,life.signal);if(life.signal.aborted)return;setData(d);setError('');setHistory(prev=>{const next={...prev};for(const v of d.readings)if(v.value!==null&&v.quality==='normal'){const list=next[v.channelId]||[];if(list.at(-1)?.time!==v.observedAt)next[v.channelId]=[...list,{value:v.value,time:v.observedAt}].slice(-60);}return next;});}
   catch(e){if(!life.signal.aborted){if(e instanceof ConnectorError&&e.status===401){life.abort();ended.current();return;}setError('Connection interrupted. Prior values are retained with their observation times. Check the connector and VPN.');}}
   finally{if(!life.signal.aborted){setBusy(false);timer=setTimeout(poll,60000);}}
  };void poll();return()=>{life.abort();clearTimeout(timer)};
 },[building?.buildingCode,retry,session]);
 const stale=data&&clock-Date.parse(data.observedAt)>120000;
 return <div className="energy-panel"><div className="section-heading"><Zap size={18}/><h3>Electrical demand</h3><button className="refresh-button" disabled={busy} onClick={()=>setRetry(x=>x+1)} aria-label="Refresh energy readings"><RefreshCw size={15} className={busy?'spin':''}/></button></div>
 {!building?<div className="energy-empty"><Radio size={24}/><strong>Select a building</strong><p>Open a building to read its configured private meters.</p></div>:<>
 <div className={'connection-line '+(data?.status==='connected'&&!stale?'connected':'')}><span className="live-dot"/>{busy&&!data?'Connecting over SFU network…':stale?'Observation stale':data?.status==='connected'?'Source connected · 60 s polling':data?.status==='partial'?'Some meters unreachable':data?.status==='unmapped'?'No meter mapping':'Source not connected'}</div>
 {error&&<p className="connection-error" role="status">{error}</p>}
 {data?.status==='unavailable'&&<div className="energy-empty"><WifiOff size={22}/><strong>SFU network required</strong><p>{data.message}</p></div>}
 <div className="live-meters">{(data?.readings||[]).map(r=><MeterCard key={r.channelId} reading={r} history={history[r.channelId]||[]} stale={!!stale}/>)}</div>
 {!!data?.readings.length&&<p className="sample-note">Observed {new Date(data.observedAt).toLocaleTimeString('en-CA',{timeZone:'America/Vancouver',hour:'2-digit',minute:'2-digit',second:'2-digit'})} Vancouver time. Sensor sample time unavailable.</p>}
 <p className="sample-note">Individual meters, not a building total. Meter hierarchy and coverage need validation.</p>
 {data?.status==='partial'&&<p className="sample-note">Some configured channels could not be read.</p>}
 {data?.status==='unmapped'&&<p className="sample-note">{data.message}</p>}
 </>}
 </div>
}
function MeterCard({reading:r,history,stale}:{reading:Reading;history:{value:number;time:string}[];stale:boolean}){
 const values=history.map(p=>p.value),lo=Math.min(...values),hi=Math.max(...values),range=Math.max(hi-lo,1);
 const points=values.map((v,i)=>`${i*230/Math.max(values.length-1,1)},${46-(v-lo)/range*35}`).join(' ');
 return <div className={'meter-card '+(r.quality==='normal'&&!stale?'':'flagged')}><div className="meter-title">{r.device}</div><div className="reading"><strong>{r.value===null?'—':r.value.toLocaleString('en-CA',{maximumFractionDigits:2})}</strong><span>kW</span><small>{stale?'Stale observation':r.state}</small></div>{history.length>1&&<><svg className="sparkline" viewBox="0 0 230 52" role="img" aria-label={`Observed demand over ${history.length} polls. Range ${lo.toFixed(1)} to ${hi.toFixed(1)} kilowatts.`}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2"/></svg><small className="chart-caption">Observed this session · {history.length} polls</small></>}<div className="channel-meta">Channel {r.channelId} · {r.quality==='normal'?'Source quality normal':r.quality}</div></div>
}
