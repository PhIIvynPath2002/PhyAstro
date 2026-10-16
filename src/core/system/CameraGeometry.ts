import { add, length, multiply, subtract, type VectorKm } from './Bodies';

export interface Obstacle { center: VectorKm; radiusKm: number }
const dot = (a: VectorKm, b: VectorKm) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Sweep the whole movement segment, then resolve any overlap caused by a new epoch or scale.
export function constrainCamera(proposed: VectorKm, previous: VectorKm | null, obstacles: readonly Obstacle[]): VectorKm {
  let result = proposed;
  if (previous) {
    const movement = subtract(proposed, previous);
    const a = dot(movement, movement);
    let first = 1;
    if (a > 0) for (const sphere of obstacles) {
      const relative = subtract(previous, sphere.center);
      const b = 2 * dot(relative, movement);
      const c = dot(relative, relative) - sphere.radiusKm ** 2;
      const discriminant = b * b - 4 * a * c;
      if (c > 0 && discriminant >= 0) {
        const entry = (-b - Math.sqrt(discriminant)) / (2 * a);
        if (entry >= 0 && entry < first) first = Math.max(0, entry - 1e-8);
      }
    }
    result = add(previous, multiply(movement, first));
  }
  for (let iteration = 0; iteration < 8; iteration++) {
    let changed = false;
    for (const sphere of obstacles) {
      const relative = subtract(result, sphere.center);
      const distance = length(relative);
      if (distance < sphere.radiusKm) {
        const direction: VectorKm = distance > 1e-12 ? multiply(relative, 1 / distance) : [0, 0, 1];
        result = add(sphere.center, multiply(direction, sphere.radiusKm * (1 + 1e-9)));
        changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}
