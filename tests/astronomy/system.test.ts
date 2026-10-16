import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Body, GeoMoon, HelioVector, KM_PER_AU } from 'astronomy-engine';
import { BODY_IDS, BODY_DEFINITIONS, add, length, subtract, type VectorKm } from '../../src/core/system/Bodies';
import { systemSnapshot, type BodyState } from '../../src/core/system/Ephemeris';
import { angularDiameter, measure, relativeStates } from '../../src/core/system/Measurements';
import { SNAPSHOTS, civilTime } from '../../src/core/system/CivilTime';
import { SystemStore } from '../../src/core/system/Store';
import { constrainCamera } from '../../src/core/system/CameraGeometry';
import { meanDateToJ2000 } from '../../src/core/system/ReferenceFrame';
import { renderRadiusKm, localRenderPosition } from '../../src/rendering/system/Scale';
import { bodyVisibility } from '../../src/rendering/system/Visibility';

describe.each(SNAPSHOTS)('three-body snapshot %s', utc => {
  const snapshot = systemSnapshot(new Date(utc));
  it('shares the same barycentric frame, unit and TT epoch for all three bodies', () => {
    for (const id of BODY_IDS) {
      const body = snapshot.bodies[id];
      expect(body.utc).toBe(utc);
      expect(body.frame).toBe('SSB_EQJ');
      expect(body.unit).toBe('km');
      expect(body.kind).toBe('geometric');
      expect(body.positionKm.every(Number.isFinite)).toBe(true);
      expect(body.ttDaysSinceJ2000).toBe(snapshot.bodies.earth.ttDaysSinceJ2000);
      expect(body.ttDaysSinceJ2000 + 2451545).toBe(snapshot.julianDateTT);
    }
  });
  it('is antisymmetric, has symmetric distances and closes the Earth-Moon-Sun triangle', () => {
    for (const a of BODY_IDS) for (const b of BODY_IDS) {
      if (a === b) continue;
      const ab = measure(snapshot, a, b), ba = measure(snapshot, b, a);
      expect(ab.distanceKm).toBe(ba.distanceKm);
      ab.vectorKm.forEach((value, axis) => expect(value).toBeCloseTo(-ba.vectorKm[axis], 8));
      expect(length(ab.direction)).toBeCloseTo(1, 12);
      const c = BODY_IDS.find(id => id !== a && id !== b)!;
      const bc = measure(snapshot, b, c), ca = measure(snapshot, c, a);
      expect(length(add(add(ab.vectorKm, bc.vectorKm), ca.vectorKm))).toBeLessThan(1e-6);
      expect(ab.distanceKm).toBeLessThanOrEqual(bc.distanceKm + ca.distanceKm);
    }
  });
  it('calculates angular diameter independently of render enhancement', () => {
    for (const observer of BODY_IDS) for (const target of BODY_IDS) {
      if (observer === target) continue;
      const measurement = measure(snapshot, observer, target);
      const physicalR = BODY_DEFINITIONS[target].physicalRadiusKm;
      const ratio = physicalR / Math.sqrt(measurement.vectorKm.reduce((sum, value) => sum + value * value, 0));
      expect(measurement.angularDiameterDeg).toBeCloseTo(Math.asin(ratio) * 360 / Math.PI, 10);
      expect(renderRadiusKm(target, physicalR, measurement.distanceKm, 42, 1000, 'physical')).toBe(physicalR);
      expect(renderRadiusKm(target, physicalR, measurement.distanceKm, 42, 1000, 'enhanced')).toBeGreaterThanOrEqual(physicalR);
    }
  });
  it('agrees with translation to independent heliocentric/geocentric library outputs', () => {
    const earth = HelioVector(Body.Earth, new Date(utc));
    const moon = GeoMoon(new Date(utc));
    const se = measure(snapshot, 'sun', 'earth');
    const em = measure(snapshot, 'earth', 'moon');
    [earth.x, earth.y, earth.z].forEach((v, axis) => expect(se.vectorKm[axis]).toBeCloseTo(v * KM_PER_AU, 5));
    [moon.x, moon.y, moon.z].forEach((v, axis) => expect(em.vectorKm[axis]).toBeCloseTo(v * KM_PER_AU, 5));
    expect(em.distanceKm).toBeGreaterThan(350000);
    expect(em.distanceKm).toBeLessThan(410000);
    expect(se.distanceKm).toBeGreaterThan(146000000);
    expect(se.distanceKm).toBeLessThan(153000000);
  });
});

describe('scientific boundaries and time zones', () => {
  it('rejects undefined diameters and incompatible epochs/frames', () => {
    for (const [r, d] of [[0, 1], [1, 1], [2, 1], [1, NaN], [NaN, 1], [-1, 2], [1, Infinity]]) expect(() => angularDiameter(r, d)).toThrow();
    const snapshot = systemSnapshot(new Date(SNAPSHOTS[0]));
    expect(() => measure(snapshot, 'earth', 'earth')).toThrow();
    expect(() => relativeStates(snapshot.bodies.earth, { ...snapshot.bodies.moon, utc: SNAPSHOTS[1] })).toThrow();
    expect(() => relativeStates(snapshot.bodies.earth, { ...snapshot.bodies.moon, frame: 'OTHER' } as unknown as BodyState)).toThrow();
    expect(() => systemSnapshot(new Date(SNAPSHOTS[0]), 'apparent')).toThrow();
  });
  it('converts the same instant to Beijing and New York including DST transitions', () => {
    expect(civilTime(new Date('2026-01-01T00:00:00Z'), 'Asia/Shanghai')).toContain('01/01/2026, 08:00:00 GMT+8');
    expect(civilTime(new Date('2026-01-01T00:00:00Z'), 'America/New_York')).toContain('31/12/2025, 19:00:00 GMT-5');
    expect(civilTime(new Date('2026-07-01T00:00:00Z'), 'America/New_York')).toContain('30/06/2026, 20:00:00 GMT-4');
    expect(civilTime(new Date('2026-03-08T06:59:59Z'), 'America/New_York')).toContain('01:59:59 GMT-5');
    expect(civilTime(new Date('2026-03-08T07:00:00Z'), 'America/New_York')).toContain('03:00:00 GMT-4');
    expect(civilTime(new Date('2026-11-01T05:59:59Z'), 'America/New_York')).toContain('01:59:59 GMT-4');
    expect(civilTime(new Date('2026-11-01T06:00:00Z'), 'America/New_York')).toContain('01:00:00 GMT-5');
  });
  it('preserves scientific data through time-zone, scale and target changes', () => {
    const store = new SystemStore();
    const original = store.state.snapshot;
    store.update({ timeZone: 'Asia/Shanghai', scale: 'physical', target: 'sun' });
    expect(store.state.snapshot).toBe(original);
    store.update({ timeZone: 'America/New_York' });
    expect(store.state.snapshot).toBe(original);
    store.update({ observer: 'moon', target: 'earth', instant: new Date(SNAPSHOTS[1]) });
    expect(store.state.observer).toBe('moon');
    expect(store.state.target).toBe('earth');
    expect(store.state.snapshot).not.toBe(original);
    expect(Object.keys(store.state.snapshot.bodies)).toEqual([...BODY_IDS]);
  });
  it('updates all bodies together at a new snapshot and leaves an existing target unchanged', () => {
    const store = new SystemStore();
    store.update({ observer: 'moon', target: 'earth' });
    const before = store.state.snapshot;
    store.update({ instant: new Date(SNAPSHOTS[2]) });
    expect(store.state.observer).toBe('moon');
    expect(store.state.target).toBe('earth');
    for (const id of BODY_IDS) {
      expect(store.state.snapshot.bodies[id].positionKm).not.toEqual(before.bodies[id].positionKm);
      expect(store.state.snapshot.bodies[id].utc).toBe(SNAPSHOTS[2]);
    }
  });
});

describe('camera and render geometry', () => {
  it('preserves local kilometre offsets under a large shared origin translation', () => {
    const point: VectorKm = [150000000.01, 200000000.02, -100000000.03];
    const camera: VectorKm = [150000000, 200000000, -100000000];
    const local = localRenderPosition(point, camera);
    const expected = new THREE.Vector3((point[0] - camera[0]) / 1e6, (point[2] - camera[2]) / 1e6, -(point[1] - camera[1]) / 1e6);
    expect(local.distanceTo(expected)).toBeLessThan(1e-20);
  });
  it('prevents penetration and tunnelling through a body during extreme zoom', () => {
    const obstacles = [{ center: [0, 0, 0] as VectorKm, radiusKm: 1 }];
    const stopped = constrainCamera([0, 0, -10], [0, 0, 10], obstacles);
    expect(stopped[2]).toBeGreaterThanOrEqual(1);
    expect(length(constrainCamera([0, 0, 0], null, obstacles))).toBeGreaterThanOrEqual(1);
    expect(constrainCamera([2, 3, 4], [2, 3, 5], obstacles)).toEqual([2, 3, 4]);
  });
  it('uses actual camera direction, frustum and rendering-sphere occlusion', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.lookAt(0, 0, -1);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const target = { id: 'moon' as const, center: new THREE.Vector3(0, 0, -10), radius: 0.3 };
    const blocker = { id: 'earth' as const, center: new THREE.Vector3(0, 0, -5), radius: 1 };
    expect(bodyVisibility(camera, target, [target]).inView).toBe(true);
    expect(bodyVisibility(camera, target, [target, blocker]).occluded).toBe(true);
    const partial = { ...blocker, center: new THREE.Vector3(0.9, 0, -5) };
    expect(bodyVisibility(camera, target, [target, partial]).partial).toBe(true);
    camera.lookAt(0, 0, 1); camera.updateMatrixWorld();
    expect(bodyVisibility(camera, target, [target]).inFrustum).toBe(false);
  });
  it('rotates old mean-of-date references without changing angular relationships', () => {
    const rotation = meanDateToJ2000(new Date(SNAPSHOTS[0]));
    const x = rotation([1, 0, 0]), y = rotation([0, 1, 0]), z = rotation([0, 0, 1]);
    for (const v of [x, y, z]) expect(length(v)).toBeCloseTo(1, 12);
    expect(x.reduce((sum, value, i) => sum + value * y[i], 0)).toBeCloseTo(0, 12);
    expect(x.reduce((sum, value, i) => sum + value * z[i], 0)).toBeCloseTo(0, 12);
    expect(x).not.toEqual([1, 0, 0]);
    const identity = meanDateToJ2000(new Date('2000-01-01T12:00:00Z'))([1, 0, 0]);
    expect(length(subtract(identity, [1, 0, 0]))).toBeLessThan(1e-8);
  });
});
