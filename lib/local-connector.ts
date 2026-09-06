import type {EnergyResponse} from './energy';
export const CONNECTOR_URL = 'http://127.0.0.1:8787';
export type ConnectorSession = {token:string; expiresAt:string};
export class ConnectorError extends Error {constructor(message:string, public status = 0) {super(message);}}
async function request(path:string, init:RequestInit = {}) {
  let response:Response;
  try {
    response = await fetch(CONNECTOR_URL + path, {
      ...init, credentials:'omit', cache:'no-store', redirect:'error', referrerPolicy:'no-referrer',
      // Supporting browsers use this to identify the loopback destination before DNS.
      targetAddressSpace:'loopback',
      signal:init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    } as RequestInit);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ConnectorError('Cannot reach the local connector. Start it on this computer and allow local network access if your browser asks.');
  }
  if (!response.ok) {
    const message = response.status === 401 ? 'The pairing code or session has expired. Open the local connector for a new code.' : response.status === 403 ? 'This website is not allowed by the local connector. Check its allowed viewer origins.' : response.status === 429 ? 'The connector is busy. Wait one minute and try again.' : 'The local connector could not complete this request.';
    throw new ConnectorError(message, response.status);
  }
  return response;
}
export async function pairConnector(code:string, signal?:AbortSignal):Promise<ConnectorSession> {
  const response = await request('/v1/session', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code:code.trim()}), signal});
  const session = await response.json() as ConnectorSession;
  if (typeof session.token !== 'string' || !Number.isFinite(Date.parse(session.expiresAt))) throw new ConnectorError('Unexpected connector response.');
  return session;
}
export async function readEnergy(session:ConnectorSession, code:string, signal:AbortSignal):Promise<EnergyResponse> {
  return (await request('/v1/energy?code='+encodeURIComponent(code), {headers:{Authorization:'Bearer '+session.token}, signal})).json();
}
export async function disconnectConnector(session:ConnectorSession) {
  await request('/v1/session', {method:'DELETE',headers:{Authorization:'Bearer '+session.token}});
}
