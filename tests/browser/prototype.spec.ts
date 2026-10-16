import { expect, test, type Page } from '@playwright/test';

interface Diagnostics {
  view: string;
  fov: number;
  showBelowHorizon: boolean;
  camera: number[];
  cameraUp: number[];
  cameraQuaternion: number[];
  interacting: boolean;
  observer: { name: string; latitude: number; longitude: number };
  instant: string;
  layers: Record<string, boolean>;
  selected: string | null;
  probe: { ra: number | null; dec: number } | null;
  drawCalls: number;
}
declare global { interface Window { __phyastro: Diagnostics } }
const state = (page: Page) => page.evaluate(() => window.__phyastro);
const settled = (page: Page) => expect.poll(async () => (await state(page)).interacting).toBe(false);

async function wheelInput(page: Page, delta: { deltaY?: number; deltaX?: number; deltaMode?: number; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }, count = 1) {
  await page.locator('#scene-input').evaluate((surface, { delta, count }) => {
    for (let index = 0; index < count; index++) surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ...delta }));
  }, { delta, count });
  await settled(page);
}

async function ready(page: Page) {
  await page.goto('/?view=coordinates');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(async () => (await state(page))?.drawCalls).toBeGreaterThan(10);
  await page.waitForTimeout(300);
}

async function canvasPixels(page: Page) {
  return page.locator('canvas').evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2')!;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let bright = 0;
    let hash = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 30 || pixels[i + 1] > 30 || pixels[i + 2] > 30) bright++;
      hash = (hash + pixels[i] * ((i % 97) + 1)) % 1000000007;
    }
    return { bright, total: pixels.length / 4, hash };
  });
}

test('desktop renders a textured globe and responds to wheel, shift-wheel and zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  const before = await canvasPixels(page);
  expect(before.bright).toBeGreaterThan(10000);
  expect(before.bright / before.total).toBeLessThan(0.35);
  await page.screenshot({ path: 'test-results/phyastro-desktop.png' });
  const first = (await state(page)).camera;
  await page.mouse.move(450, 420);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(250);
  const pitched = (await state(page)).camera;
  expect(pitched[1]).toBeLessThan(first[1]);
  expect(Math.hypot(...pitched)).toBeCloseTo(Math.hypot(...first), 5);
  const theta = Math.atan2(pitched[0], pitched[2]);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(250);
  const rotated = (await state(page)).camera;
  const delta = Math.atan2(Math.sin(Math.atan2(rotated[0], rotated[2]) - theta), Math.cos(Math.atan2(rotated[0], rotated[2]) - theta));
  expect(delta).toBeGreaterThan(0);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await page.waitForTimeout(250);
  expect(Math.hypot(...(await state(page)).camera)).toBeLessThan(Math.hypot(...rotated));
  expect((await canvasPixels(page)).hash).not.toBe(before.hash);
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await page.waitForTimeout(250);
  (await state(page)).camera.forEach((value, index) => expect(value).toBeCloseTo(first[index], 4));
  expect(errors).toEqual([]);
});

test('manual location, UTC, layers and direction probe work together', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '观察地点', exact: true }).click();
  await page.getByLabel('地点预设', { exact: true }).selectOption('3');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  expect((await state(page)).observer.latitude).toBe(-33.8688);
  await expect(page.locator('.place-name')).toContainText('Sydney');
  await page.reload();
  await expect(page.locator('.place-name')).toContainText('Sydney');
  await page.getByRole('button', { name: '观测时间', exact: true }).click();
  await page.getByLabel('UTC 日期与时间').fill('2000-01-01T12:00');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  expect((await state(page)).instant).toBe('2000-01-01T12:00:00.000Z');
  await page.getByRole('button', { name: '参考图层', exact: true }).click();
  await page.getByRole('switch', { name: '黄道参考' }).uncheck();
  expect((await state(page)).layers.ecliptic).toBe(false);
  await page.getByRole('switch', { name: '黄道参考' }).check();
  await page.getByRole('button', { name: '关闭工具', exact: true }).click();
  await page.getByRole('navigation', { name: '观察工具' }).getByRole('button', { name: '方向探针', exact: true }).click();
  await page.locator('canvas').click({ position: { x: 550, y: 350 } });
  await expect(page.getByLabel('探针赤经')).toBeVisible();
  await page.getByLabel('探针赤经').fill('6');
  await page.getByLabel('探针赤纬').fill('90');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.locator('.readings')).toContainText('未定义');
  expect((await state(page)).probe?.ra).toBeNull();
  await page.getByRole('navigation', { name: '观察工具' }).getByRole('button', { name: '方向探针', exact: true }).click();
  await page.locator('canvas').click({ position: { x: 540, y: 320 } });
  await expect(page.getByLabel('探针赤经')).toBeVisible();
  await page.getByRole('button', { name: '移除探针', exact: true }).click();
  expect((await state(page)).probe).toBeNull();
});

test('denied geolocation retains manual controls and validation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: {
      getCurrentPosition: (_success: unknown, failure: (error: { code: number }) => void) => failure({ code: 1 }),
    } });
  });
  await ready(page);
  await page.getByRole('button', { name: '观察地点', exact: true }).click();
  await page.getByRole('button', { name: '当前位置', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '未获得定位' })).toBeVisible();
  await page.getByLabel('纬度', { exact: true }).fill('91');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  expect((await state(page)).observer.latitude).toBe(39.9042);
  await page.getByLabel('纬度', { exact: true }).fill('0');
  await page.getByLabel('经度', { exact: true }).fill('0');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  expect((await state(page)).observer.latitude).toBe(0);
});

test('mobile has a visible canvas, usable panels and no overlapping labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect((await canvasPixels(page)).bright).toBeGreaterThan(2000);
  const boxes = await page.locator('.space-label').evaluateAll(labels => labels
    .filter(label => getComputedStyle(label).visibility === 'visible')
    .map(label => { const r = label.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
  expect(boxes.length).toBeGreaterThan(4);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    expect(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top).toBe(false);
  }
  await page.screenshot({ path: 'test-results/phyastro-mobile.png' });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const original = (await state(page)).camera;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 650 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 660 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);
  expect((await state(page)).camera).not.toEqual(original);
  const distance = Math.hypot(...(await state(page)).camera);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 140, y: 650 }, { x: 240, y: 650 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 110, y: 650 }, { x: 270, y: 650 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  expect(Math.hypot(...(await state(page)).camera)).toBeLessThan(distance);
  await cdp.detach();
  await page.getByRole('button', { name: '观察地点', exact: true }).click();
  await expect(page.getByLabel('纬度', { exact: true })).toBeVisible();
  const panel = await page.locator('.tool-panel').boundingBox();
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/phyastro-mobile-location.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('wheel crosses both poles for two complete turns without flipping or losing rotation', async ({ page }) => {
  await ready(page);
  const initial = await state(page);
  const distance = Math.hypot(...initial.camera);
  let previous = initial;
  for (let quarter = 1; quarter <= 8; quarter++) {
    await wheelInput(page, { deltaY: Math.PI / 2 / 0.003 });
    const current = await state(page);
    expect(current.camera.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...current.camera)).toBeCloseTo(distance, 7);
    const dot = current.camera.reduce((sum, value, index) => sum + value * previous.camera[index], 0) / (distance * distance);
    expect(dot).toBeCloseTo(0, 5);
    if (quarter % 4 === 2) {
      current.camera.forEach((value, index) => expect(value).toBeCloseTo(-initial.camera[index], 5));
      current.cameraUp.forEach((value, index) => expect(value).toBeCloseTo(-initial.cameraUp[index], 5));
    }
    if (quarter % 4 === 0) {
      current.camera.forEach((value, index) => expect(value).toBeCloseTo(initial.camera[index], 5));
      current.cameraUp.forEach((value, index) => expect(value).toBeCloseTo(initial.cameraUp[index], 5));
    }
    previous = current;
  }
  await wheelInput(page, { deltaY: -Math.PI / 0.003 });
  const inverted = await state(page);
  await page.screenshot({ path: 'test-results/phyastro-inverted.png' });
  expect((await canvasPixels(page)).bright).toBeGreaterThan(5000);
  await wheelInput(page, { deltaY: 100, shiftKey: true });
  expect((await state(page)).camera).not.toEqual(inverted.camera);
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  (await state(page)).cameraUp.forEach((value, index) => expect(value).toBeCloseTo(initial.cameraUp[index], 8));
});

test('fractional trackpad deltas and line wheel deltas produce the same movement', async ({ page }) => {
  await ready(page);
  await wheelInput(page, { deltaY: 48, deltaMode: 0 });
  const mouse = await state(page);
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await wheelInput(page, { deltaY: 0.4, deltaMode: 0 }, 120);
  (await state(page)).camera.forEach((value, index) => expect(value).toBeCloseTo(mouse.camera[index], 7));
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await wheelInput(page, { deltaY: 3, deltaMode: 1 });
  (await state(page)).camera.forEach((value, index) => expect(value).toBeCloseTo(mouse.camera[index], 7));
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await wheelInput(page, { deltaX: 48, shiftKey: true });
  const horizontal = await state(page);
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await wheelInput(page, { deltaY: 48, shiftKey: true });
  (await state(page)).camera.forEach((value, index) => expect(value).toBeCloseTo(horizontal.camera[index], 7));
  const beforeZoom = Math.hypot(...(await state(page)).camera);
  await wheelInput(page, { deltaY: -100, metaKey: true });
  expect(Math.hypot(...(await state(page)).camera)).toBeLessThan(beforeZoom);
});

test('spatial labels accept wheel and drag while clicks and tool inputs remain usable', async ({ page }) => {
  await ready(page);
  const initial = await state(page);
  for (const [x, y] of [[15, 100], [1260, 100], [15, 600], [1260, 600]]) {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 90);
    await settled(page);
    expect((await state(page)).camera).not.toEqual(initial.camera);
    await page.getByRole('button', { name: '重置视角', exact: true }).click();
  }
  const label = page.getByRole('button', { name: '天北极', exact: true });
  await label.hover();
  await page.mouse.wheel(0, 80);
  await settled(page);
  expect((await state(page)).camera).not.toEqual(initial.camera);
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await label.click();
  await expect(page.locator('.tool-panel h1')).toHaveText('天北极');
  await page.getByRole('button', { name: '关闭工具', exact: true }).click();
  const box = await label.boundingBox();
  await page.mouse.move(box!.x + 8, box!.y + 8);
  await page.mouse.down();
  await page.mouse.move(1100, 550, { steps: 16 });
  await page.mouse.up();
  await settled(page);
  expect((await state(page)).camera).not.toEqual(initial.camera);
  expect((await state(page)).selected).toBeNull();
  await page.getByRole('button', { name: '观察地点', exact: true }).click();
  const beforeInput = await state(page);
  await page.getByLabel('纬度', { exact: true }).hover();
  await page.mouse.wheel(0, 40);
  await page.waitForTimeout(100);
  expect((await state(page)).camera).toEqual(beforeInput.camera);
  await page.getByLabel('纬度', { exact: true }).fill('0');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  expect((await state(page)).observer.latitude).toBe(0);
});

test('window blur ends a captured drag without leaving stuck rotation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await page.mouse.move(400, 400);
  await page.mouse.down();
  await page.mouse.move(480, 460, { steps: 5 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  await settled(page);
  const stopped = await state(page);
  await page.mouse.move(600, 550);
  await page.waitForTimeout(150);
  expect((await state(page)).camera).toEqual(stopped.camera);
  await page.mouse.down();
  await page.mouse.move(650, 500, { steps: 5 });
  await page.mouse.up();
  await settled(page);
  expect((await state(page)).camera).not.toEqual(stopped.camera);
  expect(errors).toEqual([]);
});

test('observer view separates the horizon, preserves layers and restores orbit pose', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const orbit = await state(page);
  await page.getByRole('button', { name: '地面视角', exact: true }).click();
  await expect(page.getByLabel('视线方向')).toContainText('Alt +15.0°');
  expect((await state(page)).camera).toEqual([0, 0, 0]);
  expect((await state(page)).fov).toBe(80);
  expect((await canvasPixels(page)).bright).toBeGreaterThan(10000);
  const regions = await page.locator('canvas').evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2')!;
    const sample = (y: number) => {
      const pixels = new Uint8Array(100 * 4);
      gl.readPixels(20, y, 100, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let sum = 0, color = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        sum += pixels[i];
        color += Math.abs(pixels[i] - pixels[i + 1]) + Math.abs(pixels[i] - pixels[i + 2]);
      }
      return { mean: sum / 100, color };
    };
    return { ground: sample(20), sky: sample(gl.drawingBufferHeight - 20) };
  });
  expect(regions.ground.mean).toBeGreaterThan(regions.sky.mean + 10);
  expect(regions.ground.color + regions.sky.color).toBe(0);
  await page.screenshot({ path: 'test-results/phyastro-ground-desktop.png' });
  await page.getByRole('button', { name: '天北极', exact: true }).click();
  await expect(page.locator('.readings')).toContainText('+39.90°');
  await expect(page.locator('.readings')).toContainText('地平线以上');
  await page.getByRole('button', { name: '关闭工具', exact: true }).click();
  const original = (await state(page)).cameraQuaternion;
  for (let step = 0; step < 4; step++) await wheelInput(page, { deltaY: Math.PI / 2 / 0.003 });
  const rotated = (await state(page)).cameraQuaternion;
  expect(Math.abs(rotated.reduce((sum, v, i) => sum + v * original[i], 0))).toBeCloseTo(1, 7);
  await wheelInput(page, { deltaY: 100, shiftKey: true });
  await expect(page.getByLabel('视线方向')).not.toContainText('Az 0.0°');
  await wheelInput(page, { deltaY: -100, ctrlKey: true });
  expect((await state(page)).fov).toBeLessThan(80);
  expect((await state(page)).camera).toEqual([0, 0, 0]);
  await page.getByRole('button', { name: '参考图层', exact: true }).click();
  const calls = (await state(page)).drawCalls;
  await page.getByRole('switch', { name: '地平线下参考线', exact: true }).uncheck();
  await expect.poll(async () => (await state(page)).drawCalls).toBeLessThan(calls);
  await expect(page.locator('.space-label[data-region="below"]')).toHaveCount(0);
  await page.getByRole('switch', { name: '黄道参考', exact: true }).uncheck();
  await page.getByRole('switch', { name: '地平网格', exact: true }).uncheck();
  await page.getByRole('button', { name: '天球视角', exact: true }).click();
  (await state(page)).camera.forEach((v, i) => expect(v).toBeCloseTo(orbit.camera[i], 8));
  expect((await state(page)).layers.ecliptic).toBe(false);
  await page.getByRole('button', { name: '地面视角', exact: true }).click();
  expect((await state(page)).showBelowHorizon).toBe(false);
  expect((await state(page)).layers.horizontalGrid).toBe(false);
});

test('observer probe and southern latitude use local directions, including on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole('button', { name: '地面视角', exact: true }).click();
  await page.getByRole('button', { name: '观察地点', exact: true }).click();
  await page.getByLabel('地点预设', { exact: true }).selectOption('3');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.getByLabel('视线方向')).toContainText('Alt +15.0°');
  await page.getByRole('navigation').getByRole('button', { name: '方向探针', exact: true }).click();
  await page.locator('canvas').click({ position: { x: 195, y: 422 } });
  await expect(page.locator('.readings')).toContainText('+15.00°');
  await page.getByLabel('探针赤经').fill('0');
  await page.getByLabel('探针赤纬').fill('90');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.locator('.readings')).toContainText('-33.87°');
  await expect(page.locator('.readings')).toContainText('地平线以下');
  await page.getByRole('button', { name: '关闭工具', exact: true }).click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 500 }, { x: 200, y: 500 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 70, y: 500 }, { x: 230, y: 500 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await state(page)).fov).toBeLessThan(80);
  expect((await state(page)).camera).toEqual([0, 0, 0]);
  await cdp.detach();
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/phyastro-ground-mobile.png' });
  const boxes = await page.locator('.space-label, .view-switch, .heading-readout, .camera-tools').evaluateAll(elements => elements
    .filter(element => getComputedStyle(element).visibility === 'visible')
    .map(element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    expect(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top).toBe(false);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
