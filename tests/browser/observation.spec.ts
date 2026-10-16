import { test, expect, type Page } from '@playwright/test';
import type { BodyPosition } from '../../src/core/astronomy/Ephemeris';

interface Snapshot {
  camera: number[]; cameraQuaternion: number[]; interacting: boolean; fov: number;
  instant: string; observer: { latitude: number; longitude: number }; selected: string | null;
  bodies: BodyPosition[];
  references: { id: string; line: boolean; below: boolean; x: number; y: number; z: number; radius: number | null }[];
}
const snapshot = (page: Page) => page.evaluate(() => (window as unknown as { __phyastro: Snapshot }).__phyastro);
async function start(page: Page, ground = true) {
  await page.goto('/?view=coordinates');
  await expect.poll(async () => (await snapshot(page))?.bodies.length).toBe(2);
  if (ground) await page.getByRole('button', { name: '地面视角', exact: true }).click();
}
async function wheel(page: Page, deltaY: number, shiftKey = false) {
  await page.locator('#scene-input').evaluate((surface, input) => surface.dispatchEvent(new WheelEvent('wheel', { ...input, bubbles: true, cancelable: true })), { deltaY, shiftKey });
  await expect.poll(async () => (await snapshot(page)).interacting).toBe(false);
}
const altitude = async (page: Page) => (await page.getByLabel('视线方向').textContent())!.split('Alt ')[1];

test('ground yaw follows the local vertical even after crossing a pole and dragging', async ({ page }) => {
  await start(page);
  await wheel(page, -100 * Math.PI / 180 / 0.003);
  const before = await altitude(page);
  const rotation = (await snapshot(page)).cameraQuaternion;
  await wheel(page, 300, true);
  expect(await altitude(page)).toBe(before);
  expect((await snapshot(page)).cameraQuaternion).not.toEqual(rotation);
  await page.mouse.move(400, 350);
  await page.mouse.down();
  await page.mouse.move(540, 350, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await snapshot(page)).interacting).toBe(false);
  expect(await altitude(page)).toBe(before);
  expect((await snapshot(page)).camera).toEqual([0, 0, 0]);
});

test('panels cover camera controls and restore them on close on a short mobile screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 650 });
  await start(page);
  await page.getByRole('button', { name: '参考图层', exact: true }).click();
  const stacking = await page.evaluate(() => {
    const panel = document.querySelector('.tool-panel')!.getBoundingClientRect();
    const tools = document.querySelector('.camera-tools')!.getBoundingClientRect();
    const x = Math.max(panel.left, tools.left) + 10;
    const y = Math.max(panel.top, tools.top) + 10;
    return { overlaps: x < Math.min(panel.right, tools.right) && y < Math.min(panel.bottom, tools.bottom),
      topIsPanel: !!document.elementFromPoint(x, y)?.closest('.tool-panel') };
  });
  expect(stacking).toEqual({ overlaps: true, topIsPanel: true });
  await page.getByRole('switch', { name: '月球', exact: true }).uncheck();
  expect((await snapshot(page)).references.some(reference => reference.id === 'moon')).toBe(false);
  await page.screenshot({ path: 'test-results/phyastro-layers-overlay.png' });
  await page.getByRole('button', { name: '关闭工具', exact: true }).click();
  const fov = (await snapshot(page)).fov;
  await page.getByRole('button', { name: '放大', exact: true }).click();
  expect((await snapshot(page)).fov).toBeLessThan(fov);
});

test('location and UTC changes update local body coordinates without network access', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await page.context().setOffline(true);
  const initial = await snapshot(page);
  await page.getByRole('button', { name: '观察地点', exact: true }).click();
  await page.getByLabel('地点预设', { exact: true }).selectOption('3');
  expect((await snapshot(page)).observer.latitude).toBe(-33.8688);
  expect((await snapshot(page)).bodies[1].horizontal).not.toEqual(initial.bodies[1].horizontal);
  expect((await snapshot(page)).bodies[1].geocentric).toEqual(initial.bodies[1].geocentric);
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await page.getByRole('button', { name: '观测时间', exact: true }).click();
  await page.getByLabel('UTC 日期与时间').fill('2024-04-08T18:00');
  await page.getByLabel('UTC 日期与时间').press('Tab');
  expect((await snapshot(page)).instant).toBe('2024-04-08T18:00:00.000Z');
  expect((await snapshot(page)).bodies[1].geocentric).not.toEqual(initial.bodies[1].geocentric);
  await page.getByRole('button', { name: '应用', exact: true }).click();
  const body = (await snapshot(page)).bodies[0];
  const sun = (await snapshot(page)).references.find(reference => reference.id === 'sun')!;
  expect(sun.radius! / 2.8).toBeCloseTo(Math.sin(body.topocentricAngularDiameter / 2), 10);
  const toast = await page.locator('.toast').boundingBox();
  const tools = await page.locator('.camera-tools').boundingBox();
  expect(toast!.y + toast!.height).toBeLessThan(tools!.y);
});

test('double clicking a grid line gives ownership and units; terms dismiss on pointer departure', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await start(page);
  // The chosen sample is on the altitude +30 circle, away from the cardinal meridian.
  const references = (await snapshot(page)).references;
  let candidate = references.find(line => line.id === 'alt-30' && line.z < 1 && line.z > -1 && line.x > 280 && line.x < 1100 && line.y > 180 && line.y < 650);
  if (!candidate) {
    await wheel(page, 500, true);
    candidate = (await snapshot(page)).references.find(line => line.id === 'alt-30' && line.z < 1 && line.z > -1 && line.x > 180 && line.x < 1200 && line.y > 160 && line.y < 700);
  }
  expect(candidate).toBeTruthy();
  await page.mouse.dblclick(candidate!.x, candidate!.y, { delay: 80 });
  await expect(page.locator('.tool-panel h1')).toHaveText('等高度圈');
  await expect(page.locator('.readings')).toContainText('地平坐标系');
  await expect(page.locator('.readings')).toContainText('30°');
  await expect(page.locator('.readings')).toContainText('拾取赤经');
  await page.locator('.panel-heading h1').dblclick();
  await expect(page.getByRole('tooltip')).toContainText('Altitude Circle');
  await page.mouse.move(20, 200);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭工具', exact: true }).click();
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await page.getByRole('button', { name: '天北极', exact: true }).dblclick({ delay: 80 });
  await expect(page.getByRole('tooltip')).toContainText('North Celestial Pole');
  await expect(page.locator('.tool-panel')).toBeHidden();
  await page.mouse.move(20, 200);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('Sun and Moon render with unlit, nonblank disks on desktop and mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await start(page);
  await page.getByRole('button', { name: '观察地点', exact: true }).click();
  await page.getByLabel('纬度', { exact: true }).fill('0');
  await page.getByLabel('经度', { exact: true }).fill('0');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await page.getByRole('button', { name: '观测时间', exact: true }).click();
  await page.getByLabel('UTC 日期与时间').fill('2024-04-08T18:00');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  // Face west: both bodies are near the evening horizon on this date at Greenwich.
  await wheel(page, -Math.PI / 2 / 0.003, true);
  await page.getByRole('button', { name: '太阳', exact: true }).click();
  await expect(page.locator('.readings')).toContainText('arcmin');
  await expect(page.locator('.readings')).toContainText('km');
  await page.getByRole('button', { name: '关闭工具', exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.waitForTimeout(200);
    const sun = (await snapshot(page)).references.find(reference => reference.id === 'sun' && !reference.below)!;
    expect(sun.x).toBeGreaterThan(0);
    expect(sun.x).toBeLessThan(width);
    const pixels = await page.locator('canvas').evaluate((canvas, center) => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl2')!;
      const scale = gl.drawingBufferWidth / canvas.clientWidth;
      const pixels = new Uint8Array(9 * 9 * 4);
      gl.readPixels(Math.round(center.x * scale) - 4, gl.drawingBufferHeight - Math.round(center.y * scale) - 4, 9, 9, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return [...pixels].filter((value, i) => i % 4 === 0 && value > 160).length;
    }, sun);
    expect(pixels).toBeGreaterThan(0);
    await page.screenshot({ path: `test-results/phyastro-bodies-${width}.png` });
  }
});
