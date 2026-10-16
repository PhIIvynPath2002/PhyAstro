import * as THREE from 'three';
import type { SystemBodyId } from '../../core/system/Bodies';

export interface RenderSphere { id: SystemBodyId; center: THREE.Vector3; radius: number }
export interface Visibility {
  inFrustum: boolean;
  occluded: boolean;
  partial: boolean;
  inView: boolean;
}
export function bodyVisibility(camera: THREE.PerspectiveCamera, target: RenderSphere, bodies: readonly RenderSphere[]): Visibility {
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const inFrustum = frustum.intersectsSphere(new THREE.Sphere(target.center, target.radius));
  const direction = target.center.clone().sub(camera.position);
  const distance = direction.length();
  const angularRadius = Math.asin(Math.min(1, target.radius / distance));
  let occluded = false, partial = false;
  for (const blocker of bodies) {
    if (blocker.id === target.id) continue;
    const toward = blocker.center.clone().sub(camera.position);
    const d = toward.length();
    if (d <= blocker.radius || d >= distance - target.radius) continue;
    const separation = direction.angleTo(toward);
    const blockingRadius = Math.asin(Math.min(1, blocker.radius / d));
    if (separation + angularRadius < blockingRadius) occluded = true;
    else if (separation < blockingRadius + angularRadius) partial = true;
  }
  return { inFrustum, occluded, partial, inView: inFrustum && !occluded };
}
