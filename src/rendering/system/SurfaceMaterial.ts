import * as THREE from 'three';
import earthUrl from '../../assets/earth.jpg?inline';
import moonUrl from '../../assets/moon.jpg?inline';

export function loadSurfaceTextures(onLoad: () => void) {
  const loader = new THREE.TextureLoader();
  const earth = loader.load(earthUrl, onLoad), moon = loader.load(moonUrl, onLoad);
  for (const texture of [earth, moon]) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  return { earth, moon };
}

export function solarTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(canvas.width, canvas.height);
  let seed = 0x12345678;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const granule = seed / 4294967296;
    const bands = Math.sin(x / 1024 * Math.PI * 28 + Math.sin(y * 0.04)) * Math.sin(y * 0.05);
    const i = (y * canvas.width + x) * 4;
    image.data[i] = 235 + 18 * granule;
    image.data[i + 1] = 186 + 22 * granule + bands * 6;
    image.data[i + 2] = 110 + 24 * granule + bands * 8;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

export function surfaceMaterial(texture: THREE.Texture, radiusKm: number, solarRadiusKm: number, blockerRadiusKm: number) {
  return new THREE.ShaderMaterial({
    uniforms: { surfaceMap: { value: texture }, radiusKm: { value: radiusKm }, solarRadiusKm: { value: solarRadiusKm },
      blockerRadiusKm: { value: blockerRadiusKm }, sunLocalKm: { value: new THREE.Vector3() },
      blockerLocalKm: { value: new THREE.Vector3() }, ambient: { value: 0 } },
    vertexShader: `varying vec2 surfaceUv;
      varying vec3 surfaceNormal;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        surfaceUv = uv; surfaceNormal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `precision highp float;
      uniform sampler2D surfaceMap;
      uniform float radiusKm, solarRadiusKm, blockerRadiusKm, ambient;
      uniform vec3 sunLocalKm, blockerLocalKm;
      varying vec2 surfaceUv;
      varying vec3 surfaceNormal;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float visibleSun(vec3 s, vec3 b) {
        float ds = length(s), db = length(b);
        if (db >= ds || dot(s,b) <= 0.0) return 1.0;
        if (db <= blockerRadiusKm) return 0.0;
        float a = asin(clamp(solarRadiusKm / ds, 0.0, 1.0));
        float r = asin(clamp(blockerRadiusKm / db, 0.0, 1.0));
        vec3 us = s / ds, ub = b / db;
        float d = atan(length(cross(us, ub)), dot(us, ub));
        if (d >= a+r) return 1.0;
        if (d <= abs(a-r)) return max(0.0, 1.0 - pow(min(a,r)/a, 2.0));
        float x = acos(clamp((d*d+a*a-r*r)/(2.0*d*a), -1.0, 1.0));
        float y = acos(clamp((d*d+r*r-a*a)/(2.0*d*r), -1.0, 1.0));
        float area = a*a*x + r*r*y - 0.5*sqrt(max(0.0,(-d+a+r)*(d+a-r)*(d-a+r)*(d+a+r)));
        return clamp(1.0 - area / (PI*a*a), 0.0, 1.0);
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(surfaceNormal);
        vec3 physicalPoint = n * radiusKm;
        vec3 sun = sunLocalKm - physicalPoint;
        vec3 blocker = blockerLocalKm - physicalPoint;
        float direct = max(0.0, dot(n, normalize(sun))) * visibleSun(sun, blocker);
        vec3 albedo = texture2D(surfaceMap, surfaceUv).rgb;
        gl_FragColor = vec4(albedo * (direct + ambient), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
