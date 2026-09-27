import fs from 'node:fs';
import { isCampusId } from '../lib/campuses.ts';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  createChargePointClient,
  validateChargePointConfig,
  ChargePointAccessError,
} from './chargepoint-client.mjs';

// Outside the repository and iCloud Drive on this Mac; never a frontend build input.
export const CHARGEPOINT_CONFIG_PATH = path.join(
  os.homedir(),
  process.platform === 'darwin'
    ? 'Library/Application Support/SFU-DigitalTwin'
    : '.config/sfu-digital-twin',
  'chargepoint.json',
);
export function createChargePointStore(
  file = CHARGEPOINT_CONFIG_PATH,
  clientFactory = createChargePointClient,
) {
  const clients = new Map();
  let loadedMtime = null;
  const configured = () => fs.existsSync(file);
  function safeFile() {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw Error('Private configuration must be a regular file.');
    return stat;
  }
  function load(campusId) {
    if (!isCampusId(campusId)) throw Error('Invalid campus.');
    if (!configured()) return null;
    const stat = safeFile();
    if (loadedMtime !== stat.mtimeMs) {
      clients.clear();
      loadedMtime = stat.mtimeMs;
    }
    if (!clients.has(campusId)) {
      fs.chmodSync(file, 0o600);
      clients.set(
        campusId,
        clientFactory(
          validateChargePointConfig(JSON.parse(fs.readFileSync(file, 'utf8'))),
          { campusId },
        ),
      );
    }
    return clients.get(campusId);
  }
  function save(value) {
    const config = validateChargePointConfig(value),
      directory = path.dirname(file);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(directory).isSymbolicLink())
      throw Error('Private configuration directory cannot be linked.');
    fs.chmodSync(directory, 0o700);
    if (fs.lstatSync(file, { throwIfNoEntry: false })) safeFile();
    const temporary = path.join(
      directory,
      '.chargepoint-' + randomBytes(12).toString('hex') + '.tmp',
    );
    try {
      fs.writeFileSync(temporary, JSON.stringify(config) + '\n', {
        mode: 0o600,
        flag: 'wx',
      });
      fs.renameSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    clients.clear();
    loadedMtime = null;
  }
  return {
    configured,
    save,
    async getSnapshot(campusId = 'burnaby') {
      try {
        const source = load(campusId);
        return source
          ? await source.getSnapshot()
          : {
              status: 'not_configured',
              observedAt: new Date().toISOString(),
              stations: [],
              message:
                'Add ChargePoint API credentials on the local connector setup page.',
            };
      } catch (error) {
        return {
          status: 'unavailable',
          observedAt: new Date().toISOString(),
          stations: [],
          message:
            error instanceof ChargePointAccessError
              ? error.message
              : 'ChargePoint could not be read. Check the local credentials, network and station permissions.',
        };
      }
    },
    async getStation(id, campusId = 'burnaby') {
      try {
        const source = load(campusId);
        if (!source) throw Error();
        return await source.getStation(id);
      } catch {
        return {
          status: 'unavailable',
          observedAt: new Date().toISOString(),
          station: null,
          message:
            'This station could not be read. Check the local ChargePoint configuration.',
        };
      }
    },
  };
}
