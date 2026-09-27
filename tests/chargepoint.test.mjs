import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  chargePointCall,
  createChargePointClient,
  mergeStation,
  normalizeStation,
  validateChargePointConfig,
  ChargePointAccessError,
} from '../scripts/chargepoint-client.mjs';
import { createChargePointStore } from '../scripts/chargepoint-store.mjs';
import { chargingPosition, withinCampus } from '../lib/charging-location.ts';
import {
  chargingPortState,
  chargingStationState,
} from '../lib/charging-state.ts';
const config = {
  licenseKey: 'synthetic-license',
  password: 'synthetic-password',
  version: '5.1',
};
const raw = {
  stationID: '1:999999',
  stationName: 'Synthetic campus station',
  stationMacAddr: 'private-mac',
  driverEmail: 'driver@example.invalid',
  Port: [
    { portNumber: '1', Geo: { Lat: '49.279', Long: '-122.919' } },
    { portNumber: '2', Geo: { Lat: '49.279', Long: '-122.919' } },
  ],
};
const statusXml =
  '<stationData><stationID>1:999999</stationID><Port><portNumber>1</portNumber><Status>INUSE</Status><TimeStamp>2026-09-06T10:00:00Z</TimeStamp></Port><Port><portNumber>2</portNumber><Status>AVAILABLE</Status></Port></stationData>';
const inventoryXml =
  '<stationData><stationID>1:999999</stationID><stationName>Synthetic campus station</stationName><driverEmail>private-driver@example.invalid</driverEmail><Port><portNumber>1</portNumber><Geo><Lat>49.279</Lat><Long>-122.919</Long></Geo></Port><Port><portNumber>2</portNumber><Geo><Lat>49.279</Lat><Long>-122.919</Long></Geo></Port></stationData>';
const loadXml =
  '<stationData><stationID>1:999999</stationID><Port><portNumber>1</portNumber><portLoad>0.000</portLoad><sessionID>987654321</sessionID><credentialID>private-card</credentialID><userID>private-user</userID></Port><Port><portNumber>2</portNumber><portLoad>3.4</portLoad></Port></stationData>';
const response = (method, xml, code = '100') =>
  new Response(
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><cp:${method}Response xmlns:cp="urn:dictionary:com.chargepoint.webservices"><responseCode>${code}</responseCode>${xml}</cp:${method}Response></soap:Body></soap:Envelope>`,
  );
test('ChargePoint configuration permits fixed HTTPS API versions and no caller-supplied endpoint', () => {
  assert.equal(validateChargePointConfig(config).version, '5.1');
  for (const bad of [
    { ...config, endpoint: 'https://attacker.example' },
    { ...config, stationGroupId: '1</sgID>' },
    { ...config, password: '' },
    { ...config, version: '4.0' },
    { ...config, region: 'https://attacker.example' },
    { ...config, region: '__proto__' },
    { ...config, region: 'ca', version: '5.0' },
  ])
    assert.throws(() => validateChargePointConfig(bad));
});
test('regional authentication uses the documented Canadian host without falling back to another region', async () => {
  let calls = 0;
  await chargePointCall(
    { ...config, region: 'ca' },
    'getStations',
    '',
    async (url, init) => {
      calls++;
      assert.equal(
        url,
        'https://webservices-ca.chargepoint.com/webservices/chargepoint/services/5.1',
      );
      assert.equal(init.redirect, 'error');
      return response('getStations', inventoryXml);
    },
  );
  assert.equal(calls, 1);
  assert.equal(validateChargePointConfig(config).region, 'na');
});
test('authentication and Cloud Plan errors are explicit without reflecting raw upstream text', async () => {
  await assert.rejects(
    () =>
      chargePointCall(
        config,
        'getStations',
        '',
        async () =>
          new Response(
            '<Envelope><Body><Fault><faultcode>InvalidSecurity</faultcode><faultstring>private-error-value</faultstring></Fault></Body></Envelope>',
            { status: 500 },
          ),
      ),
    (e) =>
      e instanceof ChargePointAccessError &&
      e.kind === 'authentication' &&
      !e.message.includes('private-error-value'),
  );
  await assert.rejects(
    () =>
      chargePointCall(config, 'getLoad', '', async () =>
        response(
          'getLoad',
          '<responseText>Your Cloud Plan blocks this call. private-error-value</responseText>',
          '101',
        ),
      ),
    (e) =>
      e instanceof ChargePointAccessError &&
      e.kind === 'plan' &&
      !e.message.includes('private-error-value'),
  );
  const empty = await chargePointCall(config, 'getStations', '', async () =>
    response('getStations', '', '102'),
  );
  assert.deepEqual(empty.stationData, []);
});
test('plan-restricted load remains unknown and backs off subsequent requests', async () => {
  let calls = 0;
  const client = createChargePointClient(
    { ...config, region: 'ca' },
    {
      fetchImpl: async (url, init) => {
        const method = init.headers.SOAPAction.match(/\/(get\w+)"/)[1];
        if (method === 'getLoad') {
          calls++;
          return response(
            method,
            '<responseText>Your Cloud Plan does not allow this call.</responseText>',
            '101',
          );
        }
        return response(
          method,
          method === 'getStations' ? inventoryXml : statusXml,
        );
      },
    },
  );
  const snapshot = await client.getSnapshot();
  assert.equal(snapshot.status, 'partial');
  assert.match(snapshot.message, /Cloud Plan/);
  assert.equal(snapshot.stations[0].ports[0].powerKw, null);
  const detail = await client.getStation(snapshot.stations[0].id);
  assert.equal(calls, 1);
  assert.match(detail.message, /Cloud Plan/);
  assert.equal(detail.station.ports[0].inSession, true);
  assert.equal(chargingPortState(detail.station.ports[0]), 'unknown');
});
test('station normalization restricts geography and strips all unselected source fields', () => {
  const result = normalizeStation(raw);
  assert.equal(result.station.ports.length, 2);
  assert.match(result.station.id, /^ev-[a-f0-9]{24}$/);
  assert.equal(
    normalizeStation({
      ...raw,
      Port: [{ portNumber: '1', Geo: { Lat: '0', Long: '0' } }],
    }),
    null,
  );
  assert.equal(normalizeStation({ ...raw, Port: [{ portNumber: '1' }] }), null);
  assert.equal(normalizeStation({ ...raw, stationID: 'invalid' }), null);
  assert(!JSON.stringify(result.station).includes('driver'));
  assert(!JSON.stringify(result.station).includes(raw.stationID));
});
test('session activity is separate from power and unknown measurements never become zero', () => {
  const station = normalizeStation(raw).station;
  const result = mergeStation(
    station,
    { Port: [{ portNumber: '1', Status: 'INUSE' }] },
    {
      Port: [
        {
          portNumber: '1',
          portLoad: '0.0',
          sessionID: '123',
          userID: 'private-user',
        },
        { portNumber: '2', portLoad: 'NaN' },
      ],
    },
    '2026-09-06T10:00:00Z',
  );
  assert.equal(result.ports[0].powerKw, 0);
  assert.equal(result.ports[0].inSession, true);
  assert.equal(result.ports[0].sessionEvidence, 'session');
  assert.equal(result.ports[1].powerKw, null);
  assert.equal(result.ports[1].inSession, null);
  assert(!JSON.stringify(result).includes('private-user'));
  assert(!JSON.stringify(result).includes('sessionID'));
  const offline = mergeStation(
    station,
    { networkStatus: 'Unreachable' },
    { Port: [{ portNumber: '1', portLoad: '5.0', sessionID: '123' }] },
    '2026-09-06T10:00:00Z',
  );
  assert.equal(offline.ports[0].powerKw, null);
  assert.equal(offline.ports[0].inSession, null);
});
test('SOAP authentication is escaped, uses the fixed provider and cannot issue control operations', async () => {
  let called = 0;
  await chargePointCall(
    { ...config, password: '<secret>&"' },
    'getLoad',
    '<stationID>1:999999</stationID>',
    async (url, init) => {
      called++;
      assert.equal(
        url,
        'https://webservices.chargepoint.com/webservices/chargepoint/services/5.1',
      );
      assert.equal(init.redirect, 'error');
      assert.match(init.body, /&lt;secret&gt;&amp;&quot;/);
      assert.equal(
        init.headers.SOAPAction,
        '"urn:provider/interface/chargepointservices/getLoad"',
      );
      return response('getLoad', loadXml);
    },
  );
  await assert.rejects(() =>
    chargePointCall(config, 'shedLoad', '', () => {
      called++;
    }),
  );
  assert.equal(called, 1);
  await assert.rejects(() =>
    chargePointCall(
      config,
      'getLoad',
      '',
      async () =>
        new Response(
          '<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x/>',
        ),
    ),
  );
  await assert.rejects(
    () =>
      chargePointCall(config, 'getLoad', '', async () =>
        response(
          'getLoad',
          '<responseText>private-provider-error</responseText>',
          '401',
        ),
      ),
    (error) => !error.message.includes('private-provider-error'),
  );
});
test('discovery and selected-station polling cache requests, isolate IDs and remove driver data', async () => {
  const calls = [];
  let clock = Date.parse('2026-09-06T10:00:00Z');
  const client = createChargePointClient(config, {
    now: () => clock,
    fetchImpl: async (url, init) => {
      const method = init.headers.SOAPAction.match(/\/(get\w+)"/)[1];
      calls.push(method);
      return response(
        method,
        method === 'getStations'
          ? inventoryXml
          : method === 'getStationStatus'
            ? statusXml
            : loadXml,
      );
    },
  });
  const [a, b] = await Promise.all([
    client.getSnapshot(),
    client.getSnapshot(),
  ]);
  assert.deepEqual(a, b);
  assert.equal(a.stations.length, 1);
  assert.equal(calls.length, 3);
  const id = a.stations[0].id,
    detail = await client.getStation(id);
  assert.equal(detail.status, 'connected');
  assert.equal(detail.station.ports[0].inSession, true);
  assert.equal(detail.station.ports[0].powerKw, 0);
  await client.getStation(id);
  assert.equal(calls.length, 5);
  const json = JSON.stringify(detail);
  for (const privateValue of [
    'private-card',
    'private-user',
    '987654321',
    'sessionID',
    config.licenseKey,
    config.password,
  ])
    assert(!json.includes(privateValue));
  await assert.rejects(() => client.getStation('ev-' + '0'.repeat(24)));
  assert.equal(calls.length, 5);
  clock += 60001;
  await client.getSnapshot();
  assert.equal(calls.filter((x) => x === 'getStations').length, 1);
  assert.equal(calls.filter((x) => x === 'getStationStatus').length, 3);
});
test('incomplete status or denied load is visible as partial, and no fabricated power is returned', async () => {
  const client = createChargePointClient(config, {
    fetchImpl: async (url, init) => {
      const method = init.headers.SOAPAction.match(/\/(get\w+)"/)[1];
      return response(
        method,
        method === 'getStations'
          ? inventoryXml
          : method === 'getStationStatus'
            ? statusXml
            : '',
        method === 'getLoad' ? '403' : '100',
      );
    },
  });
  const a = await client.getSnapshot(),
    detail = await client.getStation(a.stations[0].id);
  assert.equal(detail.status, 'partial');
  assert.equal(detail.station.ports[0].powerKw, null);
  assert.equal(detail.station.ports[0].sessionEvidence, 'status');
});
test('station inventory follows pagination and rejects a non-advancing provider cursor', async () => {
  let pages = 0;
  const client = createChargePointClient(config, {
    fetchImpl: async (url, init) => {
      const method = init.headers.SOAPAction.match(/\/(get\w+)"/)[1];
      if (method === 'getStationStatus') return response(method, statusXml);
      if (method === 'getLoad') return response(method, loadXml);
      pages++;
      return response(
        method,
        pages === 1
          ? inventoryXml.replace(
              '</stationData>',
              '<recordNumber>100</recordNumber></stationData>',
            ) + '<moreFlag>1</moreFlag>'
          : '<moreFlag>0</moreFlag>',
      );
    },
  });
  assert.equal((await client.getSnapshot()).stations.length, 1);
  assert.equal(pages, 2);
  const broken = createChargePointClient(config, {
    fetchImpl: async () => response('getStations', '<moreFlag>1</moreFlag>'),
  });
  await assert.rejects(() => broken.getSnapshot());
});
test('credential storage uses owner-only atomic files and never returns credentials to the viewer', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfu-ev-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'settings', 'chargepoint.json');
  const store = createChargePointStore(file, () => ({
    getSnapshot: async () => ({ status: 'connected', stations: [] }),
  }));
  assert.equal((await store.getSnapshot()).status, 'not_configured');
  store.save(config);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  assert.equal((await store.getSnapshot()).status, 'connected');
  assert(!JSON.stringify(await store.getSnapshot()).includes(config.password));
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(dir, 'other'), file);
  assert.throws(() => store.save(config));
});
test('EV markers project to campus terrain with correct north-to-south row ordering', () => {
  assert(withinCampus(-122.919, 49.279));
  assert(!withinCampus(-123.12, 49.28));
  assert(!withinCampus(NaN, 49));
  const terrain = JSON.parse(
    fs.readFileSync('public/data/terrain.json', 'utf8'),
  );
  const position = chargingPosition(-122.919, 49.279, terrain);
  assert(position.every(Number.isFinite));
  assert(Math.abs(position[0]) < 1200 && Math.abs(position[2]) < 700);
  assert(position[1] > 0 && position[1] < 200);
});
test('overstay colour rule keeps zero, unknown, stale and no-session states distinct', () => {
  const base = {
    number: '1',
    status: 'INUSE',
    inSession: true,
    sessionEvidence: 'session',
    powerKw: 0,
    powerObservedAt: '2026-09-06T00:00:00Z',
    lastCommunicationAt: null,
  };
  assert.equal(chargingPortState(base), 'overstay');
  assert.equal(chargingPortState({ ...base, powerKw: 0.0001 }), 'charging');
  assert.equal(
    chargingPortState({ ...base, inSession: false, status: 'AVAILABLE' }),
    'available',
  );
  for (const port of [
    { ...base, powerKw: null },
    { ...base, inSession: null },
    { ...base, status: 'UNREACHABLE' },
    { ...base, powerKw: NaN },
  ])
    assert.equal(chargingPortState(port), 'unknown');
  assert.equal(chargingPortState(base, true), 'unknown');
  assert.equal(
    chargingPortState(
      { ...base, lastCommunicationAt: '2026-09-06T00:00:00Z' },
      false,
      Date.parse('2026-09-06T00:03:00Z'),
    ),
    'unknown',
  );
  assert.equal(
    chargingStationState({ ports: [{ ...base, inSession: false }, base] }),
    'overstay',
  );
  assert.equal(chargingStationState({ ports: [] }), 'unknown');
});
