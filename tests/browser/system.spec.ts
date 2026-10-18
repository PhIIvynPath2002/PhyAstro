import { expect, test, type Page } from '@playwright/test';
import type { SystemSnapshot } from '../../src/core/system/Ephemeris';
import type { SystemBodyId } from '../../src/core/system/Bodies';
import type { Visibility } from '../../src/rendering/system/Visibility';

interface Diagnostics {
  mode: string; observerId: SystemBodyId; targetId: SystemBodyId; instant: string;
  snapshot: SystemSnapshot; timeZone: string; scale: string; cameraKm: number[]; cameraOffsetKm: number[];
  cameraQuaternion: number[]; interacting: boolean; locked: boolean; near: number; far: number; fov: number;
  drawCalls: number; visibleBodies: SystemBodyId[]; referencesVisible: boolean; referenceLineCount: number;
  bodies: { id: SystemBodyId; renderRadiusKm: number; physicalRadiusKm: number; renderPosition: number[];
    visibility: Visibility; screen: number[]; measurement: { distanceKm: number; vectorKm: number[]; angularDiameterDeg: number } | null }[];
}
const state = (page: Page) => page.evaluate(() => (window as unknown as { __phyastro: Diagnostics }).__phyastro);
const settle = async (page: Page) => { await expect.poll(async () => (await state(page)).interacting).toBe(false); };
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('application', { name: '日地月统一空间视图' })).toBeVisible();
  await expect.poll(async () => (await state(page))?.drawCalls).toBeGreaterThanOrEqual(3);
}
async function wheel(page: Page, deltaY: number, extra = {}) {
  await page.locator('#space-stage').evaluate((root, data) => root.dispatchEvent(new WheelEvent('wheel', { ...data, bubbles: true, cancelable: true })), { deltaY, ...extra });
  await settle(page);
}
function outsideBodies(snapshot: Diagnostics) {
  for (const body of snapshot.bodies) {
    const world = snapshot.snapshot.bodies[body.id].positionKm;
    const distance = Math.hypot(...world.map((value, i) => value - snapshot.cameraKm[i]));
    expect(distance).toBeGreaterThan(body.renderRadiusKm);
    expect(distance).toBeGreaterThan(body.physicalRadiusKm);
    expect(body.renderPosition.every(Number.isFinite)).toBe(true);
  }
}
async function diskPixels(page: Page, id: SystemBodyId) {
  const body = (await state(page)).bodies.find(body => body.id === id)!;
  return page.locator('#space-stage canvas').evaluate((canvas, input) => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2')!;
    const scale = gl.drawingBufferWidth / canvas.clientWidth;
    const x = Math.round(input.screen[0] * scale), y = gl.drawingBufferHeight - Math.round(input.screen[1] * scale);
    if (x < 10 || y < 10 || x + 10 >= gl.drawingBufferWidth || y + 10 >= gl.drawingBufferHeight) return 0;
    const pixels = new Uint8Array(21 * 21 * 4);
    gl.readPixels(x - 10, y - 10, 21, 21, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 20) count++;
    return count;
  }, body);
}

test('default snapshot renders textured illuminated Earth and Moon and retains all three bodies', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const initial = await state(page);
  expect(initial.instant).toBe('2026-01-01T00:00:00.000Z');
  expect(initial.visibleBodies).toEqual(['sun', 'earth', 'moon']);
  expect(initial.referencesVisible).toBe(true);
  expect(initial.referenceLineCount).toBeGreaterThan(10);
  expect(await diskPixels(page, 'earth')).toBeGreaterThan(20);
  expect(await diskPixels(page, 'moon')).toBeGreaterThan(20);
  await page.screenshot({ path: 'test-results/system-desktop.png' });
  await page.getByLabel('目标天体', { exact: true }).selectOption('sun');
  await page.getByRole('button', { name: '朝向目标', exact: true }).click();
  await expect.poll(async () => (await state(page)).locked).toBe(true);
  await expect.poll(() => diskPixels(page, 'sun')).toBeGreaterThan(20);
  await page.screenshot({ path: 'test-results/system-sun.png' });
  expect(errors).toEqual([]);
});

test('all observer-target pairs keep the bodies, preserve positions and use the actual camera', async ({ page }) => {
  await ready(page);
  const positions = (await state(page)).snapshot;
  for (const observer of ['sun', 'earth', 'moon'] as const) {
    await page.getByLabel('观测中心', { exact: true }).selectOption(observer);
    for (const target of (['sun', 'earth', 'moon'] as const).filter(id => id !== observer)) {
      await page.getByLabel('目标天体', { exact: true }).selectOption(target);
      await page.getByRole('button', { name: '朝向目标', exact: true }).click();
      await expect.poll(async () => (await state(page)).locked).toBe(true);
      const result = await state(page);
      expect(result.visibleBodies).toEqual(['sun', 'earth', 'moon']);
      expect(result.snapshot).toEqual(positions);
      expect(result.observerId).toBe(observer);
      expect(result.targetId).toBe(target);
      const body = result.bodies.find(body => body.id === target)!;
      const bounds = await page.locator('#space-stage').boundingBox();
      expect(body.screen[0]).toBeCloseTo(bounds!.width / 2, 2);
      expect(body.screen[1]).toBeCloseTo(bounds!.height / 2, 2);
      outsideBodies(result);
    }
    expect((await state(page)).referencesVisible).toBe(observer === 'earth');
    if (observer !== 'earth') await expect(page.locator('.system-reference-status')).toContainText('网格已隐藏');
  }
});

test('physical and enhanced modes change only render radii, not positions or centre measurements', async ({ page }) => {
  await ready(page);
  const enhanced = await state(page);
  await page.getByLabel('显示比例', { exact: true }).selectOption('physical');
  const physical = await state(page);
  expect(physical.snapshot).toEqual(enhanced.snapshot);
  expect(physical.bodies.map(body => body.measurement)).toEqual(enhanced.bodies.map(body => body.measurement));
  physical.bodies.forEach(body => expect(body.renderRadiusKm).toBe(body.physicalRadiusKm));
  expect(physical.cameraKm).toEqual(enhanced.cameraKm);
  await expect(page.locator('.system-scale')).toHaveText('Physical Scale');
  await page.getByRole('button', { name: '关闭科学调试', exact: true }).click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/system-physical.png' });
  await page.getByRole('button', { name: '科学调试面板', exact: true }).click();
  await page.getByLabel('显示比例', { exact: true }).selectOption('enhanced');
  const again = await state(page);
  expect(again.snapshot).toEqual(physical.snapshot);
  outsideBodies(again);
});

test('body label taps and keyboard activation select a target without changing observer or hiding bodies', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  await page.getByLabel('目标天体', { exact: true }).selectOption('sun');
  const initial = await state(page);
  await page.getByRole('button', { name: '选择月球', exact: true }).click();
  expect((await state(page)).targetId).toBe('moon');
  expect((await state(page)).observerId).toBe('earth');
  expect((await state(page)).visibleBodies).toEqual(initial.visibleBodies);
  await page.getByLabel('目标天体', { exact: true }).selectOption('sun');
  await page.getByRole('button', { name: '选择月球', exact: true }).focus();
  await page.keyboard.press('Enter');
  expect((await state(page)).targetId).toBe('moon');
  expect((await state(page)).snapshot).toEqual(initial.snapshot);
  const displayedOffset = await page.locator('[data-camera="offset"]').textContent();
  await page.getByRole('button', { name: '放大', exact: true }).click();
  await expect(page.locator('[data-camera="offset"]')).not.toHaveText(displayedOffset!);
  expect((await state(page)).snapshot).toEqual(initial.snapshot);
  outsideBodies(await state(page));
});

test('four snapshots synchronize all bodies and time zones never change the instant', async ({ page }) => {
  await ready(page);
  await page.context().setOffline(true);
  await page.getByLabel('观测中心', { exact: true }).selectOption('moon');
  await page.getByLabel('目标天体', { exact: true }).selectOption('earth');
  let previous = (await state(page)).snapshot;
  for (const month of ['01', '04', '07', '10']) {
    const instant = `2026-${month}-01T00:00:00.000Z`;
    await page.getByLabel('时间快照', { exact: true }).selectOption(instant);
    const changed = await state(page);
    expect(changed.observerId).toBe('moon');
    expect(changed.targetId).toBe('earth');
    for (const id of changed.visibleBodies) {
      expect(changed.snapshot.bodies[id].utc).toBe(instant);
      if (month !== '01') expect(changed.snapshot.bodies[id].positionKm).not.toEqual(previous.bodies[id].positionKm);
    }
    previous = changed.snapshot;
    for (const zone of ['Asia/Shanghai', 'America/New_York', 'UTC']) {
      await page.getByLabel('显示时区', { exact: true }).selectOption(zone);
      const displayed = await state(page);
      expect(displayed.snapshot).toEqual(changed.snapshot);
      expect(displayed.cameraKm).toEqual(changed.cameraKm);
      if (zone === 'America/New_York') await expect(page.locator('.system-footer time')).toContainText(['04', '07', '10'].includes(month) ? 'GMT-4' : 'GMT-5');
    }
    outsideBodies(await state(page));
  }
});

test('continuous rotation, drag, zoom limits and resets cannot enter any sphere', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '关闭科学调试', exact: true }).click();
  await page.waitForTimeout(150);
  const initial = await state(page);
  for (let quarter = 1; quarter <= 4; quarter++) {
    await wheel(page, Math.PI / 2 / 0.003);
    outsideBodies(await state(page));
  }
  const rotated = await state(page);
  const dot = rotated.cameraQuaternion.reduce((sum, value, i) => sum + value * initial.cameraQuaternion[i], 0);
  expect(Math.abs(dot)).toBeCloseTo(1, 5);
  await wheel(page, -100000, { ctrlKey: true });
  outsideBodies(await state(page));
  await wheel(page, 100000, { metaKey: true });
  const far = await state(page);
  outsideBodies(far);
  expect(far.far).toBeGreaterThan(far.near);
  expect(far.cameraKm.every(Number.isFinite)).toBe(true);
  await page.getByRole('button', { name: '返回观测中心', exact: true }).click();
  await page.mouse.move(250, 400);
  await page.mouse.down();
  await page.mouse.move(450, 460, { steps: 12 });
  await page.mouse.up();
  await settle(page);
  outsideBodies(await state(page));
  expect((await state(page)).cameraQuaternion).not.toEqual(initial.cameraQuaternion);
});

test('the coordinate instrument retains the Earth functions and synchronizes its time back to space', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '天球坐标仪', exact: true }).click();
  await expect(page.getByRole('application', { name: '天球三维视图' })).toBeVisible();
  await page.getByRole('button', { name: '地面视角', exact: true }).click();
  await expect(page.getByLabel('视线方向')).toContainText('Alt');
  await page.getByRole('button', { name: '观测时间', exact: true }).click();
  await page.getByLabel('UTC 日期与时间').fill('2026-04-01T00:00');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await page.getByRole('button', { name: '返回空间系统', exact: true }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('space');
  expect((await state(page)).instant).toBe('2026-04-01T00:00:00.000Z');
  expect((await state(page)).visibleBodies).toHaveLength(3);
});

test('mobile debug controls, touch rotation and pinch zoom stay usable without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByLabel('观测中心', { exact: true }).selectOption('moon');
  await page.getByLabel('目标天体', { exact: true }).selectOption('earth');
  await page.getByLabel('时间快照', { exact: true }).selectOption('2026-07-01T00:00:00.000Z');
  await page.screenshot({ path: 'test-results/system-mobile-debug.png' });
  await page.getByRole('button', { name: '关闭科学调试', exact: true }).click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const initial = await state(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 130, y: 400 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 210, y: 450 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(page);
  expect((await state(page)).cameraQuaternion).not.toEqual(initial.cameraQuaternion);
  const before = Math.hypot(...(await state(page)).cameraOffsetKm);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 420 }, { x: 220, y: 420 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y: 420 }, { x: 250, y: 420 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(page);
  expect(Math.hypot(...(await state(page)).cameraOffsetKm)).toBeLessThan(before);
  await cdp.detach();
  outsideBodies(await state(page));
  await page.getByRole('button', { name: '朝向目标', exact: true }).click();
  await expect.poll(async () => (await state(page)).locked).toBe(true);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/system-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
