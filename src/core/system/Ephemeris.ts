import { AstroTime, BaryState, Body, KM_PER_AU } from 'astronomy-engine';
import { astronomicalTime } from '../astronomy/Time';
import { BODY_DEFINITIONS, BODY_IDS, type BodyDefinition, type SystemBodyId, type VectorKm } from './Bodies';

export const SYSTEM_FRAME = {
  id: 'SSB_EQJ', origin: 'Solar System Barycenter (SSB)', orientation: 'J2000 mean equator and equinox (EQJ)',
  axes: '+X J2000 mean equinox; +Z J2000 north celestial pole; +Y completes right-handed axes',
  unit: 'km', ephemerisTimeScale: 'TT', inputTimeScale: 'UTC (UT1 approximated by UTC)',
  source: 'Astronomy Engine 2.1.19: BaryState; no light-time or aberration',
  kmPerLibraryAU: KM_PER_AU,
  accuracy: 'Approximate analytical ephemeris; independent JPL comparison pending. Display precision is not accuracy.',
} as const;
export type PositionKind = 'geometric' | 'apparent';
export interface BodyState extends BodyDefinition {
  positionKm: VectorKm;
  utc: string;
  ttDaysSinceJ2000: number;
  frame: typeof SYSTEM_FRAME.id;
  unit: 'km';
  kind: 'geometric';
}
export interface SystemSnapshot {
  utc: string;
  julianDateUT: number;
  julianDateTT: number;
  deltaTSeconds: number;
  frame: typeof SYSTEM_FRAME;
  bodies: Readonly<Record<SystemBodyId, BodyState>>;
}
export interface EphemerisProvider {
  snapshot(instant: Date, kind?: PositionKind): SystemSnapshot;
}
export function systemSnapshot(instant: Date, kind: PositionKind = 'geometric'): SystemSnapshot {
  astronomicalTime(instant);
  if (kind !== 'geometric') throw new RangeError('Apparent positions are not implemented in v0.2.0.');
  const time = new AstroTime(instant);
  const engineBodies = { sun: Body.Sun, earth: Body.Earth, moon: Body.Moon };
  const utc = instant.toISOString();
  const bodies = Object.fromEntries(BODY_IDS.map(id => {
    const vector = BaryState(engineBodies[id], time);
    const positionKm: VectorKm = [vector.x * KM_PER_AU, vector.y * KM_PER_AU, vector.z * KM_PER_AU];
    return [id, Object.freeze({ ...BODY_DEFINITIONS[id], positionKm: Object.freeze(positionKm), utc,
      ttDaysSinceJ2000: time.tt, frame: SYSTEM_FRAME.id, unit: 'km' as const, kind: 'geometric' as const })];
  })) as Record<SystemBodyId, BodyState>;
  return Object.freeze({ utc, julianDateUT: 2451545 + time.ut, julianDateTT: 2451545 + time.tt,
    deltaTSeconds: (time.tt - time.ut) * 86400, frame: SYSTEM_FRAME, bodies: Object.freeze(bodies) });
}
export const offlineEphemeris: EphemerisProvider = { snapshot: systemSnapshot };
