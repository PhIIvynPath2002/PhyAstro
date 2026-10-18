import { describe, expect, it } from 'vitest';
import { Observer, ObserverVector } from 'astronomy-engine';
import { bodyPose, cross } from '../../src/core/system/BodyPose';
import { dot, illumination, phase, solarVisibility, unit, visibleDiscFraction } from '../../src/core/system/Illumination';
import { BODY_IDS, add, length, multiply, subtract, type VectorKm } from '../../src/core/system/Bodies';
import { systemSnapshot, type SystemSnapshot } from '../../src/core/system/Ephemeris';
import { SNAPSHOTS, ECLIPSE_SNAPSHOTS } from '../../src/core/system/CivilTime';
import { SystemStore } from '../../src/core/system/Store';

const initial = systemSnapshot(new Date(SNAPSHOTS[0]));
function synthetic(sun: VectorKm, earth: VectorKm, moon: VectorKm): SystemSnapshot {
  return { ...initial, bodies: { sun: { ...initial.bodies.sun, positionKm: sun }, earth: { ...initial.bodies.earth, positionKm: earth }, moon: { ...initial.bodies.moon, positionKm: moon } } };
}
describe('finite solar disc and physical shadow geometry', () => {
  it('handles clear, total, annular, tangent and concentric discs', () => {
    expect(visibleDiscFraction(1, 2, 0)).toBe(0);
    expect(visibleDiscFraction(2, 1, 0)).toBeCloseTo(0.75, 12);
    expect(visibleDiscFraction(1, 1, 2)).toBe(1);
    expect(visibleDiscFraction(1, 0, 0)).toBe(1);
    expect(visibleDiscFraction(1, 1, 1)).toBeCloseTo(1 - (2 * Math.PI / 3 - Math.sqrt(3) / 2) / Math.PI, 12);
    for (const args of [[0, 1, 0], [NaN, 1, 1], [1, -1, 0], [1, 1, -1]])
      expect(() => visibleDiscFraction(...args as [number, number, number])).toThrow();
  });
  it('matches independently sampled disc areas, including penumbra', () => {
    for (const [a, b, d] of [[1, 1, 0.7], [1, 1.4, 1.8], [1, 0.6, 0.5]]) {
      let sun = 0, covered = 0;
      for (let x = -250; x < 250; x++) for (let y = -250; y < 250; y++) {
        const px = (x + 0.5) / 250 * a, py = (y + 0.5) / 250 * a;
        if (px * px + py * py <= a * a) { sun++; if ((px - d) ** 2 + py * py <= b * b) covered++; }
      }
      expect(visibleDiscFraction(a, b, d)).toBeCloseTo(1 - covered / sun, 3);
    }
  });
  it('does not cast shadows from behind the point or beyond the Sun', () => {
    const moon: VectorKm = [400000, 0, 0];
    expect(solarVisibility(moon, synthetic([150000000, 0, 0], [0, 0, 0], moon), 'earth').fraction).toBe(1);
    expect(solarVisibility(moon, synthetic([150000000, 0, 0], [200000000, 0, 0], moon), 'earth').fraction).toBe(1);
  });
  it('produces an umbra, penumbra and clear sky with real physical radii', () => {
    const scene = synthetic([-150000000, 0, 0], [0, 0, 0], [400000, 0, 0]);
    expect(solarVisibility([400000, 0, 0], scene, 'earth').state).toBe('umbra');
    expect(solarVisibility([400000, 6300, 0], scene, 'earth').state).toBe('penumbra');
    expect(solarVisibility([400000, 12000, 0], scene, 'earth').state).toBe('clear');
    expect(solarVisibility([0, 0, 0], scene, 'earth').state).toBe('inside');
    expect(() => solarVisibility(scene.bodies.sun.positionKm, scene, 'earth')).toThrow();
  });
  it('has a lunar umbra near the 2026-03-03 geometric example and clear quarterly snapshots', () => {
    const eclipse = systemSnapshot(new Date(ECLIPSE_SNAPSHOTS[1]));
    expect(solarVisibility(eclipse.bodies.moon.positionKm, eclipse, 'earth').state).toBe('umbra');
    for (const utc of SNAPSHOTS) {
      const scene = systemSnapshot(new Date(utc));
      expect(solarVisibility(scene.bodies.moon.positionKm, scene, 'earth').state).toBe('clear');
    }
  });
  it('resolves a solar eclipse on the physical Earth surface rather than its center', () => {
    const scene = systemSnapshot(new Date('2026-08-12T17:46:00Z'));
    const earth = scene.bodies.earth, moon = scene.bodies.moon;
    const ray = unit(subtract(moon.positionKm, scene.bodies.sun.positionKm));
    const offset = subtract(moon.positionKm, earth.positionKm);
    const b = dot(offset, ray), c = dot(offset, offset) - earth.physicalRadiusKm ** 2;
    const discriminant = b * b - c;
    expect(discriminant).toBeGreaterThan(0);
    const distance = -b - Math.sqrt(discriminant);
    const point = add(moon.positionKm, multiply(ray, distance));
    expect(length(subtract(point, earth.positionKm))).toBeCloseTo(earth.physicalRadiusKm, 5);
    expect(solarVisibility(point, scene, 'moon').state).toBe('umbra');
  });
});
describe('phase and pose independent of rendering', () => {
  it('computes new, quarter and full phases from observer geometry', () => {
    const scene = synthetic([150000000, 0, 0], [0, 0, 0], [400000, 0, 0]);
    const moon = scene.bodies.moon.positionKm;
    expect(phase(scene, add(moon, [100000, 0, 0]), 'moon').illuminatedFraction).toBe(1);
    expect(phase(scene, add(moon, [-100000, 0, 0]), 'moon').illuminatedFraction).toBe(0);
    expect(phase(scene, add(moon, [0, 100000, 0]), 'moon').angleDeg).toBe(90);
    expect(() => phase(scene, moon, 'moon')).toThrow();
  });
  it.each([...SNAPSHOTS, ECLIPSE_SNAPSHOTS[1]])('keeps orthonormal time-dependent body axes at %s', utc => {
    const scene = systemSnapshot(new Date(utc));
    for (const id of BODY_IDS) {
      const pose = bodyPose(id, new Date(utc));
      expect(length(pose.prime)).toBeCloseTo(1, 12);
      expect(length(pose.east)).toBeCloseTo(1, 12);
      expect(length(pose.north)).toBeCloseTo(1, 12);
      expect(dot(pose.prime, pose.north)).toBeCloseTo(0, 12);
      expect(length(subtract(cross(pose.prime, pose.east), pose.north))).toBeLessThan(1e-12);
    }
    const earth = bodyPose('earth', new Date(utc));
    const reference = ObserverVector(new Date(utc), new Observer(0, 0, 0), false);
    expect(dot(earth.prime, unit([reference.x, reference.y, reference.z]))).toBeCloseTo(1, 12);
    const moon = bodyPose('moon', new Date(utc));
    expect(dot(moon.prime, unit(subtract(scene.bodies.earth.positionKm, scene.bodies.moon.positionKm)))).toBeGreaterThan(0.98);
  });
  it('rotates Earth with time instead of fixing the texture in inertial space', () => {
    const a = bodyPose('earth', new Date('2026-01-01T00:00:00Z'));
    const b = bodyPose('earth', new Date('2026-01-01T06:00:00Z'));
    expect(Math.abs(dot(a.prime, b.prime))).toBeLessThan(0.01);
  });
  it('visual switches never modify physical data or scientific illumination', () => {
    const store = new SystemStore(), snapshot = store.state.snapshot;
    const camera = add(snapshot.bodies.earth.positionKm, multiply(unit(subtract(snapshot.bodies.sun.positionKm, snapshot.bodies.earth.positionKm)), 20000));
    const expected = illumination(snapshot, camera, 'earth');
    store.update({ lighting: 'debug', uiLighting: false, scale: 'physical' });
    expect(store.state.snapshot).toBe(snapshot);
    expect(illumination(store.state.snapshot, camera, 'earth')).toEqual(expected);
    expect(illumination(snapshot, camera, 'moon').moonFromCenter).toBeNull();
  });
});
