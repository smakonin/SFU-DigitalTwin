import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export function chargePointPrivateValues() {
  const values = [];
  for (const file of [
    path.join(
      os.homedir(),
      process.platform === 'darwin'
        ? 'Library/Application Support/SFU-DigitalTwin'
        : '.config/sfu-digital-twin',
      'chargepoint.json',
    ),
    '.private/chargepoint.json',
  ]) {
    if (!fs.existsSync(file)) continue;
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const secret of [config.licenseKey, config.password])
      if (typeof secret === 'string' && secret.length >= 4) {
        values.push(
          secret,
          JSON.stringify(secret).slice(1, -1),
          secret.replace(
            /[<>&"']/g,
            (c) =>
              ({
                '<': '&lt;',
                '>': '&gt;',
                '&': '&amp;',
                '"': '&quot;',
                "'": '&apos;',
              })[c],
          ),
          Buffer.from(secret).toString('base64'),
        );
      }
  }
  return [...new Set(values)];
}
