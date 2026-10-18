import { Body, RotationAxis, Rotation_EQD_EQJ, RotateVector, SiderealTime, Vector } from 'astronomy-engine';
import type { SystemBodyId, VectorKm } from './Bodies';
import { unit } from './Illumination';

export interface BodyPose { prime: VectorKm; east: VectorKm; north: VectorKm; source: string }
export const cross = (a: VectorKm, b: VectorKm): VectorKm =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function bodyPose(id: SystemBodyId, instant: Date): BodyPose {
  const axis = RotationAxis({ sun: Body.Sun, earth: Body.Earth, moon: Body.Moon }[id], instant);
  const north = unit([axis.north.x, axis.north.y, axis.north.z]);
  let prime: VectorKm;
  if (id === 'earth') {
    // Greenwich apparent sidereal angle in true-of-date, then back to EQJ.
    const angle = SiderealTime(instant) * Math.PI / 12;
    const vector = RotateVector(Rotation_EQD_EQJ(instant), new Vector(Math.cos(angle), Math.sin(angle), 0, axis.north.t));
    prime = unit([vector.x, vector.y, vector.z]);
  } else {
    const ra = axis.ra * Math.PI / 12, w = (axis.spin % 360) * Math.PI / 180;
    const node: VectorKm = [-Math.sin(ra), Math.cos(ra), 0];
    const tangent = cross(north, node);
    prime = unit(node.map((value, i) => value * Math.cos(w) + tangent[i] * Math.sin(w)) as unknown as VectorKm);
  }
  return { prime, east: unit(cross(north, prime)), north,
    source: id === 'earth' ? 'Astronomy Engine GAST + EQD→EQJ; UTC≈UT1, precession/nutation; no polar motion'
      : 'Astronomy Engine RotationAxis (IAU elements; lunar periodic libration terms)' };
}
