export type Meter = {
  channelId: number;
  name: string;
  device: string;
  folder: string;
  buildingCode: string | null;
  unit: string;
  mappingStatus: string;
};
export type BuildingPart = {
  name: string;
  heightM: number;
  groundM: number;
  polygons: number[][][][];
  sourceObjectId?: number | null;
  geometrySource?: string;
  licence?: string;
};
export type Building = {
  parts?: BuildingPart[];
  surfacePositions?: number[][];
  address?: string;
  occupancy?: string;
  sourceUrl?: string;
  geometrySource?: string;
  kind?: string;
  id: string;
  name: string;
  abbr: string;
  buildingCode: string | null;
  source: string;
  areaM2: number;
  heightM: number;
  heightStatus: string;
  heightField: string | null;
  heightMatchOverlap: number;
  groundM: number;
  center: [number, number, number];
  coordinates: [number, number];
  polygons: number[][][][];
};
export type Campus = {
  attributions?: {
    text: string;
    url: string;
    licence: string;
    scope: string;
  }[];
  name?: string;
  campusId?: string;
  bounds?: number[];
  retrievedAt?: string;
  buildings: Building[];
  stats: Record<string, number>;
  limitations: string[];
  crs: string;
  origin: number[];
};
export type Terrain = {
  label?: string;
  width: number;
  depth: number;
  bounds: number[];
  heights: number[];
  origin: number[];
};
