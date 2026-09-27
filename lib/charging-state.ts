import type { ChargingPort, ChargingStation } from './charging';
export type ChargingState = 'available' | 'charging' | 'overstay' | 'unknown';
export const CHARGING_COLOURS: Record<ChargingState, string> = {
  available: '#69d7a5',
  charging: '#f0ce57',
  overstay: '#f16d68',
  unknown: '#91a6b2',
};
export const CHARGING_LABELS: Record<ChargingState, string> = {
  available: 'No session',
  charging: 'Charging',
  overstay: 'Overstay',
  unknown: 'Unknown',
};
export function chargingPortState(
  port: ChargingPort,
  stale = false,
  now = Date.now(),
): ChargingState {
  const lastCommunication = port.lastCommunicationAt
    ? Date.parse(port.lastCommunicationAt)
    : NaN;
  if (
    stale ||
    port.status === 'UNREACHABLE' ||
    (Number.isFinite(lastCommunication) && now - lastCommunication > 120_000)
  )
    return 'unknown';
  if (port.inSession === false) return 'available';
  if (
    port.inSession !== true ||
    port.powerKw === null ||
    !Number.isFinite(port.powerKw) ||
    port.powerKw < 0
  )
    return 'unknown';
  return port.powerKw > 0 ? 'charging' : 'overstay';
}
export function chargingStationState(
  station: ChargingStation,
  stale = false,
): ChargingState {
  const states = station.ports.map((p) => chargingPortState(p, stale));
  // Highlight any overstay at a multi-port station; per-port colours remain visible in the inspector.
  for (const state of ['overstay', 'charging', 'unknown', 'available'] as const)
    if (states.includes(state)) return state;
  return 'unknown';
}
