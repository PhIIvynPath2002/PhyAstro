import { trueLongitude, radius } from 'astronomia/solar';
import { position } from 'astronomia/moonposition';
import { directionToEquatorial, equatorialDirection, type Direction, type EquatorialCoordinates, type HorizontalCoordinates } from './CoordinateSystems';
import { eclipticToEquatorial, equatorialToHorizontal } from './CoordinateTransform';
import { observerBasis, type Observer } from './Observer';
import type { AstronomicalTime } from './Time';

export const AU_KM = 149597870.7;
export const EARTH_RADIUS_KM = 6371.0088;
export type BodyId = 'sun' | 'moon';
export interface BodyPosition {
  id: BodyId;
  name: string;
  english: string;
  radiusKm: number;
  distanceKm: number;
  topocentricDistanceKm: number;
  geocentric: EquatorialCoordinates;
  topocentric: EquatorialCoordinates;
  horizontal: HorizontalCoordinates;
  angularDiameter: number;
  topocentricAngularDiameter: number;
}

// Geometric, mean-of-date directions. Do not mix these with apparent/GAST frames.
export function solarLunarPositions(time: AstronomicalTime, observer: Observer): BodyPosition[] {
  const centuries = (time.julianEphemerisDate - 2451545) / 36525;
  const moon = position(time.julianEphemerisDate);
  const source = [
    { id: 'sun' as const, name: '太阳', english: 'Sun', radiusKm: 695700, lon: trueLongitude(centuries).lon, lat: 0, distanceKm: radius(centuries) * AU_KM },
    { id: 'moon' as const, name: '月球', english: 'Moon', radiusKm: 1737.4, lon: moon.lon, lat: moon.lat, distanceKm: moon.range },
  ];
  const zenith = observerBasis(observer, time).zenith;
  return source.map(body => {
    const geocentric = eclipticToEquatorial({ lon: body.lon, lat: body.lat }, time.obliquity);
    const vector = equatorialDirection(geocentric);
    const offset = vector.map((value, i) => value * body.distanceKm - zenith[i] * EARTH_RADIUS_KM) as unknown as Direction;
    const topocentricDistanceKm = Math.hypot(...offset);
    const topocentric = directionToEquatorial(offset);
    return { ...body, geocentric, topocentric, topocentricDistanceKm,
      horizontal: equatorialToHorizontal(topocentric, observer, time),
      angularDiameter: 2 * Math.asin(body.radiusKm / body.distanceKm),
      topocentricAngularDiameter: 2 * Math.asin(body.radiusKm / topocentricDistanceKm),
    };
  });
}
