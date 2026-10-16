import * as THREE from 'three';
import type { BodyPosition } from '../core/astronomy/Ephemeris';
import { equatorialDirection, type LocalBasis } from '../core/astronomy/CoordinateSystems';
import { SPHERE_RADIUS } from '../celestial/CelestialSphere';
import { toObserverVector, toRenderVector } from './coordinates';

export function createBody(body: BodyPosition, basis?: LocalBasis, showBelow = true): THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] {
  const direction = equatorialDirection(basis ? body.topocentric : body.geocentric);
  const center = (basis ? toObserverVector(direction, basis) : toRenderVector(direction)).multiplyScalar(SPHERE_RADIUS);
  const diameter = basis ? body.topocentricAngularDiameter : body.angularDiameter;
  // A sphere at this display distance subtends the actual angular diameter at the origin.
  const size = SPHERE_RADIUS * Math.sin(diameter / 2);
  const make = (below: boolean) => {
    const material = new THREE.MeshBasicMaterial({
      color: basis ? body.id === 'sun' ? 0xf2f2f2 : 0xbdbdbd : body.id === 'sun' ? 0xe6d6a6 : 0xbdbdbd,
      transparent: below, opacity: below ? 0.3 : 1,
      clippingPlanes: basis ? [new THREE.Plane(new THREE.Vector3(0, below ? -1 : 1, 0), 0)] : [],
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 24), material);
    mesh.position.copy(center);
    mesh.userData.id = body.id;
    mesh.userData.below = below;
    return mesh;
  };
  return basis && showBelow ? [make(false), make(true)] : [make(false)];
}
