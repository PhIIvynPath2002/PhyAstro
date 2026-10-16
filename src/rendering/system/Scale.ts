import type { ScaleMode } from '../../core/system/Store';
import type { SystemBodyId, VectorKm } from '../../core/system/Bodies';
import { subtract } from '../../core/system/Bodies';
import { toRenderVector } from '../coordinates';

export const KM_PER_RENDER_UNIT = 1_000_000;
const ENHANCEMENT = { sun: 1, earth: 12, moon: 20 };
export const localRenderPosition = (positionKm: VectorKm, cameraKm: VectorKm) =>
  toRenderVector(subtract(positionKm, cameraKm)).multiplyScalar(1 / KM_PER_RENDER_UNIT);
export function renderRadiusKm(id: SystemBodyId, radiusKm: number, cameraDistanceKm: number, fovDegrees: number, height: number, mode: ScaleMode): number {
  if (mode === 'physical') return radiusKm;
  const minimumPixelRadius = 6;
  return Math.max(radiusKm * ENHANCEMENT[id], cameraDistanceKm * Math.tan(fovDegrees * Math.PI / 360) * minimumPixelRadius * 2 / Math.max(1, height));
}
