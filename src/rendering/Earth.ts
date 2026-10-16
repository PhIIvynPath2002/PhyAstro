import * as THREE from 'three';
import { geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import land from 'world-atlas/land-110m.json';
import { EARTH_RADIUS } from '../celestial/CelestialSphere';

export function createEarth(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#22292c';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const projection = geoEquirectangular().translate([1024, 512]).scale(2048 / (2 * Math.PI));
  const path = geoPath(projection, context);
  context.beginPath();
  const topology = land as unknown as Topology<{ land: GeometryCollection }>;
  path(feature(topology, topology.objects.land));
  context.fillStyle = '#67726e';
  context.fill();
  context.strokeStyle = '#818a80';
  context.lineWidth = 0.65;
  context.stroke();
  context.beginPath();
  path(geoGraticule10());
  context.strokeStyle = '#a3aaa122';
  context.lineWidth = 0.7;
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 96, 64),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 }),
  );
  earth.name = 'earth';
  return earth;
}
