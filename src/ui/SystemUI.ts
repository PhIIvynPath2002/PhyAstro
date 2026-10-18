import { createElement, Bug, Crosshair, RotateCcw, Plus, Minus, Maximize, ScanSearch, X, type IconNode } from 'lucide';
import { BODY_DEFINITIONS, BODY_IDS, type SystemBodyId } from '../core/system/Bodies';
import { civilTime, SNAPSHOTS, ECLIPSE_SNAPSHOTS, type DisplayTimeZone } from '../core/system/CivilTime';
import { measure } from '../core/system/Measurements';
import { SystemStore, type ScaleMode } from '../core/system/Store';
import type { SystemScene } from '../rendering/system/SystemScene';
import { escapeHtml } from './format';

const numeric = (value: number, digits = 3) => value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const vector = (values: readonly number[], digits = 3) => values.map(value => numeric(value, digits)).join(', ');
function iconButton(name: string, glyph: IconNode, action: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.dataset.tooltip = name;
  button.setAttribute('aria-label', name);
  button.append(createElement(glyph, { width: 17, height: 17, 'stroke-width': 1.4, 'aria-hidden': 'true' }));
  button.addEventListener('click', action);
  return button;
}
export class SystemUI {
  private unsubscribe: () => void;
  private panel: HTMLElement;
  private debugButton: HTMLButtonElement;
  private lastCameraKey = '';
  private lastCameraUpdate = 0;
  private cameraTimer = 0;
  private onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') this.setDebugOpen(false); };

  constructor(private root: HTMLElement, private store: SystemStore, private scene: SystemScene) {
    root.innerHTML = `<header class="system-header"><div class="wordmark">PhyAstro<span class="version">0.3.0</span></div>
      <div class="system-header-actions"></div></header>
      <div class="system-summary"><span class="system-centers"></span><span class="system-scale"></span><span>Geometric Position</span></div>
      <aside class="system-debug" aria-label="科学调试面板"><div class="system-panel-title"><div><h1>科学调试</h1><small>Scientific Debug · v0.3.0</small></div></div>
        <div class="system-panel-content"><div class="system-controls">
          <div class="field-pair"><label class="field">观测中心 · Observer<select aria-label="观测中心">${BODY_IDS.map(id => `<option value="${id}">${BODY_DEFINITIONS[id].english} Center</option>`).join('')}</select></label>
          <label class="field">目标 · Target<select aria-label="目标天体"></select></label></div>
          <label class="field">固定快照 · UTC<select aria-label="时间快照"><optgroup label="季度快照">${SNAPSHOTS.map(value => `<option value="${value}">${value.slice(0, 10)} 00:00:00 UTC</option>`).join('')}</optgroup><optgroup label="食影几何实验 · 非接触时刻预测">${ECLIPSE_SNAPSHOTS.map(value => `<option value="${value}">${value.slice(0, 16).replace('T', ' ')} UTC</option>`).join('')}</optgroup></select></label>
          <label class="field">显示时区<select aria-label="显示时区"><option value="UTC">UTC</option><option value="Asia/Shanghai">Beijing · Asia/Shanghai</option><option value="America/New_York">New York · America/New_York</option><option disabled>月球时间 · 尚未定义</option></select></label>
          <label class="field">显示比例<select aria-label="显示比例"><option value="physical">Physical Scale · 真实比例</option><option value="enhanced">Enhanced Visibility · 增强可见性</option></select></label>
          <label class="field">表面光照<select aria-label="表面光照"><option value="strict">Strict Solar · 仅太阳光</option><option value="debug">Debug Ambient · 3.5% 环境补光</option></select></label>
          <label class="system-reference-toggle"><input type="checkbox" aria-label="UI Lighting"/>UI Lighting · Artistic Feedback</label>
          <label class="system-reference-toggle"><input type="checkbox" aria-label="地球参考线"/>地球参考线</label>
          <p class="system-reference-status"></p>
        </div>
        <dl class="system-basic readings">
          <div><dt>计算时刻 · UTC</dt><dd data-reading="utc"></dd></div>
          <div><dt>民用时间</dt><dd data-reading="civil"></dd></div>
          <div><dt>参考系 / 原点</dt><dd>EQJ (J2000) / SSB</dd></div>
          <div><dt>星历时间尺度</dt><dd data-reading="tt"></dd></div>
          <div><dt>Observer Center · km</dt><dd data-reading="observer-position"></dd></div>
          <div><dt>Camera Position · km</dt><dd data-camera="position"></dd></div>
          <div><dt>Camera − Observer · km</dt><dd data-camera="offset"></dd></div>
          <div><dt>目标锁定</dt><dd data-camera="locked"></dd></div>
          <div><dt>场景可见性集合</dt><dd data-camera="visible"></dd></div>
        </dl>
        <section class="system-light-readings"><h2>光照与食影 <small>Physical Geometry</small></h2><dl class="readings">
          <div><dt>Sun − Camera 方向 · EQJ (1)</dt><dd data-light="sun-direction"></dd></div>
          <div><dt>Earth → Sun · EQJ (1)</dt><dd data-light="earth-sun"></dd></div>
          <div><dt>Moon → Sun · EQJ (1)</dt><dd data-light="moon-sun"></dd></div>
          <div><dt>月球相位角 · Camera · °</dt><dd data-light="phase-camera"></dd></div>
          <div><dt>月球受光盘面 · Camera · %</dt><dd data-light="fraction-camera"></dd></div>
          <div><dt>月球相位角 · Observer Center · °</dt><dd data-light="phase-center"></dd></div>
          <div><dt>月球受光盘面 · Observer Center · %</dt><dd data-light="fraction-center"></dd></div>
          <div><dt>Moon Center · 地球遮日</dt><dd data-light="moon-shadow"></dd></div>
          <div><dt>Earth Center · 月球遮日</dt><dd data-light="earth-shadow"></dd></div>
          <div><dt>阴影算法</dt><dd>Finite angular discs · 物理半径</dd></div>
          <div><dt>视觉补光</dt><dd data-light="ambient"></dd></div>
          <div><dt>UI Lighting · 艺术反馈</dt><dd data-light="ui"></dd></div>
        </dl></section>
        <div class="system-body-readings"></div>
        <details class="system-definitions"><summary>参考定义与验证状态</summary>
          <p>几何位置：同一 TT 时刻的质心位置。内部公里、双精度。X 指向 J2000 平春分点，Z 指向 J2000 天北极，Y 完成右手系。</p>
          <p>Astronomy Engine 2.1.19 · BaryState。UTC ≈ UT1；TT 采用库的 ΔT 近似。未做光行时、光行差、折射或引力偏折。</p>
          <p>独立 JPL 星历对照：尚未完成，当前环境访问 Horizons 被网络代理以 403 阻止。显示位数不代表精度。</p>
          <p>半径：Sun 695,700 km（IAU 2015 B3 标称）；Earth 6,371.0088 km（IUGG 平均）；Moon 1,737.4 km（NASA 平均）。</p>
          <p>增强球体仅用于显示，可能在远景重叠；真实距离、位置与几何角直径始终用物理数据。视野判断依据实际相机和当前渲染球体包围体，含完全与部分遮挡判断。</p>
          <p>表面光照及食影在物理球面上计算；增强模式仅放大投影。相机遮挡使用渲染球体，与物理食影不同。月球受光盘面比例未扣除食影。</p>
          <p>阴影：均匀亮度太阳角盘的平面圆交叠近似，无临边昏暗、折射或红月；近天体表面的大角度半影精度有限，不作食象接触预报。</p>
          <p>太阳：静态程序化光球示意（非实测）。地球/月球：CelestiaContent 2K 全球地图；NASA/USGS 原始数据及作者处理，GPL-2.0-or-later，来源与完整许可内置离线文档。Earth GAST/EQD→EQJ；Moon IAU 姿态含周期项，非高精度测地模型。</p>
        </details></div></aside>
      <div class="system-actions" aria-label="空间相机控制"></div>
      <footer class="system-footer"><time></time><span>SSB · EQJ / J2000 · 3 bodies</span></footer>`;
    this.panel = root.querySelector('.system-debug')!;
    this.debugButton = iconButton('科学调试面板', Bug, () => this.setDebugOpen(!!this.panel.hidden));
    this.debugButton.setAttribute('aria-controls', 'scientific-debug');
    this.panel.id = 'scientific-debug';
    root.querySelector('.system-header-actions')!.append(this.debugButton);
    root.querySelector('.system-panel-title')!.append(iconButton('关闭科学调试', X, () => this.setDebugOpen(false)));
    root.querySelector('.system-actions')!.append(
      iconButton('朝向目标', Crosshair, () => scene.focusTarget()),
      iconButton('近观目标', ScanSearch, () => scene.approachTarget()),
      iconButton('返回观测中心', RotateCcw, () => scene.recenter()),
      iconButton('系统全景', Maximize, () => scene.overview()),
      iconButton('放大', Plus, () => scene.controller.zoom(0.75)),
      iconButton('缩小', Minus, () => scene.controller.zoom(1 / 0.75)),
    );
    this.select('观测中心').addEventListener('change', event => store.update({ observer: (event.target as HTMLSelectElement).value as SystemBodyId }));
    this.select('目标天体').addEventListener('change', event => store.update({ target: (event.target as HTMLSelectElement).value as SystemBodyId }));
    this.select('时间快照').addEventListener('change', event => store.update({ instant: new Date((event.target as HTMLSelectElement).value) }));
    this.select('显示时区').addEventListener('change', event => store.update({ timeZone: (event.target as HTMLSelectElement).value as DisplayTimeZone }));
    this.select('显示比例').addEventListener('change', event => store.update({ scale: (event.target as HTMLSelectElement).value as ScaleMode }));
    this.select('表面光照').addEventListener('change', event => store.update({ lighting: (event.target as HTMLSelectElement).value as 'strict' | 'debug' }));
    root.querySelector<HTMLInputElement>('[aria-label="UI Lighting"]')!.addEventListener('change', event => store.update({ uiLighting: (event.target as HTMLInputElement).checked }));
    root.querySelector<HTMLInputElement>('[aria-label="地球参考线"]')!.addEventListener('change', event => store.update({ earthReferences: (event.target as HTMLInputElement).checked }));
    this.unsubscribe = store.subscribe(() => this.refresh());
    this.scene.onFrame = () => this.queueCameraRefresh();
    this.setDebugOpen(true);
    this.refresh();
    document.addEventListener('keydown', this.onKey);
  }
  private select(name: string): HTMLSelectElement { return this.root.querySelector<HTMLSelectElement>(`select[aria-label="${name}"]`)!; }
  private setDebugOpen(open: boolean): void {
    this.panel.hidden = !open;
    this.debugButton.setAttribute('aria-expanded', String(open));
    this.root.parentElement!.classList.toggle('debug-open', open);
    this.root.querySelector<HTMLElement>('.system-actions')!.inert = open && innerWidth <= 760;
    this.lastCameraKey = '';
    this.refreshCamera();
  }
  private refresh(): void {
    const state = this.store.state;
    const snapshot = state.snapshot;
    this.select('观测中心').value = state.observer;
    this.select('目标天体').innerHTML = BODY_IDS.filter(id => id !== state.observer)
      .map(id => `<option value="${id}" ${id === state.target ? 'selected' : ''}>${BODY_DEFINITIONS[id].name} · ${BODY_DEFINITIONS[id].english}</option>`).join('');
    const times = this.select('时间快照');
    const custom = times.querySelector('[data-custom]');
    custom?.remove();
    if (!Array.from(times.options).some(option => option.value === snapshot.utc)) {
      const option = new Option(`${snapshot.utc.replace('T', ' ').replace('.000Z', ' UTC')}`, snapshot.utc);
      option.dataset.custom = 'true';
      times.append(option);
    }
    times.value = snapshot.utc;
    this.select('显示时区').value = state.timeZone;
    this.select('显示比例').value = state.scale;
    this.select('表面光照').value = state.lighting;
    this.root.querySelector<HTMLInputElement>('[aria-label="UI Lighting"]')!.checked = state.uiLighting;
    const references = this.root.querySelector<HTMLInputElement>('[aria-label="地球参考线"]')!;
    references.checked = state.earthReferences;
    references.disabled = state.observer !== 'earth';
    this.root.querySelector('.system-reference-status')!.textContent = state.observer === 'earth'
      ? '地球日期平坐标参考，经岁差转入 EQJ；地平参考地点沿用坐标仪。科学测量中心为 Earth Center。'
      : '地球坐标网格已隐藏；本版本尚未定义太阳或月球本体固定坐标网格。';
    this.root.querySelector('.system-centers')!.textContent = `${BODY_DEFINITIONS[state.observer].english} Center → ${BODY_DEFINITIONS[state.target].english}`;
    this.root.querySelector('.system-scale')!.textContent = state.scale === 'physical' ? 'Physical Scale' : 'Enhanced Visibility';
    const reading = (key: string, text: string) => { this.root.querySelector(`[data-reading="${key}"]`)!.textContent = text; };
    reading('utc', snapshot.utc.replace('T', ' ').replace('.000Z', ' UTC'));
    const civil = civilTime(new Date(snapshot.utc), state.timeZone);
    reading('civil', `${civil} · ${state.timeZone}`);
    reading('tt', `JD ${snapshot.julianDateTT.toFixed(8)} TT; ΔT ${numeric(snapshot.deltaTSeconds, 3)} s`);
    reading('observer-position', vector(snapshot.bodies[state.observer].positionKm));
    this.root.querySelector('time')!.textContent = `${civil} · ${state.timeZone}`;
    this.root.querySelector('time')!.dateTime = snapshot.utc;
    this.root.querySelector('.system-body-readings')!.innerHTML = BODY_IDS.filter(id => id !== state.observer).map(id => {
      const body = snapshot.bodies[id];
      const measurement = measure(snapshot, state.observer, id);
      return `<section class="system-body-data" data-measurement="${id}"><h2>${escapeHtml(body.name)} <small>${body.english}</small>${state.target === id ? '<span>Target</span>' : ''}</h2>
        <dl class="readings"><div><dt>中心距离 · km</dt><dd>${numeric(measurement.distanceKm)}</dd></div>
        <div><dt>相对 X · km</dt><dd>${numeric(measurement.vectorKm[0])}</dd></div>
        <div><dt>相对 Y · km</dt><dd>${numeric(measurement.vectorKm[1])}</dd></div>
        <div><dt>相对 Z · km</dt><dd>${numeric(measurement.vectorKm[2])}</dd></div>
        <div><dt>单位方向 · (1)</dt><dd>${vector(measurement.direction, 7)}</dd></div>
        <div><dt>几何角直径 · °</dt><dd>${numeric(measurement.angularDiameterDeg, 8)}</dd></div>
        <div><dt>Physical Radius · km</dt><dd>${numeric(body.physicalRadiusKm, 4)}</dd></div>
        <div><dt>Render Radius · km</dt><dd data-render-radius="${id}"></dd></div>
        <div><dt>实际相机视野</dt><dd data-visibility="${id}"></dd></div></dl></section>`;
    }).join('');
    this.lastCameraKey = '';
    this.refreshCamera();
  }
  private queueCameraRefresh(): void {
    const now = performance.now();
    if (now - this.lastCameraUpdate >= 120) this.refreshCamera();
    else {
      clearTimeout(this.cameraTimer);
      this.cameraTimer = window.setTimeout(() => this.refreshCamera(), 125);
    }
  }
  private refreshCamera(): void {
    this.lastCameraUpdate = performance.now();
    const diagnostics = this.scene.diagnostics;
    const key = JSON.stringify([diagnostics.cameraKm, diagnostics.instant, diagnostics.locked, diagnostics.scale, diagnostics.lighting, diagnostics.uiLighting, diagnostics.bodies.map(body => [body.id, body.renderRadiusKm, body.visibility])]);
    if (key === this.lastCameraKey && !this.panel.hidden) return;
    this.lastCameraKey = key;
    const set = (name: string, text: string) => { this.root.querySelector(`[data-camera="${name}"]`)!.textContent = text; };
    set('position', vector(diagnostics.cameraKm));
    set('offset', vector(diagnostics.cameraOffsetKm));
    set('locked', diagnostics.locked ? '锁定 Target' : '自由旋转');
    set('visible', `${diagnostics.visibleBodies.length} / 3 · Sun, Earth, Moon`);
    const light = diagnostics.illumination;
    const showLight = (name: string, text: string) => { this.root.querySelector(`[data-light="${name}"]`)!.textContent = text; };
    if (light) {
      showLight('sun-direction', vector(diagnostics.sunCameraDirection, 7));
      showLight('earth-sun', vector(light.earthSunDirection, 7));
      showLight('moon-sun', vector(light.moonSunDirection, 7));
      showLight('phase-camera', numeric(light.moonFromCamera.angleDeg, 5));
      showLight('fraction-camera', numeric(light.moonFromCamera.illuminatedFraction * 100, 5));
      showLight('phase-center', light.moonFromCenter ? numeric(light.moonFromCenter.angleDeg, 5) : '未定义 · Observer = Moon');
      showLight('fraction-center', light.moonFromCenter ? numeric(light.moonFromCenter.illuminatedFraction * 100, 5) : '未定义 · Observer = Moon');
      showLight('moon-shadow', `${light.moonShadow.state} · 太阳可见 ${(light.moonShadow.fraction * 100).toFixed(5)}%`);
      showLight('earth-shadow', `${light.earthCenterShadow.state} · 太阳可见 ${(light.earthCenterShadow.fraction * 100).toFixed(5)}%`);
    }
    showLight('ambient', diagnostics.lighting === 'strict' ? '0% · 严格太阳光照' : '3.5% · 调试参数');
    showLight('ui', diagnostics.uiLighting ? 'On · Artistic Visualization' : 'Off');
    for (const body of diagnostics.bodies) {
      const radius = this.root.querySelector(`[data-render-radius="${body.id}"]`);
      if (radius) radius.textContent = numeric(body.renderRadiusKm);
      const visible = this.root.querySelector(`[data-visibility="${body.id}"]`);
      if (visible) visible.textContent = !body.visibility.inFrustum ? '视锥外' : body.visibility.occluded ? '完全遮挡'
        : body.visibility.partial ? '视锥内 · 部分遮挡' : '视锥内 · 未遮挡';
    }
  }
  dispose(): void {
    clearTimeout(this.cameraTimer);
    this.unsubscribe();
    this.scene.onFrame = undefined;
    document.removeEventListener('keydown', this.onKey);
  }
}
