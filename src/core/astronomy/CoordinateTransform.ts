import { Equatorial, Horizontal, Ecliptic } from 'astronomia/coord';
import {
  DEG, normalize, equatorialDirection, type EquatorialCoordinates,
  type HorizontalCoordinates, type EclipticCoordinates, type Direction,
} from './CoordinateSystems';
import type { Observer } from './Observer';
import type { AstronomicalTime } from './Time';

export function equatorialToHorizontal(
  point: EquatorialCoordinates, observer: Observer, time: AstronomicalTime,
): HorizontalCoordinates {
  // Meeus uses west-positive longitude and south-through-west azimuth.
  const result = new Equatorial(point.ra ?? 0, point.dec).toHorizontal(
    { lat: observer.latitude * DEG, lon: -observer.longitude * DEG }, time.gmstSeconds,
  );
  return { az: Math.abs(Math.cos(result.alt)) < 1e-7 ? null : normalize(result.az + Math.PI), alt: result.alt };
}

export function horizontalToEquatorial(
  point: HorizontalCoordinates, observer: Observer, time: AstronomicalTime,
): EquatorialCoordinates {
  const result = new Horizontal((point.az ?? 0) - Math.PI, point.alt).toEquatorial(
    { lat: observer.latitude * DEG, lon: -observer.longitude * DEG }, time.gmstSeconds,
  );
  return { ra: Math.abs(Math.cos(result.dec)) < 1e-7 ? null : normalize(result.ra), dec: result.dec };
}

export function eclipticToEquatorial(point: EclipticCoordinates, obliquity: number): EquatorialCoordinates {
  const result = new Ecliptic(point.lon, point.lat).toEquatorial(obliquity);
  return { ra: normalize(result.ra), dec: result.dec };
}

export function equatorialToEcliptic(point: EquatorialCoordinates, obliquity: number): EclipticCoordinates {
  const result = new Equatorial(point.ra ?? 0, point.dec).toEcliptic(obliquity);
  return { lon: normalize(result.lon), lat: result.lat };
}

export function eclipticDirection(longitude: number, obliquity: number): Direction {
  return equatorialDirection(eclipticToEquatorial({ lon: longitude, lat: 0 }, obliquity));
}
