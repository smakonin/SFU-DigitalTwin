import {readFileSync, chmodSync} from 'node:fs';
import {validateConfig} from '../lib/foreseer.ts';
import {createConnector, DEFAULT_ORIGINS} from './connector-server.mjs';
try {
  const path = '.private/foreseer.json';
  const config = validateConfig(JSON.parse(readFileSync(path, 'utf8')));
  chmodSync(path, 0o600);
  const optionsPath = '.private/connector.json';
  let options = {};
  try {options = JSON.parse(readFileSync(optionsPath, 'utf8'));} catch (error) {if (error.code !== 'ENOENT') throw error;}
  const connector = createConnector({config, allowedOrigins:options.allowedOrigins || DEFAULT_ORIGINS});
  const url = await connector.listen();
  console.log(`Local SFU connector ready: ${url}/`);
  console.log('Open that local page to obtain a temporary pairing code. Keep the SFU VPN connected.');
  console.log('Read-only access; internal source configuration and readings are not logged. Ctrl+C stops the connector.');
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => {await connector.close();process.exit(0);});
} catch {
  console.error('Cannot start the connector. Check .private/foreseer.json, optional .private/connector.json, and whether port 8787 is in use.');
  process.exitCode = 1;
}
