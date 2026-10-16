import { mean } from 'astronomia/sidereal';
import { meanObliquity } from 'astronomia/nutation';
import { deltaT } from 'astronomia/deltat';
import { DEG, normalize, TAU } from './CoordinateSystems';

export interface AstronomicalTime {
  utc: Date;
  julianDate: number;
  julianEphemerisDate: number;
  gmstSeconds: number;
  gmst: number;
  obliquity: number;
}

export function astronomicalTime(instant: Date): AstronomicalTime {
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Invalid UTC time.');
  const year = instant.getUTCFullYear();
  if (year < 1900 || year > 2100) throw new RangeError('Supported dates: 1900-2100.');
  const start = Date.UTC(year, 0, 1);
  const decimalYear = year + (instant.getTime() - start) / (Date.UTC(year + 1, 0, 1) - start);
  const julianDate = instant.getTime() / 86400000 + 2440587.5;
  // Phase 0.1 approximates UT1 by UTC. Delta T supplies an estimated TT for obliquity.
  const julianEphemerisDate = julianDate + deltaT(decimalYear) / 86400;
  const gmstSeconds = mean(julianDate);
  return {
    utc: new Date(instant), julianDate, julianEphemerisDate, gmstSeconds,
    gmst: normalize(gmstSeconds / 86400 * TAU),
    obliquity: meanObliquity(julianEphemerisDate),
  };
}

export const localSiderealTime = (time: AstronomicalTime, longitudeDegrees: number): number =>
  normalize(time.gmst + longitudeDegrees * DEG);
