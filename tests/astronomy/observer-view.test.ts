import { describe, expect, it } from 'vitest';
import { observerBasis } from '../../src/core/astronomy/Observer';
import { astronomicalTime } from '../../src/core/astronomy/Time';
import { fromObserverFrame, splitAtHorizon, toObserverFrame } from '../../src/core/astronomy/ObserverView';
import { DEG, dot, type Direction } from '../../src/core/astronomy/CoordinateSystems';
import { celestialSphere } from '../../src/celestial/CelestialSphere';
import { Store } from '../../src/core/data/State';

const time = astronomicalTime(new Date('2000-01-01T12:00:00Z'));
describe('observer directional frame', () => {
  for (const latitude of [-90, -33.8688, 0, 39.9042, 51.5074, 90]) {
    it(`preserves directions and pole altitude at latitude ${latitude}`, () => {
      const basis = observerBasis({ name: 'test', latitude, longitude: 116.4074 }, time);
      for (const [index, direction] of [basis.east, basis.north, basis.zenith].entries()) {
        toObserverFrame(direction, basis).forEach((value, axis) => expect(value).toBeCloseTo(index === axis ? 1 : 0, 12));
        fromObserverFrame(toObserverFrame(direction, basis), basis).forEach((value, axis) => expect(value).toBeCloseTo(direction[axis], 12));
      }
      expect(Math.asin(toObserverFrame([0, 0, 1], basis)[2]) / DEG).toBeCloseTo(latitude, 8);
    });
  }
  it('splits crossings on the exact geometric horizon without gaps', () => {
    const basis = { east: [1, 0, 0], north: [0, 1, 0], zenith: [0, 0, 1] } as const;
    const points: Direction[] = [[1, 0, 1], [1, 0, -1], [-1, 0, -1], [-1, 0, 1]];
    const parts = splitAtHorizon(points, basis);
    expect(parts.map(part => part.below)).toEqual([false, true, false]);
    expect(parts[0].points.at(-1)).toEqual([1, 0, 0]);
    expect(parts[1].points[0]).toEqual(parts[0].points.at(-1));
    expect(parts[2].points[0]).toEqual(parts[1].points.at(-1));
    expect(splitAtHorizon([[1, 0, 0], [0, 1, 0]], basis).map(part => part.below)).toEqual([false]);
    expect(splitAtHorizon([], basis)).toEqual([]);
  });
  it('classifies every celestial grid segment consistently', () => {
    const state = new Store().state;
    for (const latitude of [-90, -33.8688, 0, 39.9042, 90]) {
      const observer = { ...state.observer, latitude };
      const basis = observerBasis(observer, astronomicalTime(state.instant));
      for (const line of celestialSphere({ ...state, observer, view: 'observer' }).lines) {
        for (const part of splitAtHorizon(line.points, basis)) for (const point of part.points) {
          const height = dot(point, basis.zenith);
          expect(part.below ? height <= 1e-10 : height >= -1e-10).toBe(true);
        }
      }
    }
  });
});
