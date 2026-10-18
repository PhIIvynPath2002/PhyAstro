import { test, expect, type Page } from '@playwright/test';
import * as THREE from 'three';
import { bodyPose } from '../../src/core/system/BodyPose';
import { dot, solarVisibility, unit } from '../../src/core/system/Illumination';
import { subtract, type SystemBodyId, type VectorKm } from '../../src/core/system/Bodies';
import type { SystemSnapshot } from '../../src/core/system/Ephemeris';
import { toAstronomyVector, toRenderVector } from '../../src/rendering/coordinates';

interface State {
  snapshot: SystemSnapshot; mode: string; texturesReady: boolean; instant: string; scale: string;
  cameraKm: VectorKm; cameraQuaternion: number[]; cameraOffsetKm: number[]; interacting: boolean;
  fov: number; illumination: { moonFromCamera: { angleDeg: number; illuminatedFraction: number }; moonShadow: { state: string; fraction: number } };
  uiSun: { x: number; y: number; strength: number }; lighting: string;
  bodies: { id: SystemBodyId; renderRadiusKm: number; orientation: number[]; renderPosition: number[]; screen: number[] }[];
}
const state = (page: Page) => page.evaluate(() => (window as unknown as { __phyastro: State }).__phyastro);
async function ready(page: Page) {
  await page.goto('/');
  await expect.poll(async () => (await state(page))?.texturesReady).toBe(true);
  await page.getByLabel('地球参考线', { exact: true }).uncheck();
}
async function pixels(page: Page) {
  return page.locator('#space-stage canvas').evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2')!;
    const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const sampled: number[] = [];
    for (let iy = 0; iy < 50; iy++) for (let ix = 0; ix < 50; ix++) {
      const x = Math.round(ix / 50 * gl.drawingBufferWidth), y = Math.round(iy / 50 * gl.drawingBufferHeight);
      const index = ((gl.drawingBufferHeight - 1 - y) * gl.drawingBufferWidth + x) * 4;
      sampled.push(...data.slice(index, index + 4));
    }
    return { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, data: sampled };
  });
}

// Independent CPU ray/sphere intersections predict local solar incidence for actual GPU pixels.
async function surfaceSamples(page: Page, id: 'earth' | 'moon') {
  const s = await state(page), image = await pixels(page);
  const body = s.bodies.find(body => body.id === id)!;
  const c = new THREE.Vector3().fromArray(body.renderPosition), r = body.renderRadiusKm / 1e6;
  const camera = new THREE.PerspectiveCamera(s.fov, image.width / image.height);
  camera.quaternion.fromArray(s.cameraQuaternion); camera.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();
  const samples: { intensity: number; cosine: number; shadow: number }[] = [];
  for (let iy = 2; iy < 48; iy++) for (let ix = 2; ix < 48; ix++) {
    const x = Math.round(ix / 50 * image.width), y = Math.round(iy / 50 * image.height);
    raycaster.setFromCamera(new THREE.Vector2(x / image.width * 2 - 1, 1 - y / image.height * 2), camera);
    const hit = raycaster.ray.intersectSphere(new THREE.Sphere(c, r), new THREE.Vector3());
    if (!hit) continue;
    const n = hit.clone().sub(c).normalize();
    if (-n.dot(raycaster.ray.direction) < 0.35) continue;
    const normal = toAstronomyVector(n), physicalBody = s.snapshot.bodies[id];
    const point = physicalBody.positionKm.map((value, i) => value + normal[i] * physicalBody.physicalRadiusKm) as unknown as VectorKm;
    const cosine = dot(normal, unit(subtract(s.snapshot.bodies.sun.positionKm, point)));
    const index = (iy * 50 + ix) * 4;
    samples.push({ cosine, intensity: Math.max(...image.data.slice(index, index + 3)),
      shadow: solarVisibility(point, s.snapshot, id === 'earth' ? 'moon' : 'earth').fraction });
  }
  return samples;
}

test('GPU textures and strict solar terminators agree with independent physical surface normals', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /shader|WebGL|GL_INVALID/i.test(message.text())) errors.push(message.text()); });
  await page.setViewportSize({ width: 1200, height: 850 });
  await ready(page);
  const original = (await state(page)).snapshot;
  for (const id of ['moon', 'earth'] as const) {
    if (id === 'earth') await page.getByLabel('观测中心', { exact: true }).selectOption('moon');
    await page.getByLabel('目标天体', { exact: true }).selectOption(id);
    await page.getByRole('button', { name: '近观目标', exact: true }).click();
    await page.waitForTimeout(250);
    const samples = await surfaceSamples(page, id);
    const day = samples.filter(p => p.cosine > 0.3 && p.shadow > 0.99);
    const night = samples.filter(p => p.cosine < -0.15);
    expect(day.length).toBeGreaterThan(10);
    expect(night.length).toBeGreaterThan(10);
    expect(day.filter(p => p.intensity > 12).length / day.length).toBeGreaterThan(0.95);
    expect(night.filter(p => p.intensity < 2).length / night.length).toBeGreaterThan(0.95);
    expect((await state(page)).snapshot).toEqual(original);
    await page.screenshot({ path: `test-results/v030-${id}-terminator.png` });
    await page.getByRole('button', { name: '返回观测中心', exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test('real eclipse snapshot darkens the Moon through finite solar disc occlusion, not phase opacity', async ({ page }) => {
  await ready(page);
  await page.getByLabel('时间快照', { exact: true }).selectOption('2026-03-03T11:34:00.000Z');
  await page.getByRole('button', { name: '近观目标', exact: true }).click();
  await page.waitForTimeout(200);
  const s = await state(page);
  expect(s.illumination.moonShadow.state).toBe('umbra');
  const samples = await surfaceSamples(page, 'moon');
  const eclipsedDay = samples.filter(p => p.cosine > 0.2 && p.shadow < 1e-6);
  expect(eclipsedDay.length).toBeGreaterThan(10);
  expect(eclipsedDay.filter(p => p.intensity < 2).length / eclipsedDay.length).toBeGreaterThan(0.95);
  await page.screenshot({ path: 'test-results/v030-lunar-eclipse.png' });
  const before = s.snapshot;
  await page.getByLabel('表面光照', { exact: true }).selectOption('debug');
  expect((await state(page)).snapshot).toEqual(before);
  const debugSamples = await surfaceSamples(page, 'moon');
  expect(debugSamples.some(p => p.intensity > 10)).toBe(true);
});

test('the actual surface shader reproduces CPU finite-disc total, partial and clear illumination', async ({ page }) => {
  await ready(page);
  const values = await page.evaluate(async () => {
    const threeModule = '/node_modules/.vite/deps/three.js';
    const surfaceModule = '/src/rendering/system/SurfaceMaterial.ts';
    const THREE = await import(/* @vite-ignore */ threeModule);
    const { surfaceMaterial } = await import(/* @vite-ignore */ surfaceModule);
    const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    map.needsUpdate = true;
    const material = surfaceMaterial(map, 1737.4, 695700, 6371.0088);
    material.uniforms.sunLocalKm.value.set(0, 0, 150000000);
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(65, 65);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.z = 4;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), material);
    scene.add(mesh);
    const gl = renderer.getContext(), values: number[] = [];
    for (const offset of [0, 6300, 12000]) {
      material.uniforms.blockerLocalKm.value.set(offset, 0, 400000);
      renderer.render(scene, camera);
      const pixel = new Uint8Array(4);
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      values.push(pixel[0]);
    }
    mesh.geometry.dispose(); material.dispose(); map.dispose(); renderer.dispose(); renderer.forceContextLoss();
    return values;
  });
  const snapshot = (await state(page)).snapshot;
  for (let i = 0; i < 3; i++) {
    const scene: SystemSnapshot = { ...snapshot, bodies: { ...snapshot.bodies,
      sun: { ...snapshot.bodies.sun, positionKm: [0, 0, 150000000] },
      earth: { ...snapshot.bodies.earth, positionKm: [[0, 6300, 12000][i], 0, 400000] } } };
    const expected = solarVisibility([0, 0, 1737.4], scene, 'earth').fraction;
    const srgb = expected <= 0.0031308 ? 12.92 * expected : 1.055 * expected ** (1 / 2.4) - 0.055;
    expect(Math.abs(values[i] - Math.round(srgb * 255))).toBeLessThanOrEqual(2);
  }
  expect(values[0]).toBe(0);
  expect(values[1]).toBeGreaterThan(0);
  expect(values[1]).toBeLessThan(255);
  expect(values[2]).toBe(255);
});

test('solar surface is emissive; camera-derived UI lighting can be disabled without scientific changes', async ({ page }) => {
  await ready(page);
  await page.getByLabel('目标天体', { exact: true }).selectOption('sun');
  await page.getByRole('button', { name: '近观目标', exact: true }).click();
  await expect.poll(async () => (await state(page)).uiSun.strength).toBeGreaterThan(0.15);
  const s = await state(page), image = await pixels(page);
  const i = (25 * 50 + 25) * 4;
  expect(image.data[i]).toBeGreaterThan(200);
  expect(image.data[i + 1]).toBeGreaterThan(150);
  expect(image.data[i]).toBeGreaterThan(image.data[i + 2]);
  await page.screenshot({ path: 'test-results/v030-emissive-sun.png' });
  await page.getByLabel('UI Lighting', { exact: true }).uncheck();
  await expect.poll(async () => (await state(page)).uiSun.strength).toBe(0);
  expect((await state(page)).snapshot).toEqual(s.snapshot);
  const after = await pixels(page);
  expect(after.data).toEqual(image.data);
});

test('poses match the scientific body basis and change with snapshots; all data remain physical', async ({ page }) => {
  await ready(page);
  for (const utc of ['2026-01-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z']) {
    await page.getByLabel('时间快照', { exact: true }).selectOption(utc);
    const s = await state(page);
    for (const id of ['earth', 'moon'] as const) {
      const q = new THREE.Quaternion().fromArray(s.bodies.find(body => body.id === id)!.orientation);
      const prime = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      expect(prime.distanceTo(toRenderVector(bodyPose(id, new Date(utc)).prime))).toBeLessThan(1e-10);
    }
    await page.getByLabel('显示比例', { exact: true }).selectOption('physical');
    expect((await state(page)).snapshot).toEqual(s.snapshot);
    await page.getByLabel('显示比例', { exact: true }).selectOption('enhanced');
  }
});

test('two-level navigation preserves independent camera states and has exactly two instrument submodes', async ({ page }) => {
  await ready(page);
  await page.locator('#space-stage').dispatchEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
  await expect.poll(async () => (await state(page)).interacting).toBe(false);
  const before = await state(page);
  await page.getByRole('button', { name: '天球坐标仪', exact: true }).click();
  await expect(page.locator('.primary-navigation button')).toHaveCount(2);
  await expect(page.locator('.view-switch button')).toHaveCount(2);
  await page.getByRole('button', { name: '地面视角', exact: true }).click();
  await page.locator('#scene-input').dispatchEvent('wheel', { deltaY: 80, bubbles: true, cancelable: true });
  await expect.poll(async () => (await state(page)).interacting).toBe(false);
  const ground = await state(page);
  await page.getByRole('button', { name: '返回空间系统', exact: true }).click();
  await expect.poll(async () => (await state(page)).cameraOffsetKm).toEqual(before.cameraOffsetKm);
  expect((await state(page)).cameraQuaternion).toEqual(before.cameraQuaternion);
  await page.getByRole('button', { name: '天球坐标仪', exact: true }).click();
  await expect.poll(async () => (await state(page)).cameraQuaternion).toEqual(ground.cameraQuaternion);
});

test('desktop and narrow viewports keep navigation and panels within the window and render moving pixels', async ({ page }) => {
  await ready(page);
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 850 });
    await page.getByRole('button', { name: '关闭科学调试', exact: true }).click();
    await page.getByRole('button', { name: '近观目标', exact: true }).click();
    await page.waitForTimeout(200);
    const before = await page.locator('canvas').screenshot();
    await page.locator('#space-stage').dispatchEvent('wheel', { deltaY: 180, bubbles: true, cancelable: true });
    await expect.poll(async () => (await state(page)).interacting).toBe(false);
    expect(await page.locator('canvas').screenshot()).not.toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.getByRole('button', { name: '科学调试面板', exact: true }).click();
    const nav = await page.locator('.primary-navigation').boundingBox();
    const panel = await page.locator('.system-debug').boundingBox();
    expect(nav!.x + nav!.width).toBeLessThanOrEqual(width);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(width);
    expect(panel!.width).toBeGreaterThan(300);
    await page.screenshot({ path: `test-results/v030-layout-${width}.png` });
  }
});
