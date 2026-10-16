import { Equatorial } from 'astronomia/coord';
import { Precessor } from 'astronomia/precess';
import { directionToEquatorial, equatorialDirection, type Direction } from '../astronomy/CoordinateSystems';
import { astronomicalTime } from '../astronomy/Time';

// v0.1.3 references are MEAN of date, not Astronomy Engine's true-of-date EQD.
export function meanDateToJ2000(instant: Date): (direction: Direction) => Direction {
  const epoch = 2000 + (astronomicalTime(instant).julianEphemerisDate - 2451545) / 365.25;
  const precessor = new Precessor(epoch, 2000);
  return direction => {
    const eq = directionToEquatorial(direction);
    const transformed = precessor.precess(new Equatorial(eq.ra ?? 0, eq.dec));
    return equatorialDirection(transformed);
  };
}
