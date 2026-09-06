import http from 'node:http';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {relayPage} from './relay-page.mjs';
import {readBuilding} from '../lib/foreseer.ts';

const randomToken = () => randomBytes(24).toString('base64url');
const sameSecret = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const DEFAULT_ORIGINS = ['https://makonin.com', 'https://smakonin.github.io', 'http://127.0.0.1:4173', 'http://localhost:4173', 'http://127.0.0.1:3000', 'http://localhost:3000'];

export function createConnector({config, allowedOrigins = DEFAULT_ORIGINS, read = readBuilding, now = Date.now, pairingLifetimeMs = 600_000, sessionLifetimeMs = 28_800_000, cacheLifetimeMs = 60_000}) {
  const origins = new Set(allowedOrigins.map(value => {
    const url = new URL(value);
    if (url.origin !== value || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw Error('Allowed viewer origins must be HTTPS or loopback origins.');
    return value;
  }));
  const sessions = new Map(), cache = new Map(), pending = new Map();
  let pairing = {code: randomToken(), expires: now() + pairingLifetimeMs}, attempts = [], port;
  function rotatePairing() { pairing = {code: randomToken(), expires: now() + pairingLifetimeMs}; return pairing.code; }
  function send(res, status, value, extra = {}) {
    res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra});
    res.end(typeof value === 'string' ? value : JSON.stringify(value));
  }
  const server = http.createServer(async (req, res) => {
    try {
      const ownOrigin = `http://127.0.0.1:${port}`;
      if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, {error:'Host not allowed.'});
      const origin = req.headers.origin || (req.headers['sec-fetch-site'] === 'same-origin' ? ownOrigin : undefined);
      const url = new URL(req.url, ownOrigin);
      if (url.origin !== ownOrigin || url.username || url.password) return send(res, 400, {error:'Invalid request.'});
      if (url.pathname === '/relay') {
        const viewerOrigin=url.searchParams.get('viewer'), nonce=url.searchParams.get('nonce');
        if(req.method!=='GET'||!origins.has(viewerOrigin)||!nonce||!/^[a-f0-9-]{36}$/.test(nonce))return send(res,403,{error:'Unapproved relay request.'});
        const scriptNonce=randomToken();
        return send(res,200,relayPage(viewerOrigin,nonce,scriptNonce),{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; style-src 'nonce-${scriptNonce}'; script-src 'nonce-${scriptNonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,'X-Frame-Options':'DENY'});
      }
      if (url.pathname === '/' || url.pathname === '/pairing/new') {
        // This page is visible only through a direct loopback navigation. It never enables CORS.
        if (origin && origin !== ownOrigin) return send(res, 403, {error:'Origin not allowed.'});
        if (req.headers['sec-fetch-site'] === 'cross-site' && req.headers['sec-fetch-mode'] !== 'navigate') return send(res, 403, {error:'Direct navigation required.'});
        if (url.pathname === '/pairing/new') {
          if (req.method !== 'POST' || origin !== ownOrigin || req.headers['x-connector-action'] !== 'new-code') return send(res, 403, {error:'Local action required.'});
          return send(res, 200, {code:rotatePairing()});
        }
        if (req.method !== 'GET' || url.search) return send(res, 405, {error:'Method not allowed.'});
        if (!pairing.code || pairing.expires <= now()) rotatePairing();
        const nonce = randomToken();
        return send(res, 200, pairingPage(pairing.code, nonce), {'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,'X-Frame-Options':'DENY'});
      }
      if (!origin || (!origins.has(origin) && origin !== ownOrigin)) return send(res, 403, {error:'Viewer origin not allowed.'});
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      const methods = url.pathname === '/v1/session' ? ['POST','DELETE'] : url.pathname === '/v1/energy' ? ['GET'] : [];
      if (!methods.length) return send(res, 404, {error:'Not found.'});
      if (req.method === 'OPTIONS') {
        const requestedHeaders = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        if (!methods.includes(req.headers['access-control-request-method']) || requestedHeaders.some(h => !['authorization','content-type'].includes(h))) return send(res, 403, {error:'Request not allowed.'});
        return send(res, 204, '', {'Access-Control-Allow-Methods':methods.join(', '),'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Private-Network':'true','Access-Control-Max-Age':'300'});
      }
      if (!methods.includes(req.method)) return send(res, 405, {error:'Method not allowed.'});
      for (const [token, session] of sessions) if (session.expires <= now()) sessions.delete(token);
      if (req.method === 'POST') {
        if (url.search || req.headers['content-type']?.split(';')[0] !== 'application/json') return send(res, 400, {error:'JSON pairing request required.'});
        attempts = attempts.filter(t => t > now() - 60_000);
        if (attempts.length >= 8) return send(res, 429, {error:'Too many pairing attempts. Wait one minute.'});
        attempts.push(now());
        const body = await readJson(req);
        if (pairing.expires <= now() || !pairing.code || !sameSecret(body.code, pairing.code)) return send(res, 401, {error:'Pairing code is invalid, expired or already used.'});
        if (sessions.size >= 8) return send(res, 429, {error:'Too many sessions. Disconnect a viewer or restart the connector.'});
        pairing.code = null;
        const token = randomToken(), expires = now() + sessionLifetimeMs;
        sessions.set(token, {origin, expires});
        return send(res, 201, {token, expiresAt:new Date(expires).toISOString()});
      }
      const auth = req.headers.authorization;
      const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const session = sessions.get(token);
      if (!session || session.origin !== origin) return send(res, 401, {error:'Pair this viewer with the local connector.'});
      if (req.method === 'DELETE') { sessions.delete(token); return send(res, 204, ''); }
      const code = url.searchParams.get('code');
      if (!code || !/^\d{3}$/.test(code) || [...url.searchParams.keys()].some(k => k !== 'code') || url.searchParams.getAll('code').length !== 1) return send(res, 400, {error:'One three-digit building code is required.'});
      let result = cache.get(code);
      if (!result || result.expires <= now()) {
        if (!pending.has(code)) {
          // A viewer cannot choose a source URL, channel or write command.
          if (pending.size >= 4) return send(res, 429, {error:'Connector is busy. Try again shortly.'});
          pending.set(code, read(config, code).then(data => {const entry = {data, expires:now() + cacheLifetimeMs}; cache.set(code, entry); return entry;}).finally(() => pending.delete(code)));
        }
        result = await pending.get(code);
      }
      // A disconnected or expired session must not receive an in-flight response.
      if (!sessions.has(token) || session.expires <= now()) return send(res, 401, {error:'Session ended.'});
      return send(res, 200, result.data);
    } catch { if (!res.headersSent) send(res, 400, {error:'The connector could not complete this request.'}); else res.end(); }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return {
    server,
    async listen(requestedPort = 8787) {
      await new Promise((resolve, reject) => {server.once('error', reject);server.listen(requestedPort, '127.0.0.1', resolve);});
      port = server.address().port;
      return `http://127.0.0.1:${port}`;
    },
    async close() {sessions.clear();cache.clear();server.closeAllConnections();await new Promise(resolve => server.close(resolve));},
  };
}
async function readJson(req) {
  let body = '';
  for await (const chunk of req) {body += chunk; if (Buffer.byteLength(body) > 1024) throw Error('Request too large');}
  const value = JSON.parse(body);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => k !== 'code')) throw Error('Invalid request');
  return value;
}
function pairingPage(code, nonce) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SFU · Local connector</title><style nonce="${nonce}">body{margin:0;background:#111f29;color:#e7eff2;font:16px/1.65 system-ui}main{max-width:600px;margin:9vh auto;padding:28px}h1{font-size:30px}p{color:#b1c4ce}label{display:block;margin-top:28px}input{box-sizing:border-box;width:100%;padding:14px;font:17px monospace;color:#fff;background:#203541;border:1px solid #69828e;border-radius:5px}button{font:inherit;border:0;border-radius:5px;padding:10px 18px;background:#a6192e;color:white;cursor:pointer;margin:16px 12px 0 0}small{display:block;margin-top:20px;color:#9ab2bf}</style></head><body><main><p>SFU BURNABY CAMPUS TWIN</p><h1>Pair your browser</h1><p>This connector runs on your computer. Keep your SFU VPN connected, copy this code, then paste it into the campus viewer’s Connect live data form.</p><label for="code">Temporary pairing code</label><input id="code" readonly value="${code}" autocomplete="off"><button id="copy">Copy pairing code</button><button id="new">New code</button><p id="status" role="status">Each code works once and expires after 10 minutes.</p><small>Readings stay between SFU, this connector and your browser. Closing this tab keeps the connector running. Stop its terminal process to end all sessions.</small></main><script nonce="${nonce}">const code=document.getElementById('code'),status=document.getElementById('status');document.getElementById('copy').onclick=async()=>{try{await navigator.clipboard.writeText(code.value);status.textContent='Copied. Paste it into the campus viewer.'}catch{code.select();status.textContent='Select the code and copy it with your keyboard.'}};document.getElementById('new').onclick=async()=>{try{const r=await fetch('/pairing/new',{method:'POST',headers:{'X-Connector-Action':'new-code'}});if(!r.ok)throw Error();code.value=(await r.json()).code;status.textContent='New code ready. It expires after 10 minutes.'}catch{status.textContent='Could not create a code. Reload this local page.'}};</script></body></html>`;
}
