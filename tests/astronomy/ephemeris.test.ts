import { describe, expect, it } from 'vitest';
import { solarLunarPositions, AU_KM, EARTH_RADIUS_KM } from '../../src/core/astronomy/Ephemeris';
import { astronomicalTime } from '../../src/core/astronomy/Time';
import { DEG, equatorialDirection, dot } from '../../src/core/astronomy/CoordinateSystems';
import { equatorialToEcliptic, equatorialToHorizontal } from '../../src/core/astronomy/CoordinateTransform';
import { observerBasis } from '../../src/core/astronomy/Observer';
import { Store } from '../../src/core/data/State';
import { celestialSphere, SPHERE_RADIUS } from '../../src/celestial/CelestialSphere';
import { createBody } from '../../src/rendering/Bodies';
import { inspect } from '../../src/ui/Inspector';

const observer = { name: 'Greenwich', latitude: 51.4779, longitude: 0 };
describe('offline mean-of-date Sun and Moon', () => {
  it('matches Meeus example 47.a lunar longitude, latitude and distance', () => {
    const time = { ...astronomicalTime(new Date('1992-04-12T00:00:00Z')), julianEphemerisDate: 2448724.5 };
    const moon = solarLunarPositions(time, observer)[1];
    const ecliptic = equatorialToEcliptic(moon.geocentric, time.obliquity);
    expect(ecliptic.lon / DEG).toBeCloseTo(133.162655, 5);
    expect(ecliptic.lat / DEG).toBeCloseTo(-3.229126, 5);
    expect(moon.distanceKm).toBeCloseTo(368409.7, 0);
  });
  it('matches Meeus example 25.a geometric solar longitude and distance', () => {
    const time = { ...astronomicalTime(new Date('1992-10-13T00:00:00Z')), julianEphemerisDate: 2448908.5 };
    const sun = solarLunarPositions(time, observer)[0];
    expect(equatorialToEcliptic(sun.geocentric, time.obliquity).lon / DEG).toBeCloseTo(199.90988, 4);
    expect(sun.distanceKm / AU_KM).toBeCloseTo(0.99766, 4);
  });
  it('subtracts the observer position before calculating lunar altitude and diameter', () => {
    const time = astronomicalTime(new Date('2026-10-16T00:00:00Z'));
    for (const body of solarLunarPositions(time, observer)) {
      const basis = observerBasis(observer, time);
      const vector = equatorialDirection(body.geocentric).map((value, i) => value * body.distanceKm - basis.zenith[i] * EARTH_RADIUS_KM);
      expect(Math.hypot(...vector)).toBeCloseTo(body.topocentricDistanceKm, 5);
      expect(Math.sin(body.horizontal.alt)).toBeCloseTo(dot(equatorialDirection(body.topocentric), basis.zenith), 10);
      expect(body.topocentricAngularDiameter).toBeCloseTo(2 * Math.asin(body.radiusKm / Math.hypot(...vector)), 12);
      const meshes = createBody(body, basis);
      expect(meshes[0].position.length()).toBeCloseTo(SPHERE_RADIUS, 12);
      expect(meshes[0].geometry.parameters.radius / SPHERE_RADIUS).toBeCloseTo(body.radiusKm / body.topocentricDistanceKm, 12);
      meshes.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
    }
    const moon = solarLunarPositions(time, observer)[1];
    expect(equatorialToHorizontal(moon.geocentric, observer, time).alt - moon.horizontal.alt).toBeGreaterThan(0.1 * DEG);
  });
  it('responds to time and location, with plausible angular sizes throughout supported years', () => {
    for (const year of [1900, 2000, 2026, 2100]) {
      const time = astronomicalTime(new Date(`${year}-06-21T12:00:00Z`));
      const bodies = solarLunarPositions(time, observer);
      for (const body of bodies) expect(body.angularDiameter / DEG).toBeGreaterThan(0.45);
      for (const body of bodies) expect(body.angularDiameter / DEG).toBeLessThan(0.6);
      expect(bodies[0].geocentric.dec / DEG).toBeGreaterThan(23);
      const other = solarLunarPositions(time, { ...observer, longitude: 180 });
      expect(other[1].geocentric).toEqual(bodies[1].geocentric);
      expect(other[1].topocentric).not.toEqual(bodies[1].topocentric);
      const later = solarLunarPositions(astronomicalTime(new Date(time.utc.getTime() + 86400000)), observer);
      expect(later[0].geocentric).not.toEqual(bodies[0].geocentric);
      expect(later[1].geocentric).not.toEqual(bodies[1].geocentric);
    }
  });
});

describe('complete reference definitions', () => {
  it('provides bilingual names, ownership and coordinate constraints for every line', () => {
    const state = new Store().state;
    state.view = 'observer';
    state.probe = { ra: 1, dec: 0.5 };
    for (const line of celestialSphere(state).lines) {
      expect(line.name).toBeTruthy();
      expect(line.english).toBeTruthy();
      expect(line.system).toBeTruthy();
      const data = inspect({ ...state, selected: `line:${line.id}`, lineHit: { id: line.id, direction: line.points[30] ?? line.points[0] } });
      expect(data?.name).toBe(line.name);
      expect(data?.rows.some(([key]) => key === '参考时刻 · UTC')).toBe(true);
    }
  });
  it('keeps each RA semicircle at a single RA rather than labeling two opposite halves alike', () => {
    const model = celestialSphere(new Store().state);
    const line = model.lines.find(line => line.id === 'ra-30')!;
    for (const point of line.points.slice(1, -1)) expect(Math.atan2(point[1], point[0]) / DEG).toBeCloseTo(30, 10);
  });
});
