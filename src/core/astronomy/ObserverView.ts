import { dot, type Direction, type LocalBasis } from './CoordinateSystems';

export const HORIZON_EPSILON = 1e-10;

// Local coordinates are east, north, up. They describe directions, not Earth-scale positions.
export function toObserverFrame(direction: Direction, basis: LocalBasis): Direction {
  return [dot(direction, basis.east), dot(direction, basis.north), dot(direction, basis.zenith)];
}

export function fromObserverFrame(local: Direction, basis: LocalBasis): Direction {
  return [0, 1, 2].map(i => local[0] * basis.east[i] + local[1] * basis.north[i] + local[2] * basis.zenith[i]) as unknown as Direction;
}

export interface HorizonSegment { below: boolean; points: Direction[] }

export function splitAtHorizon(points: readonly Direction[], basis: LocalBasis): HorizonSegment[] {
  if (points.length < 2) return [];
  const height = (point: Direction) => {
    const value = dot(point, basis.zenith);
    return Math.abs(value) < HORIZON_EPSILON ? 0 : value;
  };
  const segments: HorizonSegment[] = [];
  let active: HorizonSegment = { below: height(points[0]) < 0, points: [points[0]] };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const ha = height(a), hb = height(b);
    const below = hb < 0;
    if (below !== active.below) {
      const t = ha / (ha - hb);
      const crossing = a.map((value, axis) => value + (b[axis] - value) * t) as unknown as Direction;
      active.points.push(crossing);
      segments.push(active);
      active = { below, points: [crossing] };
    }
    active.points.push(b);
  }
  segments.push(active);
  return segments.filter(segment => segment.points.some(point =>
    Math.hypot(...point.map((value, i) => value - segment.points[0][i])) > HORIZON_EPSILON));
}
