import proj4 from 'proj4';
import type { Terrain } from './campus-types';
const utm10 = '+proj=utm +zone=10 +datum=NAD83 +units=m +no_defs';
export function projectChargingLocation(
  longitude: number,
  latitude: number,
): [number, number] {
  return proj4('EPSG:4326', utm10, [longitude, latitude]) as [number, number];
}
export function withinCampus(longitude: number, latitude: number) {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  )
    return false;
  const [x, y] = projectChargingLocation(longitude, latitude);
  return x >= 504800 && x <= 507150 && y >= 5457550 && y <= 5458900;
}
export function chargingPosition(
  longitude: number,
  latitude: number,
  terrain: Terrain,
): [number, number, number] {
  const [x, y] = projectChargingLocation(longitude, latitude),
    [west, south, east, north] = terrain.bounds;
  const col = Math.max(
    0,
    Math.min(
      terrain.width - 1,
      ((x - west) / (east - west)) * (terrain.width - 1),
    ),
  );
  const row = Math.max(
    0,
    Math.min(
      terrain.depth - 1,
      ((north - y) / (north - south)) * (terrain.depth - 1),
    ),
  );
  const c = Math.floor(col),
    r = Math.floor(row),
    c2 = Math.min(c + 1, terrain.width - 1),
    r2 = Math.min(r + 1, terrain.depth - 1);
  const h = (ri: number, ci: number) =>
    terrain.heights[ri * terrain.width + ci];
  const elevation =
    (h(r, c) * (1 - (col - c)) + h(r, c2) * (col - c)) * (1 - (row - r)) +
    (h(r2, c) * (1 - (col - c)) + h(r2, c2) * (col - c)) * (row - r);
  return [
    x - terrain.origin[0],
    elevation - terrain.origin[2],
    terrain.origin[1] - y,
  ];
}
