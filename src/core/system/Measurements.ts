import { length, multiply, subtract, type SystemBodyId, type VectorKm } from './Bodies';
import type { BodyState, SystemSnapshot } from './Ephemeris';

export interface RelativeMeasurement {
  observer: SystemBodyId;
  target: SystemBodyId;
  vectorKm: VectorKm;
  distanceKm: number;
  direction: VectorKm;
  angularDiameterRad: number;
  angularDiameterDeg: number;
  positionKind: 'geometric';
}
export function angularDiameter(radiusKm: number, distanceKm: number): number {
  if (!Number.isFinite(radiusKm) || !Number.isFinite(distanceKm) || radiusKm <= 0 || distanceKm <= radiusKm)
    throw new RangeError('Angular diameter requires finite 0 < radius < distance, in the same units.');
  return 2 * Math.asin(radiusKm / distanceKm);
}
export function relativeStates(observer: BodyState, target: BodyState): RelativeMeasurement {
  if (observer.frame !== target.frame || observer.unit !== target.unit || observer.utc !== target.utc || observer.ttDaysSinceJ2000 !== target.ttDaysSinceJ2000 || observer.kind !== target.kind)
    throw new RangeError('Relative states must share frame, units, epoch and position kind.');
  if (observer.id === target.id) throw new RangeError('Observer and target must be different bodies.');
  const vectorKm = subtract(target.positionKm, observer.positionKm);
  const distanceKm = length(vectorKm);
  const angularDiameterRad = angularDiameter(target.physicalRadiusKm, distanceKm);
  return { observer: observer.id, target: target.id, vectorKm, distanceKm, direction: multiply(vectorKm, 1 / distanceKm),
    angularDiameterRad, angularDiameterDeg: angularDiameterRad * 180 / Math.PI, positionKind: 'geometric' };
}
export const measure = (snapshot: SystemSnapshot, observer: SystemBodyId, target: SystemBodyId): RelativeMeasurement =>
  relativeStates(snapshot.bodies[observer], snapshot.bodies[target]);
