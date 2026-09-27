import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';
import { CAMPUSES, isCampusId } from '../lib/campuses.ts';
import { withinCampus } from '../lib/charging-location.ts';

const ENDPOINTS = Object.freeze({
  na: 'https://webservices.chargepoint.com/webservices/chargepoint/services/',
  ca: 'https://webservices-ca.chargepoint.com/webservices/chargepoint/services/',
  eu: 'https://webservices-eu.chargepoint.com/webservices/chargepoint/services/',
});
const METHODS = new Set(['getStations', 'getStationStatus', 'getLoad']);
const ERROR_MESSAGES = {
  authentication:
    'ChargePoint authentication failed. Check that the API region matches your account and verify the API license key/password.',
  plan: 'The ChargePoint Cloud Plan does not permit live power reads (getLoad). Station status can still be shown.',
  access:
    'ChargePoint denied this API call. Check account and station permissions.',
};
export class ChargePointAccessError extends Error {
  constructor(kind) {
    super(ERROR_MESSAGES[kind]);
    this.kind = kind;
  }
}
const parser = new XMLParser({
  removeNSPrefix: true,
  parseTagValue: false,
  ignoreAttributes: true,
  trimValues: true,
  processEntities: true,
});
const list = (value) =>
  value == null ? [] : Array.isArray(value) ? value : [value];
const str = (value) => (typeof value === 'string' ? value : '');
const escapeXml = (value) =>
  str(value).replace(
    /[<>&"']/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[c],
  );
const numeric = (value) =>
  typeof value === 'string' &&
  /^\d+(?:\.\d+)?$/.test(value.trim()) &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
const date = (value) =>
  typeof value === 'string' &&
  /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
  Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
const stationKey = (id) =>
  'ev-' + createHash('sha256').update(id).digest('hex').slice(0, 24);
function containsControl(text) {
  for (let index = 0; index < text.length; index++)
    if (text.charCodeAt(index) < 32) return true;
  return false;
}
export function validateChargePointConfig(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) =>
        ![
          'licenseKey',
          'password',
          'version',
          'region',
          'stationGroupId',
        ].includes(k),
    )
  )
    throw Error('Invalid ChargePoint configuration.');
  for (const key of ['licenseKey', 'password'])
    if (
      typeof value[key] !== 'string' ||
      !value[key].trim() ||
      value[key].length > 512 ||
      containsControl(value[key])
    )
      throw Error('Enter a valid API license key and password.');
  const version = value.version || '5.1',
    region = value.region || 'na',
    stationGroupId = str(value.stationGroupId).trim();
  if (
    !['5.0', '5.1'].includes(version) ||
    !Object.hasOwn(ENDPOINTS, region) ||
    (region === 'ca' && version !== '5.1') ||
    (stationGroupId && !/^\d{1,20}$/.test(stationGroupId))
  )
    throw Error('Invalid API version or station group.');
  return {
    licenseKey: value.licenseKey.trim(),
    password: value.password,
    version,
    region,
    stationGroupId,
  };
}
async function boundedText(response) {
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000) throw Error('Response too large.');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString('utf8');
}
export async function chargePointCall(
  config,
  method,
  query,
  fetchImpl = fetch,
  signal,
) {
  if (!METHODS.has(method)) throw Error('Read-only operation required.');
  config = validateChargePointConfig(config);
  // Every query is assembled locally from fixed fields; browsers never choose SOAP operations.
  const body = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cp="urn:dictionary:com.chargepoint.webservices"><soap:Header><wsse:Security soap:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><wsse:UsernameToken><wsse:Username>${escapeXml(config.licenseKey)}</wsse:Username><wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${escapeXml(config.password)}</wsse:Password></wsse:UsernameToken></wsse:Security></soap:Header><soap:Body><cp:${method}><searchQuery>${query}</searchQuery></cp:${method}></soap:Body></soap:Envelope>`;
  const response = await fetchImpl(ENDPOINTS[config.region] + config.version, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `"urn:provider/interface/chargepointservices/${method}"`,
    },
    body,
    redirect: 'error',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
  const xml = await boundedText(response);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || SyntaxValidator.validate(xml) !== true)
    throw Error('Invalid ChargePoint response.');
  const envelope = parser.parse(xml)?.Envelope?.Body;
  const data = envelope?.[method + 'Response'];
  if (
    ['InvalidSecurity', 'FailedAuthentication'].includes(
      envelope?.Fault?.faultcode?.split(':').at(-1),
    )
  )
    throw new ChargePointAccessError('authentication');
  if (!response.ok) throw Error('ChargePoint request unavailable.');
  if (data?.responseCode === '101')
    throw new ChargePointAccessError(
      method === 'getLoad' && /cloud plan/i.test(str(data.responseText))
        ? 'plan'
        : 'access',
    );
  if (
    method === 'getStations' &&
    data?.responseCode === '102' &&
    !envelope?.Fault
  )
    return { responseCode: '100', stationData: [], moreFlag: '0' };
  // Never include upstream error text: it can contain credentials, identifiers or driver data.
  if (envelope?.Fault || !data || data.responseCode !== '100')
    throw Error(
      'ChargePoint request unavailable. Check API access and station permissions.',
    );
  return data;
}
function emptyPort(number) {
  return {
    number,
    status: 'UNKNOWN',
    lastCommunicationAt: null,
    powerKw: null,
    powerObservedAt: null,
    inSession: null,
    sessionEvidence: 'unknown',
  };
}
export function normalizeStation(raw, campusId = 'burnaby') {
  if (!/^\d+:\d+$/.test(str(raw.stationID))) return null;
  const ports = list(raw.Port).filter((p) =>
    /^\d{1,4}$/.test(str(p.portNumber)),
  );
  const location = ports
    .map((p) => p.Geo)
    .find(
      (g) =>
        g &&
        str(g.Lat) &&
        str(g.Long) &&
        withinCampus(Number(g.Long), Number(g.Lat), campusId),
    );
  if (!location) return null;
  return {
    sourceId: raw.stationID,
    station: {
      id: stationKey(raw.stationID),
      name: str(raw.stationName).slice(0, 160) || 'ChargePoint station',
      latitude: Number(location.Lat),
      longitude: Number(location.Long),
      ports: [...new Set(ports.map((p) => p.portNumber))].map(emptyPort),
    },
  };
}
export function mergeStation(station, statusData, loadData, observedAt) {
  const statusPorts = list(statusData?.Port),
    loadPorts = list(loadData?.Port);
  const numbers = [
    ...new Set(
      [
        ...station.ports.map((p) => p.number),
        ...statusPorts.map((p) => p.portNumber),
        ...loadPorts.map((p) => p.portNumber),
      ].filter((n) => /^\d{1,4}$/.test(str(n))),
    ),
  ];
  return {
    ...station,
    ports: numbers.map((number) => {
      const s = statusPorts.find((p) => p.portNumber === number),
        l = loadPorts.find((p) => p.portNumber === number);
      const offline =
        statusData?.networkStatus === 'Unreachable' ||
        s?.Status === 'UNREACHABLE';
      const status = offline
        ? 'UNREACHABLE'
        : ['AVAILABLE', 'INUSE', 'UNREACHABLE', 'UNKNOWN'].includes(s?.Status)
          ? s.Status
          : 'UNKNOWN';
      const confirmed = numeric(l?.sessionID) > 0;
      // A zero load is not evidence that a session ended. INUSE is labelled as an inference.
      return {
        number,
        status,
        lastCommunicationAt: date(s?.TimeStamp),
        powerKw: offline ? null : numeric(l?.portLoad),
        powerObservedAt: l && !offline ? observedAt : null,
        inSession: offline
          ? null
          : confirmed
            ? true
            : status === 'INUSE'
              ? true
              : status === 'AVAILABLE'
                ? false
                : null,
        sessionEvidence: offline
          ? 'unknown'
          : confirmed
            ? 'session'
            : ['INUSE', 'AVAILABLE'].includes(status)
              ? 'status'
              : 'unknown',
      };
    }),
  };
}
export function createChargePointClient(
  config,
  { fetchImpl = fetch, now = Date.now, campusId = 'burnaby' } = {},
) {
  if (!isCampusId(campusId)) throw Error('Invalid campus.');
  config = validateChargePointConfig(config);
  const call = (method, query, signal) =>
    chargePointCall(config, method, query, fetchImpl, signal);
  let inventory = null,
    inventoryAt = 0,
    snapshot = null,
    snapshotAt = 0,
    pendingSnapshot = null;
  const details = new Map(),
    pendingDetails = new Map();
  let loadPlanDeniedUntil = 0;
  async function readLoad(query, signal) {
    if (now() < loadPlanDeniedUntil) throw new ChargePointAccessError('plan');
    try {
      return await call('getLoad', query, signal);
    } catch (error) {
      if (error instanceof ChargePointAccessError && error.kind === 'plan')
        loadPlanDeniedUntil = now() + 60_000;
      throw error;
    }
  }
  async function discover(signal) {
    if (inventory && now() - inventoryAt < 900_000) return inventory;
    const found = new Map();
    let start = 1;
    for (let page = 0; page < 10; page++) {
      const data = await call(
        'getStations',
        `<City>${CAMPUSES[campusId].city}</City>${config.stationGroupId ? `<sgID>${config.stationGroupId}</sgID>` : ''}<startRecord>${start}</startRecord><numStations>100</numStations>`,
        signal,
      );
      const rows = list(data.stationData);
      for (const row of rows) {
        const item = normalizeStation(row, campusId);
        if (item) found.set(item.station.id, item);
      }
      if (data.moreFlag !== '1') {
        inventory = found;
        inventoryAt = now();
        return found;
      }
      const last = Math.max(
        ...rows.map((r) => Number(r.recordNumber)).filter(Number.isFinite),
      );
      if (!rows.length || !Number.isFinite(last) || last < start)
        throw Error('Incomplete station inventory.');
      start = last + 1;
    }
    throw Error(
      'Station inventory exceeds the supported page limit. Narrow the station group.',
    );
  }
  async function getSnapshot() {
    if (snapshot && now() - snapshotAt < 60_000) return snapshot;
    if (pendingSnapshot) return pendingSnapshot;
    pendingSnapshot = (async () => {
      const deadline = AbortSignal.timeout(22_000);
      const items = await discover(deadline),
        stations = [];
      let partial = false;
      const records = [...items.values()];
      const statuses = [],
        loads = [];
      const tasks = [];
      for (let i = 0; i < records.length; i += 50) {
        const batch = records.slice(i, i + 50);
        tasks.push(async () => {
          const result = await call(
            'getStationStatus',
            `<stationIDs>${batch.map((x) => `<stationID>${escapeXml(x.sourceId)}</stationID>`).join('')}</stationIDs>`,
            deadline,
          );
          statuses.push(...list(result.stationData));
          if (result.moreFlag === '1') partial = true;
        });
      }
      if (config.stationGroupId && records.length)
        tasks.push(async () => {
          loads.push(
            ...list(
              (
                await readLoad(
                  `<sgID>${config.stationGroupId}</sgID>`,
                  deadline,
                )
              ).stationData,
            ),
          );
        });
      else
        for (const item of records)
          tasks.push(async () => {
            loads.push(
              ...list(
                (
                  await readLoad(
                    `<stationID>${escapeXml(item.sourceId)}</stationID>`,
                    deadline,
                  )
                ).stationData,
              ),
            );
          });
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(4, tasks.length) }, async () => {
          while (next < tasks.length) {
            const task = tasks[next++];
            if (deadline.aborted) {
              partial = true;
              continue;
            }
            try {
              await task();
            } catch {
              partial = true;
            }
          }
        }),
      );
      const observedAt = new Date(now()).toISOString();
      for (const { sourceId, station } of records) {
        const s = statuses.find((s) => s.stationID === sourceId),
          l = loads.find((s) => s.stationID === sourceId);
        if (!s || !l) partial = true;
        stations.push(mergeStation(station, s, l, observedAt));
      }
      snapshot = {
        status: partial ? 'partial' : 'connected',
        observedAt,
        stations,
        message: records.length
          ? partial
            ? now() < loadPlanDeniedUntil
              ? ERROR_MESSAGES.plan
              : 'Some station statuses or power readings are unavailable.'
            : 'Station status and power within the campus model extent.'
          : 'No accessible stations with coordinates inside the campus model extent.',
      };
      snapshotAt = now();
      return snapshot;
    })().finally(() => {
      pendingSnapshot = null;
    });
    return pendingSnapshot;
  }
  async function getStation(id) {
    const cached = details.get(id);
    if (cached && now() - cached.time < 60_000) return cached.data;
    if (pendingDetails.has(id)) return pendingDetails.get(id);
    if (pendingDetails.size >= 4) throw Error('ChargePoint connector is busy.');
    const job = (async () => {
      const items = await discover(AbortSignal.timeout(22_000)),
        item = items.get(id);
      if (!item) throw Error('Station is not in the campus inventory.');
      const query = `<stationID>${escapeXml(item.sourceId)}</stationID>`;
      const results = await Promise.allSettled([
        call('getStationStatus', query),
        readLoad(query),
      ]);
      const [statusData, loadData] = results.map((r) =>
        r.status === 'fulfilled'
          ? list(r.value.stationData).find((s) => s.stationID === item.sourceId)
          : null,
      );
      const observedAt = new Date(now()).toISOString();
      const data = {
        status:
          statusData && loadData
            ? 'connected'
            : statusData || loadData
              ? 'partial'
              : 'unavailable',
        observedAt,
        station: mergeStation(item.station, statusData, loadData, observedAt),
        message: loadData
          ? 'Power is reported in kW. Session identifiers and driver information are removed locally.'
          : now() < loadPlanDeniedUntil
            ? ERROR_MESSAGES.plan
            : 'Power unavailable. Check ChargePoint API permissions; status may still be available.',
      };
      details.set(id, { data, time: now() });
      return data;
    })().finally(() => pendingDetails.delete(id));
    pendingDetails.set(id, job);
    return job;
  }
  return { getSnapshot, getStation };
}
