'use client';
import {useEffect,useRef,useState} from 'react';
import {LockKeyhole,Unplug,ExternalLink} from 'lucide-react';
import {CONNECTOR_URL,pairConnector,disconnectConnector,type ConnectorSession} from '@/lib/local-connector';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
export default function LiveConnection({session,onChange,message}:{session:ConnectorSession|null;onChange:(value:ConnectorSession|null)=>void;message:string}) {
  const [expanded,setExpanded]=useState(false),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const life=useRef<AbortController|null>(null);
  useEffect(()=>()=>life.current?.abort(),[]);
  const connect=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError('');life.current?.abort();const controller=new AbortController();life.current=controller;
    try{const next=await pairConnector(code,controller.signal);if(!controller.signal.aborted){onChange(next);setCode('');setExpanded(false);}}
    catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Unable to pair with the connector.');}
    finally{if(!controller.signal.aborted)setBusy(false);}
  };
  const disconnect=()=>{if(session)void disconnectConnector(session).catch(()=>{});onChange(null);setError('');};
  return <section className="live-connection" aria-label="Private live data connection">
    <div className="section-heading"><LockKeyhole size={17}/><h3>{session?'Local connector paired':'Private live data'}</h3></div>
    {session?<><p className="sample-note">This tab is paired until {new Date(session.expiresAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}. Keep the connector and VPN running.</p><Button variant="outline" className="connector-button" onClick={disconnect}><Unplug size={15}/>Disconnect live data</Button></>:<>
      <p className="muted">Connect through this computer’s SFU VPN to view live readings.</p>
      {!expanded?<Button className="connector-button" onClick={()=>setExpanded(true)}>Connect live data</Button>:<form onSubmit={connect}>
        <p className="sample-note">Start the local connector, then open its pairing page.</p>
        <a className="connector-link" href={CONNECTOR_URL+'/'} target="_blank" rel="noreferrer">Open local connector<ExternalLink size={14}/></a>
        <label htmlFor="pairing-code">Temporary pairing code</label><Input id="pairing-code" type="password" value={code} onChange={e=>setCode(e.target.value)} autoComplete="off" spellCheck={false} required maxLength={64}/>
        <div className="connector-actions"><Button className="connector-button" type="submit" disabled={busy||!code.trim()}>{busy?'Connecting…':'Pair this tab'}</Button><Button variant="ghost" type="button" onClick={()=>{life.current?.abort();setBusy(false);setExpanded(false);setCode('');setError('');}}>Cancel</Button></div>
        <p className="sample-note">Allow local network access if prompted. Pairing is kept in this tab’s memory and clears when you reload.</p>
      </form>}
    </>}
    {(error||message)&&<p className="connection-error" role="alert">{error||message}</p>}
  </section>;
}
