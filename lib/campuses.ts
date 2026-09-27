export const CAMPUS_IDS = ['burnaby', 'vancouver', 'surrey'] as const;
export type CampusId = (typeof CAMPUS_IDS)[number];
export function isCampusId(value: unknown): value is CampusId {
  return typeof value === 'string' && CAMPUS_IDS.some((id) => id === value);
}
export const CAMPUSES = {
  burnaby: {
    name: 'Burnaby',
    city: 'Burnaby',
    heading: 'BURNABY MOUNTAIN',
    coordinates: '49.279° N · 122.919° W',
    directory: 'data',
    initialBuilding: 'sfu-55',
    bounds: [504800, 5457550, 507150, 5458900],
    aerial: 'data/aerial-2025.jpg',
    imageryLabel: 'City of Burnaby · 2025',
    attribution:
      'Contains information licensed under the Open Government Licence – City of Burnaby',
    registry: 'Official SFU footprints',
    retrieved: 'September 5, 2026',
    groundLabel: 'contour-derived',
    mapUrl: 'https://www.sfu.ca/campuses/maps-and-directions/burnaby-map.html',
  },
  vancouver: {
    name: 'Vancouver',
    city: 'Vancouver',
    heading: 'DOWNTOWN VANCOUVER',
    coordinates: '49.284° N · 123.112° W',
    directory: 'data/vancouver',
    initialBuilding: 'sfu-65',
    bounds: [491100, 5458550, 493500, 5459400],
    aerial: null,
    imageryLabel: 'Not available in this model',
    attribution:
      'Contains information licensed under the Open Government Licence – Vancouver',
    registry: 'SFU locations · sourced exteriors',
    retrieved: 'September 27, 2026',
    groundLabel: 'estimated from city building bases',
    mapUrl: 'https://www.sfu.ca/vancouver/about/our-locations.html',
  },
  surrey: {
    name: 'Surrey',
    city: 'Surrey',
    heading: 'SURREY CITY CENTRE',
    coordinates: '49.187° N · 122.849° W',
    directory: 'data/surrey',
    initialBuilding: 'sfu-71',
    bounds: [510600, 5446750, 511750, 5448800],
    aerial: null,
    imageryLabel: 'Not available in this model',
    attribution:
      'Contains information licensed under the Open Government Licence – City of Surrey',
    registry: 'SFU locations · sourced exteriors',
    retrieved: 'September 27, 2026',
    groundLabel: 'estimated from city building bases',
    mapUrl: 'https://www.sfu.ca/campuses/maps-and-directions/surrey-map/',
  },
} satisfies Record<
  CampusId,
  {
    name: string;
    city: string;
    heading: string;
    coordinates: string;
    directory: string;
    initialBuilding: string;
    bounds: number[];
    aerial: string | null;
    imageryLabel: string;
    attribution: string;
    registry: string;
    retrieved: string;
    groundLabel: string;
    mapUrl: string;
  }
>;
