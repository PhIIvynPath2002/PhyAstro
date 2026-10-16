import { Vector3 } from 'three';
import type { Direction, LocalBasis } from '../core/astronomy/CoordinateSystems';
import { fromObserverFrame, toObserverFrame } from '../core/astronomy/ObserverView';

// A proper rotation (not a reflection): astronomy XYZ -> renderer XZ(-Y).
export const toRenderVector = (v: Direction): Vector3 => new Vector3(v[0], v[2], -v[1]);
export const toAstronomyVector = (v: Vector3): Direction => [v.x, -v.z, v.y];

export const toObserverVector = (direction: Direction, basis: LocalBasis): Vector3 =>
  toRenderVector(toObserverFrame(direction, basis));
export const fromObserverVector = (vector: Vector3, basis: LocalBasis): Direction =>
  fromObserverFrame(toAstronomyVector(vector), basis);
