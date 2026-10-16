import { describe, expect, it } from 'vitest';
import { DEG, TAU, dot, equatorialDirection, directionToEquatorial } from '../../src/core/astronomy/CoordinateSystems';
import { astronomicalTime, localSiderealTime } from '../../src/core/astronomy/Time';
import { observerBasis, validateObserver } from '../../src/core/astronomy/Observer';
import { equatorialToHorizontal, horizontalToEquatorial, eclipticToEquatorial, equatorialToEcliptic } from '../../src/core/astronomy/CoordinateTransform';
import { celestialSphere, SPHERE_RADIUS } from '../../src/celestial/CelestialSphere';
import type { State } from '../../src/core/data/State';

const time = astronomicalTime(new Date('2026-03-20T12:00:00Z'));
const angularError = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

describe('time and mean reference frame', () => {
  it('matches the J2000 Julian day and published GMST reference', () => {
    const j2000 = astronomicalTime(new Date('2000-01-01T12:00:00Z'));
    expect(j2000.julianDate).toBe(2451545);
    expect(j2000.gmst / DEG).toBeCloseTo(280.46061837, 6);
    expect(j2000.obliquity / DEG).toBeCloseTo(23.4392911, 6);
  });
  it('advances local sidereal time eastward and wraps at 24h', () => {
    expect(angularError(localSiderealTime(time, 30), localSiderealTime(time, 0))).toBeCloseTo(30 * DEG, 12);
    expect(localSiderealTime(time, 180)).toBeCloseTo(localSiderealTime(time, -180), 12);
  });
  it('advances about 360.9856 degrees in one mean solar day', () => {
    const next = astronomicalTime(new Date(time.utc.getTime() + 86400000));
    expect(angularError(next.gmst, time.gmst) / DEG).toBeCloseTo(0.985647, 5);
  });
  it('rejects invalid and unsupported dates', () => {
    expect(() => astronomicalTime(new Date('invalid'))).toThrow();
    expect(() => astronomicalTime(new Date('1800-01-01Z'))).toThrow();
  });
});

describe.each([-90, -33.8688, 0, 39.9042, 51.5074, 89.999, 90])('observer at latitude %s', latitude => {
  const observer = { name: 'test', latitude, longitude: 116.4074 };
  const basis = observerBasis(observer, time);
  it('builds an orthonormal local basis', () => {
    for (const vector of Object.values(basis)) expect(dot(vector, vector)).toBeCloseTo(1, 12);
    expect(dot(basis.east, basis.north)).toBeCloseTo(0, 12);
    expect(dot(basis.east, basis.zenith)).toBeCloseTo(0, 12);
    expect(dot(basis.north, basis.zenith)).toBeCloseTo(0, 12);
  });
  it('places the north celestial pole at the observer latitude', () => {
    const pole = equatorialToHorizontal({ ra: null, dec: Math.PI / 2 }, observer, time);
    expect(pole.alt / DEG).toBeCloseTo(latitude, 6);
  });
  it('places zenith at +90 degrees with undefined azimuth', () => {
    const zenith = equatorialToHorizontal(directionToEquatorial(basis.zenith), observer, time);
    expect(zenith.alt / DEG).toBeCloseTo(90, 5);
    expect(zenith.az).toBeNull();
  });
  it('places cardinal directions on the horizon with north-through-east azimuth', () => {
    const east = equatorialToHorizontal(directionToEquatorial(basis.east), observer, time);
    const north = equatorialToHorizontal(directionToEquatorial(basis.north), observer, time);
    expect(east.alt).toBeCloseTo(0, 10);
    expect(east.az! / DEG).toBeCloseTo(90, 8);
    expect(north.alt).toBeCloseTo(0, 10);
    expect(angularError(north.az!, 0)).toBeCloseTo(0, 8);
  });
  it('preserves directions across horizontal-equatorial round trips', () => {
    for (const ra of [0, 0.1, 1.5, 3, TAU - 0.001]) {
      for (const dec of [-75, -30, 0, 42, 75]) {
        const source = { ra, dec: dec * DEG };
        const horizontal = equatorialToHorizontal(source, observer, time);
        const result = horizontalToEquatorial(horizontal, observer, time);
        expect(angularError(result.ra!, ra)).toBeCloseTo(0, 8);
        expect(result.dec).toBeCloseTo(source.dec, 8);
        const vector = equatorialDirection(source);
        expect(Math.sin(horizontal.alt)).toBeCloseTo(dot(vector, basis.zenith), 10);
      }
    }
  });
});

describe('ecliptic and spherical model', () => {
  it('meets the equator at the equinoxes and reaches the obliquity at 90 degrees', () => {
    const vernal = eclipticToEquatorial({ lon: 0, lat: 0 }, time.obliquity);
    const north = eclipticToEquatorial({ lon: Math.PI / 2, lat: 0 }, time.obliquity);
    expect(vernal.ra).toBe(0);
    expect(vernal.dec).toBe(0);
    expect(north.dec).toBeCloseTo(time.obliquity, 12);
    expect(north.ra).toBeCloseTo(Math.PI / 2, 12);
  });
  it('round trips ecliptic coordinates', () => {
    for (const lon of [0, 1, 3, 5]) for (const lat of [-1, 0, 0.6]) {
      const result = equatorialToEcliptic(eclipticToEquatorial({ lon, lat }, time.obliquity), time.obliquity);
      expect(angularError(result.lon, lon)).toBeCloseTo(0, 10);
      expect(result.lat).toBeCloseTo(lat, 10);
    }
  });
  it('keeps the celestial equator fixed when the observer changes', () => {
    const state: State = { view: 'orbit', showBelowHorizon: true, observer: { name: 'a', latitude: 0, longitude: 0 }, instant: time.utc, layers: { equatorial: true, horizon: true, ecliptic: true, grid: true, horizontalGrid: true, axes: true, labels: true, sun: true, moon: true }, selected: null, probe: null };
    const first = celestialSphere(state);
    const second = celestialSphere({ ...state, observer: { name: 'b', latitude: 50, longitude: 90 } });
    expect(first.lines.find(line => line.id === 'equator')).toEqual(second.lines.find(line => line.id === 'equator'));
    expect(first.lines.find(line => line.id === 'horizon')).not.toEqual(second.lines.find(line => line.id === 'horizon'));
    const basis = observerBasis(state.observer, time);
    first.lines.find(line => line.id === 'horizon')!.points.forEach(point => expect(dot(point, basis.zenith)).toBeCloseTo(0, 12));
    expect(first.points.find(point => point.id === 'observer')!.radius).toBeLessThan(SPHERE_RADIUS);
  });
  it('marks right ascension undefined at the celestial poles', () => {
    expect(directionToEquatorial([0, 0, 1])).toEqual({ ra: null, dec: Math.PI / 2 });
    expect(directionToEquatorial([0, 0, -1])).toEqual({ ra: null, dec: -Math.PI / 2 });
  });
  it('rejects invalid observer coordinates', () => {
    for (const [latitude, longitude] of [[91, 0], [0, 181], [NaN, 0], [0, Infinity]])
      expect(() => validateObserver({ name: 'invalid', latitude, longitude })).toThrow();
  });
});
