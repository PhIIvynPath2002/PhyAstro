export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const HOUR = Math.PI / 12;
export const normalize = (angle: number): number => ((angle % TAU) + TAU) % TAU;
export const clampUnit = (value: number): number => Math.max(-1, Math.min(1, value));

// All astronomy vectors use a right-handed, equatorial Z-up frame.
export type Direction = readonly [number, number, number];
export interface EquatorialCoordinates { ra: number | null; dec: number }
export interface HorizontalCoordinates { az: number | null; alt: number }
export interface EclipticCoordinates { lon: number; lat: number }
export interface LocalBasis { east: Direction; north: Direction; zenith: Direction }

export function equatorialDirection({ ra, dec }: EquatorialCoordinates): Direction {
  return [Math.cos(dec) * Math.cos(ra ?? 0), Math.cos(dec) * Math.sin(ra ?? 0), Math.sin(dec)];
}

export function directionToEquatorial(v: Direction): EquatorialCoordinates {
  const length = Math.hypot(...v);
  if (!length) throw new RangeError('A direction must be nonzero.');
  return {
    ra: Math.hypot(v[0], v[1]) / length < 1e-10 ? null : normalize(Math.atan2(v[1], v[0])),
    dec: Math.asin(clampUnit(v[2] / length)),
  };
}

export function dot(a: Direction, b: Direction): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function combine(a: Direction, b: Direction, x: number, y: number): Direction {
  return [a[0] * x + b[0] * y, a[1] * x + b[1] * y, a[2] * x + b[2] * y];
}
