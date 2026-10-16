import type { Observer } from '../astronomy/Observer';

export const places: readonly Observer[] = [
  { name: '北京 · Beijing', latitude: 39.9042, longitude: 116.4074 },
  { name: '伦敦 · London', latitude: 51.5074, longitude: -0.1278 },
  { name: '基多 · Quito', latitude: -0.1807, longitude: -78.4678 },
  { name: '悉尼 · Sydney', latitude: -33.8688, longitude: 151.2093 },
  { name: '赤道 · Equator', latitude: 0, longitude: 0 },
  { name: '北极 · North Pole', latitude: 90, longitude: 0 },
];

const aliases: Record<string, number> = { '北京': 0, beijing: 0, '伦敦': 1, london: 1, '基多': 2, quito: 2, '悉尼': 3, sydney: 3, '赤道': 4, equator: 4, '北极': 5, 'north pole': 5 };
export function findPlace(name: string): Observer | undefined {
  return places.find(place => place.name === name.trim()) ?? places[aliases[name.trim().toLowerCase()]];
}
