export type ChargingPort = {
  number: string;
  status: 'AVAILABLE' | 'INUSE' | 'UNREACHABLE' | 'UNKNOWN';
  lastCommunicationAt: string | null;
  powerKw: number | null;
  powerObservedAt: string | null;
  inSession: boolean | null;
  sessionEvidence: 'session' | 'status' | 'unknown';
};
export type ChargingStation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  ports: ChargingPort[];
};
export type ChargingResponse = {
  status: 'connected' | 'partial' | 'unavailable' | 'not_configured';
  observedAt: string;
  stations: ChargingStation[];
  message: string;
};
export type ChargingStationResponse = {
  status: 'connected' | 'partial' | 'unavailable';
  observedAt: string;
  station: ChargingStation | null;
  message: string;
};
