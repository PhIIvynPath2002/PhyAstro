import { length, subtract, type SystemBodyId, type VectorKm } from './Bodies';
import type { SystemSnapshot } from './Ephemeris';

export const dot = (a: VectorKm, b: VectorKm): number => a.reduce((sum, value, i) => sum + value * b[i], 0);
export function unit(a: VectorKm): VectorKm {
  const d = length(a);
  if (!Number.isFinite(d) || d === 0) throw new RangeError('A finite nonzero direction is required.');
  return [a[0] / d, a[1] / d, a[2] / d];
}
const clamp = (x: number) => Math.max(-1, Math.min(1, x));
export function phase(snapshot: SystemSnapshot, observerKm: VectorKm, target: 'earth' | 'moon') {
  const body = snapshot.bodies[target];
  const towardSun = unit(subtract(snapshot.bodies.sun.positionKm, body.positionKm));
  const towardObserver = unit(subtract(observerKm, body.positionKm));
  const cosine = clamp(dot(towardSun, towardObserver));
  return { angleDeg: Math.acos(cosine) * 180 / Math.PI, illuminatedFraction: (1 + cosine) / 2, towardSun };
}

// Uniform-brightness circular discs in the local angular tangent plane.
// This approximates spherical-cap overlap, not limb darkening or atmospheric optics.
export function visibleDiscFraction(solarRadius: number, blockerRadius: number, separation: number): number {
  if (![solarRadius, blockerRadius, separation].every(Number.isFinite) || solarRadius <= 0 || blockerRadius < 0 || separation < 0)
    throw new RangeError('Invalid angular disc geometry.');
  const a = solarRadius, b = blockerRadius, d = separation;
  if (d >= a + b || b === 0) return 1;
  if (d <= Math.abs(a - b)) return Math.max(0, 1 - Math.min(a, b) ** 2 / a ** 2);
  const overlap = a * a * Math.acos(clamp((d * d + a * a - b * b) / (2 * d * a)))
    + b * b * Math.acos(clamp((d * d + b * b - a * a) / (2 * d * b)))
    - 0.5 * Math.sqrt(Math.max(0, (-d + a + b) * (d + a - b) * (d - a + b) * (d + a + b)));
  return Math.max(0, Math.min(1, 1 - overlap / (Math.PI * a * a)));
}

export function solarVisibility(point: VectorKm, snapshot: SystemSnapshot, blocker: 'earth' | 'moon') {
  const sun = snapshot.bodies.sun, body = snapshot.bodies[blocker];
  const s = subtract(sun.positionKm, point), b = subtract(body.positionKm, point);
  const ds = length(s), db = length(b);
  if (ds <= sun.physicalRadiusKm) throw new RangeError('Solar visibility requires a point outside the Sun.');
  if (db <= body.physicalRadiusKm) return { fraction: 0, state: 'inside' as const };
  if (db >= ds || dot(s, b) <= 0) return { fraction: 1, state: 'clear' as const };
  const us = unit(s), ub = unit(b);
  const cross: VectorKm = [us[1] * ub[2] - us[2] * ub[1], us[2] * ub[0] - us[0] * ub[2], us[0] * ub[1] - us[1] * ub[0]];
  const separation = Math.atan2(length(cross), dot(us, ub));
  const fraction = visibleDiscFraction(Math.asin(sun.physicalRadiusKm / ds), Math.asin(body.physicalRadiusKm / db), separation);
  return { fraction, state: fraction <= 1e-10 ? 'umbra' as const : fraction < 1 - 1e-10 ? 'penumbra' as const : 'clear' as const };
}

export function illumination(snapshot: SystemSnapshot, cameraKm: VectorKm, observer: SystemBodyId) {
  return {
    earthSunDirection: unit(subtract(snapshot.bodies.sun.positionKm, snapshot.bodies.earth.positionKm)),
    moonSunDirection: unit(subtract(snapshot.bodies.sun.positionKm, snapshot.bodies.moon.positionKm)),
    moonFromCamera: phase(snapshot, cameraKm, 'moon'),
    moonFromCenter: observer === 'moon' ? null : phase(snapshot, snapshot.bodies[observer].positionKm, 'moon'),
    moonShadow: solarVisibility(snapshot.bodies.moon.positionKm, snapshot, 'earth'),
    earthCenterShadow: solarVisibility(snapshot.bodies.earth.positionKm, snapshot, 'moon'),
  };
}
