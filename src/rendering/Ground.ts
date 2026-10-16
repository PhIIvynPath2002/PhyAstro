import * as THREE from 'three';
import { SPHERE_RADIUS } from '../celestial/CelestialSphere';

export function createGround(): THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> {
  // A constant-gray lower hemisphere marks the geometric horizon, not terrain.
  const ground = new THREE.Mesh(
    new THREE.SphereGeometry(SPHERE_RADIUS * 3, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x202020, side: THREE.BackSide, depthWrite: false }),
  );
  ground.visible = false;
  ground.renderOrder = -1;
  return ground;
}
