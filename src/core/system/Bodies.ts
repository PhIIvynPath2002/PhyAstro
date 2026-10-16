export const BODY_IDS = ['sun', 'earth', 'moon'] as const;
export type SystemBodyId = typeof BODY_IDS[number];
export type VectorKm = readonly [number, number, number];
export interface BodyDefinition {
  id: SystemBodyId;
  name: string;
  english: string;
  physicalRadiusKm: number;
  radiusDefinition: string;
  radiusSource: string;
}
export const BODY_DEFINITIONS: Readonly<Record<SystemBodyId, BodyDefinition>> = {
  sun: { id: 'sun', name: '太阳', english: 'Sun', physicalRadiusKm: 695700,
    radiusDefinition: 'IAU nominal solar radius', radiusSource: 'IAU 2015 Resolution B3' },
  earth: { id: 'earth', name: '地球', english: 'Earth', physicalRadiusKm: 6371.0088,
    radiusDefinition: 'IUGG mean radius (2a+b)/3; spherical model', radiusSource: 'IUGG / WGS84 a=6378.137 km, b=6356.752314245 km' },
  moon: { id: 'moon', name: '月球', english: 'Moon', physicalRadiusKm: 1737.4,
    radiusDefinition: 'Mean lunar radius; spherical model', radiusSource: 'NASA Moon Fact Sheet' },
};
export const subtract = (a: VectorKm, b: VectorKm): VectorKm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: VectorKm, b: VectorKm): VectorKm => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const multiply = (a: VectorKm, factor: number): VectorKm => [a[0] * factor, a[1] * factor, a[2] * factor];
export const length = (a: VectorKm): number => Math.hypot(...a);
