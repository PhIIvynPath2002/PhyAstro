import { build } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const destination = resolve(process.argv[2] || 'dist/PhyAstro-offline.html');
const artifactStem = destination.endsWith('.html') ? destination.slice(0, -5) : destination;
const result = await build({
  configFile: false,
  root: fileURLToPath(new URL('..', import.meta.url)),
  base: './',
  build: {
    write: false,
    cssCodeSplit: false,
    rolldownOptions: { output: { format: 'iife', codeSplitting: false } },
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
const scripts = outputs.filter(item => item.type === 'chunk');
const styles = outputs.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'));
const html = outputs.find(item => item.type === 'asset' && item.fileName.endsWith('.html'));
assert.equal(scripts.length, 1, 'The portable build must have one script.');
assert.ok(html);
const noticePackages = ['three', 'astronomia', 'lucide', 'd3-geo', 'd3-array', 'internmap', 'topojson-client', 'world-atlas'];
const notices = [];
for (const name of noticePackages) notices.push(`${name}\n${await readFile(new URL(`../node_modules/${name}/LICENSE`, import.meta.url), 'utf8')}`);
const engineSource = await readFile(new URL('../node_modules/astronomy-engine/esm/astronomy.js', import.meta.url), 'utf8');
const engineLicense = engineSource.match(/^\/\*\*([\s\S]*?)\*\//)?.[1];
assert.ok(engineLicense?.includes('Permission is hereby granted'), 'The engine license must be preserved in the portable document.');
notices.push(`astronomy-engine 2.1.19\n${engineLicense}`);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/^https?:/.test(request.url())) externalRequests.push(request.url());
  });
  const portable = await page.evaluate(({ html, js, css, notices }) => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    document.querySelectorAll('script[src], link[rel="stylesheet"], link[rel="modulepreload"]').forEach(node => node.remove());
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const script = document.createElement('script');
    script.textContent = js.replace(/<\/script/gi, '<\\/script');
    document.body.append(script);
    const licenses = document.createElement('pre');
    licenses.hidden = true;
    licenses.id = 'third-party-notices';
    licenses.textContent = notices;
    document.body.append(licenses);
    return '<!doctype html>\n' + document.documentElement.outerHTML;
  }, {
    html: String(html.source), js: scripts[0].code,
    css: styles.map(item => String(item.source)).join('\n'), notices: notices.join('\n\n'),
  });
  await mkdir(dirname(destination), { recursive: true });
  await page.context().setOffline(true);
  await page.setContent(portable, { waitUntil: 'load' });
  await page.locator('canvas').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2');
    if (!gl) return false;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let bright = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 30 || pixels[i + 1] > 30 || pixels[i + 2] > 30) bright++;
    return bright > 10000;
  });
  assert.equal(await page.locator('meta[name="application-version"]').getAttribute('content'), '0.2.0');
  assert.equal(await page.locator('.system-body-label').count(), 3);
  await page.screenshot({ path: `${artifactStem}-system-desktop.png` });
  const centerDisk = async expected => {
    await page.waitForTimeout(200);
    const count = await page.locator('#space-stage canvas').evaluate((canvas, expected) => {
      const gl = canvas.getContext('webgl2');
      const pixels = new Uint8Array(9 * 9 * 4);
      gl.readPixels(Math.round(gl.drawingBufferWidth / 2) - 4, Math.round(gl.drawingBufferHeight / 2) - 4, 9, 9, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let found = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (Math.abs(pixels[i] - expected) < 3 && pixels[i] === pixels[i + 1] && pixels[i] === pixels[i + 2]) found++;
      return found;
    }, expected);
    assert.ok(count > 20, `The centered sphere must render its actual unlit grey pixels (${expected}).`);
  };
  await centerDisk(136);
  for (const [target, grey] of [['moon', 72], ['sun', 224]]) {
    await page.getByLabel('目标天体', { exact: true }).selectOption(target);
    await page.getByRole('button', { name: '朝向目标', exact: true }).click();
    await centerDisk(grey);
  }
  for (const observer of ['sun', 'earth', 'moon']) {
    await page.getByLabel('观测中心', { exact: true }).selectOption(observer);
    for (const target of ['sun', 'earth', 'moon'].filter(id => id !== observer)) {
      await page.getByLabel('目标天体', { exact: true }).selectOption(target);
      await page.getByRole('button', { name: '朝向目标', exact: true }).click();
      assert.equal(await page.locator('.system-body-label').count(), 3);
      assert.equal(await page.locator('.system-body-data').count(), 2);
    }
  }
  const scientificReadings = () => page.locator('.system-body-data').evaluateAll(sections => sections.map(section =>
    [...section.querySelectorAll('dd')].slice(0, 7).map(value => value.textContent)));
  const beforeScale = await scientificReadings();
  await page.getByLabel('显示比例', { exact: true }).selectOption('physical');
  assert.deepEqual(await scientificReadings(), beforeScale);
  await page.getByLabel('显示比例', { exact: true }).selectOption('enhanced');
  for (const month of ['01', '04', '07', '10']) {
    await page.getByLabel('时间快照', { exact: true }).selectOption(`2026-${month}-01T00:00:00.000Z`);
    assert.equal(await page.getByLabel('观测中心', { exact: true }).inputValue(), 'moon');
    assert.equal(await page.getByLabel('目标天体', { exact: true }).inputValue(), 'earth');
    const utc = await page.locator('[data-reading="utc"]').textContent();
    const beforeZone = await scientificReadings();
    for (const zone of ['Asia/Shanghai', 'America/New_York', 'UTC']) {
      await page.getByLabel('显示时区', { exact: true }).selectOption(zone);
      assert.equal(await page.locator('[data-reading="utc"]').textContent(), utc);
      assert.deepEqual(await scientificReadings(), beforeZone);
      if (zone === 'America/New_York') assert.match(await page.locator('[data-reading="civil"]').textContent(), month === '01' ? /GMT-5/ : /GMT-4/);
    }
  }
  await page.screenshot({ path: `${artifactStem}-system-moon-observer.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${artifactStem}-system-mobile-debug.png` });
  await page.getByRole('button', { name: '关闭科学调试', exact: true }).click();
  await page.getByRole('button', { name: '朝向目标', exact: true }).click();
  await centerDisk(136);
  await page.screenshot({ path: `${artifactStem}-system-mobile.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '天球坐标仪', exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${artifactStem}-desktop.png` });
  const canvasCursor = () => page.locator('canvas').evaluate(canvas => getComputedStyle(canvas).cursor);
  await page.mouse.move(350, 400);
  assert.equal(await canvasCursor(), 'default', 'The idle scene cursor must be an arrow.');
  await page.mouse.down();
  assert.equal(await canvasCursor(), 'grab', 'A held pointer must show the open hand.');
  await page.mouse.move(420, 450, { steps: 6 });
  assert.equal(await canvasCursor(), 'grab', 'The hand must remain during dragging.');
  await page.mouse.up();
  assert.equal(await canvasCursor(), 'default', 'Releasing the pointer must restore the arrow.');
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  assert.equal(await canvasCursor(), 'default', 'Interrupted drags must restore the arrow.');
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await page.waitForTimeout(150);
  const spin = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2');
    const read = () => {
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const rest = async () => {
      let last = '', stable = 0;
      for (let frame = 0; frame < 240; frame++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const current = [...document.querySelectorAll('.space-label')]
          .filter(label => label.style.visibility === 'visible').map(label => label.style.transform).join(';');
        stable = current === last ? stable + 1 : 0;
        last = current;
        if (frame >= 12 && stable >= 4) return;
      }
      throw new Error('The camera did not settle within 240 rendered frames.');
    };
    await rest();
    const first = read();
    const difference = () => {
      const pixels = read();
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4) sum += Math.abs(pixels[i] - first[i]);
      return sum / (pixels.length / 4);
    };
    let invertedDifference = 0;
    for (let quarter = 1; quarter <= 8; quarter++) {
      document.querySelector('#scene-input').dispatchEvent(new WheelEvent('wheel', { deltaY: Math.PI / 2 / 0.003, bubbles: true, cancelable: true }));
      await rest();
      if (quarter === 2) invertedDifference = difference();
    }
    return { invertedDifference, fullTurnsDifference: difference() };
  });
  assert.ok(spin.invertedDifference > 1, 'A half turn must change the image.');
  assert.ok(spin.fullTurnsDifference < 0.1, 'Two turns must restore the rendered view.');
  await page.getByRole('button', { name: '地面视角', exact: true }).click();
  await page.waitForTimeout(250);
  assert.match(await page.getByLabel('视线方向').textContent(), /Alt \+15.0°/);
  await page.screenshot({ path: `${artifactStem}-ground-desktop.png` });
  await page.getByRole('button', { name: '天北极', exact: true }).dblclick({ delay: 70 });
  await page.getByRole('tooltip').waitFor({ state: 'visible' });
  assert.match(await page.getByRole('tooltip').textContent(), /North Celestial Pole/);
  await page.mouse.move(20, 200);
  assert.equal(await page.getByRole('tooltip').count(), 0);
  const horizonY = 500 + Math.tan(Math.PI / 12) / Math.tan(40 * Math.PI / 180) * 500;
  await page.mouse.dblclick(810, horizonY, { delay: 70 });
  await page.locator('.tool-panel h1').waitFor({ state: 'visible' });
  assert.match(await page.locator('.tool-panel h1').textContent(), /地平圈/);
  assert.match(await page.locator('.readings').textContent(), /拾取赤经/);
  await page.getByRole('button', { name: '关闭工具', exact: true }).click();
  await page.getByRole('button', { name: '参考图层', exact: true }).click();
  await page.getByRole('switch', { name: '地平线下参考线', exact: true }).uncheck();
  assert.equal(await page.locator('.space-label[data-region="below"]').count(), 0);
  await page.getByRole('switch', { name: '地平线下参考线', exact: true }).check();
  await page.getByRole('button', { name: '天球视角', exact: true }).click();
  await page.getByRole('button', { name: '观察地点', exact: true }).click();
  await page.getByLabel('地点预设', { exact: true }).selectOption('3');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  assert.match(await page.locator('.place-name').textContent(), /Sydney/);
  await page.getByRole('button', { name: '观测时间', exact: true }).click();
  await page.getByLabel('UTC 日期与时间').fill('2000-01-01T12:00');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  assert.match(await page.locator('.date-value').textContent(), /2000-01-01 12:00:00/);
  await page.getByRole('button', { name: '参考图层', exact: true }).click();
  await page.getByRole('switch', { name: '黄道参考' }).uncheck();
  await page.getByRole('switch', { name: '黄道参考' }).check();
  await page.getByRole('button', { name: '关闭工具', exact: true }).click();
  await page.mouse.move(440, 400);
  const before = await page.locator('canvas').screenshot();
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(200);
  const after = await page.locator('canvas').screenshot();
  assert.ok(!before.equals(after), 'Camera rotation must change rendered pixels.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${artifactStem}-mobile.png` });
  await page.getByRole('button', { name: '地面视角', exact: true }).click();
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${artifactStem}-ground-mobile.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.getByRole('button', { name: '观察地点', exact: true }).click();
  await page.getByLabel('地点预设', { exact: true }).selectOption('4');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await page.getByRole('button', { name: '观测时间', exact: true }).click();
  await page.getByLabel('UTC 日期与时间').fill('2024-04-08T18:00');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await page.locator('#scene-input').evaluate(surface => surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -Math.PI / 2 / 0.003, shiftKey: true, bubbles: true, cancelable: true })));
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '太阳', exact: true }).click();
  await page.locator('.tool-panel h1').waitFor({ state: 'visible' });
  assert.match(await page.locator('.readings').textContent(), /站心方位/);
  assert.match(await page.locator('.readings').textContent(), /arcmin/);
  assert.equal(await page.locator('[data-object="moon"]').count(), 1);
  await page.getByRole('button', { name: '关闭工具', exact: true }).click();
  await page.screenshot({ path: `${artifactStem}-bodies-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${artifactStem}-bodies-desktop.png` });
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  await writeFile(destination, portable);
  const validation = {
    version: '0.2.0',
    file: destination,
    bytes: (await stat(destination)).size,
    validation: ['offline inline document', 'nonblank WebGL pixels', 'all three grey sphere pixels', 'all observer-target pairs', 'scientific debug panel', 'scale invariance', 'four snapshots', 'UTC/Beijing/New York incl DST', 'arrow/hand cursor lifecycle', 'two complete turns', 'location', 'UTC time', 'layers', 'camera motion', 'observer view', 'below-horizon toggle', 'mobile layout', 'legacy Sun/Moon', 'topocentric readings', 'double-click line', 'bilingual term tooltip'],
    spin,
    limitation: 'Direct file:// navigation is blocked by this cloud browser policy and was not validated.',
    browserErrors: errors.length,
    externalRequests: externalRequests.length,
  };
  await writeFile(`${artifactStem}-validation.json`, JSON.stringify(validation, null, 2) + '\n');
  console.log(JSON.stringify(validation, null, 2));
} finally {
  await browser.close();
}
