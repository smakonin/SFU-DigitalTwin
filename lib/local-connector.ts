import type {EnergyResponse} from './energy';
export const CONNECTOR_URL = 'http://127.0.0.1:8787';
export type ConnectorSession = {token:string; expiresAt:string};
export class ConnectorError extends Error {constructor(message:string, public status = 0) {super(message);}}
type RelayMessage={type:string;nonce:string;id?:string;result?:unknown;error?:{message:string;status:number}};
type Pending={resolve:(value:unknown)=>void;reject:(reason:Error)=>void;cleanup:()=>void};
type Relay={popup:Window;nonce:string;pending:Map<string,Pending>;dispose:()=>void;ready:Promise<void>};
const relays=new Map<string,Relay>();
function request(relay:Relay,operation:string,code?:string,signal?:AbortSignal):Promise<unknown> {
  if(relay.popup.closed)return Promise.reject(new ConnectorError('The local connection window was closed. Pair this tab again.',401));
  if(signal?.aborted)return Promise.reject(new DOMException('Request cancelled','AbortError'));
  return new Promise((resolve,reject)=>{
    const id=crypto.randomUUID();
    const finish=(error:Error)=>{relay.pending.get(id)?.cleanup();reject(error);};
    const abort=()=>finish(new DOMException('Request cancelled','AbortError'));
    const timeout=setTimeout(()=>finish(new ConnectorError('The local connection window is not responding. Check that it is open and the connector is running.')),35_000);
    const cleanup=()=>{clearTimeout(timeout);signal?.removeEventListener('abort',abort);relay.pending.delete(id);};
    relay.pending.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true});
    relay.popup.postMessage({type:'sfu-relay-request',nonce:relay.nonce,id,operation,code},CONNECTOR_URL);
  });
}
export async function pairConnector(code:string,signal?:AbortSignal):Promise<ConnectorSession> {
  const nonce=crypto.randomUUID(),pending=new Map<string,Pending>();
  const popup=window.open(CONNECTOR_URL+'/relay?viewer='+encodeURIComponent(location.origin)+'&nonce='+nonce,'_blank','popup,width=520,height=440');
  if(!popup)throw new ConnectorError('Allow the local connection window to open, then choose Pair this tab again.');
  let readyResolve:()=>void=()=>{},readyReject:(error:Error)=>void=()=>{};
  const ready=new Promise<void>((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const readyTimeout=setTimeout(()=>readyReject(new ConnectorError('The local connection window could not start. Confirm that the connector is running.')),15_000);
  const relay:Relay={popup,nonce,pending,ready,dispose:()=>{}};
  const listener=(event:MessageEvent<RelayMessage>)=>{
    if(event.origin!==CONNECTOR_URL||event.source!==popup||!event.data||event.data.nonce!==nonce)return;
    const d=event.data;
    if(d.type==='sfu-relay-ready'){clearTimeout(readyTimeout);readyResolve();return;}
    if(d.type==='sfu-relay-ended'){relay.dispose();return;}
    if(d.type!=='sfu-relay-response'||!d.id)return;
    const item=pending.get(d.id);if(!item)return;item.cleanup();
    if(d.error)item.reject(new ConnectorError(d.error.message,d.error.status));else item.resolve(d.result);
  };
  const abort=()=>{readyReject(new DOMException('Request cancelled','AbortError'));relay.dispose();};
  relay.dispose=()=>{clearTimeout(readyTimeout);signal?.removeEventListener('abort',abort);window.removeEventListener('message',listener);window.removeEventListener('pagehide',relay.dispose);for(const item of [...pending.values()]){item.cleanup();item.reject(new ConnectorError('Local session ended.',401));}relays.delete(nonce);if(!popup.closed)popup.close();};
  window.addEventListener('message',listener);window.addEventListener('pagehide',relay.dispose,{once:true});signal?.addEventListener('abort',abort,{once:true});
  try{
    await ready;
    const result=await request(relay,'pair',code.trim(),signal) as {expiresAt:string};
    if(!result||!Number.isFinite(Date.parse(result.expiresAt)))throw new ConnectorError('Unexpected connector response.');
    signal?.removeEventListener('abort',abort);relays.set(nonce,relay);
    return {token:nonce,expiresAt:result.expiresAt};
  }catch(error){relay.dispose();throw error;}
}
export async function readEnergy(session:ConnectorSession,code:string,signal:AbortSignal):Promise<EnergyResponse> {
  const relay=relays.get(session.token);if(!relay)throw new ConnectorError('Local session ended.',401);
  return await request(relay,'read',code,signal) as EnergyResponse;
}
export async function disconnectConnector(session:ConnectorSession) {
  const relay=relays.get(session.token);if(!relay)return;
  try{await request(relay,'disconnect');}finally{relay.dispose();}
}
