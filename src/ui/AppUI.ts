import { createElement, MapPin, Clock3, Layers3, Crosshair, RotateCcw, Plus, Minus, X, LocateFixed, ArrowRight, Info, type IconNode } from 'lucide';
import { DEG, HOUR } from '../core/astronomy/CoordinateSystems';
import { astronomicalTime, localSiderealTime } from '../core/astronomy/Time';
import { validateObserver } from '../core/astronomy/Observer';
import { places, findPlace } from '../core/data/places';
import type { Layer, Store } from '../core/data/State';
import type { CelestialScene } from '../rendering/Scene';
import { inspect } from './Inspector';
import { escapeHtml, hours, latitude, longitude, utcLabel } from './format';
import { terminology, termKey, hideTerm } from './Terminology';

type Tool = 'location' | 'time' | 'layers' | 'inspect' | 'model' | null;
const icon = (node: IconNode) => createElement(node, { width: 17, height: 17, 'stroke-width': 1.4, 'aria-hidden': 'true' });

export class AppUI {
  private panel: HTMLElement;
  private activeTool: Tool = null;
  private probeEnabled = false;
  private lastSelected: string | null = null;
  private previousFocus: HTMLElement | null = null;
  private toolbarButtons = new Map<string, HTMLButtonElement>();
  private geolocationRequest = 0;
  private feedbackTimer = 0;
  private disposeTerms: () => void;
  private unsubscribe: () => void;
  private onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.setProbe(false);
      this.close();
    }
  };

  constructor(private root: HTMLElement, private store: Store, private scene: CelestialScene) {
    root.innerHTML = `
      <header class="topbar">
        <div class="wordmark">PhyAstro<span class="version">0.1</span></div>
        <nav class="tools" aria-label="观察工具"></nav>
      </header>
      <div class="view-switch" role="group" aria-label="观察视角"><button data-view="orbit" aria-label="天球视角" aria-pressed="true">天球</button><button data-view="observer" aria-label="地面视角" aria-pressed="false">地面</button></div>
      <output class="heading-readout" aria-label="视线方向" hidden></output>
      <section class="tool-panel" aria-label="工具" hidden></section>
      <footer class="statusbar">
        <button class="location-status" aria-label="编辑观察地点"><span class="status-dot"></span><span><span class="place-name"></span><span class="coordinates"></span></span></button>
        <button class="time-status" aria-label="编辑观测时间"><span class="date-value"></span><span class="time-kind">UTC · 固定</span></button>
      </footer>
      <div class="camera-tools" aria-label="视角控制"></div>
      <div class="toast" role="status" hidden></div>`;
    this.panel = root.querySelector('.tool-panel')!;
    this.disposeTerms = terminology(document.querySelector<HTMLElement>('#app')!);
    root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.addEventListener('click', () => {
      this.setProbe(false);
      this.openTool(null);
      store.update({ view: button.dataset.view === 'observer' ? 'observer' : 'orbit', selected: null });
    }));
    const heading = root.querySelector<HTMLOutputElement>('.heading-readout')!;
    scene.onHeading = (az, alt) => {
      const azimuth = Math.abs(alt) > 89.999999 ? '未定义' : `${(Number(az.toFixed(1)) % 360).toFixed(1)}°`;
      const value = `Az ${azimuth}   Alt ${alt >= 0 ? '+' : ''}${alt.toFixed(1)}°`;
      if (heading.value !== value) heading.value = value;
    };
    const toolbar = root.querySelector<HTMLElement>('.tools')!;
    for (const [id, label, glyph] of [
      ['location', '观察地点', MapPin], ['time', '观测时间', Clock3],
      ['layers', '参考图层', Layers3], ['probe', '方向探针', Crosshair],
    ] as const) {
      const button = this.iconButton(label, glyph, () => {
        if (id === 'probe') this.setProbe(!this.probeEnabled);
        else this.openTool(this.activeTool === id ? null : id);
      });
      button.setAttribute('aria-pressed', 'false');
      button.dataset.tool = id;
      this.toolbarButtons.set(id, button);
      toolbar.append(button);
    }
    const cameraTools = root.querySelector('.camera-tools')!;
    cameraTools.append(
      this.iconButton('放大', Plus, () => scene.controller.zoom(0.85)),
      this.iconButton('缩小', Minus, () => scene.controller.zoom(1 / 0.85)),
      this.iconButton('重置视角', RotateCcw, () => scene.controller.reset()),
      this.iconButton('模型约定', Info, () => this.openTool(this.activeTool === 'model' ? null : 'model')),
    );
    root.querySelector('.location-status')!.addEventListener('click', () => this.openTool(this.activeTool === 'location' ? null : 'location'));
    root.querySelector('.time-status')!.addEventListener('click', () => this.openTool(this.activeTool === 'time' ? null : 'time'));
    document.addEventListener('keydown', this.onKey);
    scene.onProbePlaced = () => this.setProbe(false);
    this.unsubscribe = store.subscribe(() => {
      this.refreshStatus();
      if (store.state.selected !== this.lastSelected) {
        this.lastSelected = store.state.selected;
        if (store.state.selected) this.openTool('inspect');
        else if (this.activeTool === 'inspect') this.openTool(null);
      } else if (this.activeTool === 'inspect') this.renderPanel();
    });
    this.refreshStatus();
  }

  dispose(): void {
    this.disposeTerms();
    clearTimeout(this.feedbackTimer);
    this.scene.onHeading = undefined;
    this.unsubscribe();
    this.geolocationRequest++;
    document.removeEventListener('keydown', this.onKey);
  }

  private iconButton(label: string, glyph: IconNode, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button';
    button.setAttribute('aria-label', label);
    button.dataset.tooltip = label;
    button.append(icon(glyph));
    button.addEventListener('click', onClick);
    return button;
  }

  private setProbe(enabled: boolean): void {
    this.probeEnabled = enabled;
    this.toolbarButtons.get('probe')!.setAttribute('aria-pressed', String(enabled));
    this.scene.setProbeMode(enabled);
    if (enabled) {
      this.openTool(null);
      this.store.update({ selected: null });
    }
  }

  private openTool(tool: Tool): void {
    if (tool && tool !== 'inspect' && this.probeEnabled) this.setProbe(false);
    if (tool && !this.activeTool) this.previousFocus = document.activeElement as HTMLElement;
    this.activeTool = tool;
    if (tool && tool !== 'inspect' && this.store.state.selected) this.store.update({ selected: null });
    for (const [id, button] of this.toolbarButtons) {
      if (id !== 'probe') button.setAttribute('aria-pressed', String(id === tool));
    }
    this.renderPanel();
  }

  private close(): void {
    this.openTool(null);
    this.store.update({ selected: null });
    this.previousFocus?.focus();
  }

  private feedback(message: string): void {
    const toast = this.root.querySelector<HTMLElement>('.toast')!;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = window.setTimeout(() => { toast.hidden = true; }, 2400);
  }

  private refreshStatus(): void {
    const { observer, instant, view } = this.store.state;
    document.querySelector('#app')!.classList.toggle('observer-view', view === 'observer');
    this.root.querySelector<HTMLElement>('.heading-readout')!.hidden = view !== 'observer';
    this.root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    this.root.querySelector('.place-name')!.textContent = observer.name;
    this.root.querySelector('.coordinates')!.textContent = `${latitude(observer.latitude)}   ${longitude(observer.longitude)}`;
    this.root.querySelector('.date-value')!.textContent = utcLabel(instant);
  }

  private renderPanel(): void {
    hideTerm();
    this.panel.hidden = !this.activeTool;
    this.root.querySelector<HTMLElement>('.camera-tools')!.inert = !!this.activeTool;
    if (!this.activeTool) return;
    const titles = {
      location: ['观察地点', 'Observer'], time: ['观测时间', 'Astronomical time'],
      layers: ['参考图层', 'Reference layers'], inspect: ['', ''], model: ['模型约定', 'Phase 0.1'],
    };
    const inspection = this.activeTool === 'inspect' ? inspect(this.store.state) : null;
    const [title, subtitle] = inspection ? [inspection.name, inspection.english] : titles[this.activeTool];
    this.panel.innerHTML = `<div class="panel-heading"><div data-term-cn="${escapeHtml(title)}" data-term-en="${escapeHtml(subtitle)}"><h1>${escapeHtml(title)}</h1><span>${escapeHtml(subtitle)}</span></div></div><div class="panel-body"></div>`;
    this.panel.querySelector('.panel-heading')!.append(this.iconButton('关闭工具', X, () => this.close()));
    const body = this.panel.querySelector<HTMLElement>('.panel-body')!;
    this.panel.setAttribute('aria-label', title);
    if (this.activeTool === 'location') this.locationPanel(body);
    if (this.activeTool === 'time') this.timePanel(body);
    if (this.activeTool === 'layers') this.layersPanel(body);
    if (this.activeTool === 'inspect' && inspection) {
      body.innerHTML = `<dl class="readings">${inspection.rows.map(([key, value]) => `<div><dt data-term="${termKey(key)}">${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${inspection.note ? `<p class="model-note">${escapeHtml(inspection.note)}</p>` : ''}`;
      if (this.store.state.selected === 'probe') this.probePanel(body);
    }
    if (this.activeTool === 'model') {
      body.innerHTML = `<dl class="readings">
        <div><dt>参考架</dt><dd>日期平赤道</dd></div><div><dt>地球</dt><dd>球形近似</dd></div>
        <div><dt>方位角</dt><dd>北 0° → 东 90°</dd></div><div><dt>时间近似</dt><dd>UT1 ≈ UTC</dd></div>
        <div><dt>观测修正</dt><dd>无折射 / 章动 / 极移</dd></div></dl>
        <p class="model-note">地平圈表示与观察者切平面平行的方向。天球半径为显示尺度，不表示天体距离。</p>
        <p class="model-note">日月采用 Meeus 几何星历，地面含球形地球站心视差；按真实角直径投影，不是统一距离比例。无光行差、光行时、月相或光照模拟，不用于食象接触时刻、导航或精密指向。</p>
        <p class="model-note">1900–2100 · 平坐标教学模型<br>地理数据：Natural Earth / World Atlas</p>`;
    }
  }

  private locationPanel(body: HTMLElement): void {
    const observer = this.store.state.observer;
    body.innerHTML = `<form id="location-form">
      <label class="field">地点预设<select name="preset" aria-label="地点预设"><option value="">自定义地点</option>${places.map((place, index) => `<option value="${index}" ${place.latitude === observer.latitude && place.longitude === observer.longitude ? 'selected' : ''}>${escapeHtml(place.name)}</option>`).join('')}</select></label>
      <label class="field">城市 / 地点<input name="name" aria-label="城市或地点" value="${escapeHtml(observer.name)}" maxlength="60" autocomplete="off" /></label>
      <div class="field-pair"><label class="field">纬度 · Latitude<input name="latitude" aria-label="纬度" type="number" min="-90" max="90" step="any" value="${observer.latitude}" required /></label><label class="field">经度 · Longitude<input name="longitude" aria-label="经度" type="number" min="-180" max="180" step="any" value="${observer.longitude}" required /></label></div>
      <p class="field-error" role="status" hidden></p>
      <div class="form-actions"><button class="text-button locate" type="button">当前位置</button><button class="primary-button" type="submit">应用</button></div>
    </form>`;
    const form = body.querySelector<HTMLFormElement>('form')!;
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
    const error = form.querySelector<HTMLElement>('.field-error')!;
    form.querySelector('.locate')!.prepend(icon(LocateFixed));
    form.querySelector('.primary-button')!.append(icon(ArrowRight));
    field('preset').addEventListener('change', () => {
      if (!field('preset').value) return;
      const place = places[Number(field('preset').value)];
      field('name').value = place.name;
      field('latitude').value = String(place.latitude);
      field('longitude').value = String(place.longitude);
      this.store.update({ observer: { ...place } });
      this.feedback('观察地点已更新');
    });
    for (const name of ['latitude', 'longitude']) field(name).addEventListener('input', () => {
      field('preset').value = '';
      if (findPlace(field('name').value)) field('name').value = '自定义地点';
    });
    field('name').addEventListener('change', () => {
      const place = findPlace(field('name').value);
      if (!place) return;
      field('latitude').value = String(place.latitude);
      field('longitude').value = String(place.longitude);
      field('preset').value = String(places.indexOf(place));
      this.store.update({ observer: { ...place } });
      this.feedback('观察地点已更新');
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const next = validateObserver({ name: field('name').value, latitude: field('latitude').valueAsNumber, longitude: field('longitude').valueAsNumber });
        this.geolocationRequest++;
        this.store.update({ observer: next });
        this.close();
        this.feedback('观察地点已更新');
      } catch (reason) { error.hidden = false; error.textContent = (reason as Error).message; }
    });
    form.querySelector<HTMLButtonElement>('.locate')!.addEventListener('click', event => {
      const button = event.currentTarget as HTMLButtonElement;
      const request = ++this.geolocationRequest;
      error.hidden = false;
      if (!navigator.geolocation) { error.textContent = '定位不可用，请手动输入经纬度。'; return; }
      error.textContent = '正在获取位置…';
      button.disabled = true;
      navigator.geolocation.getCurrentPosition(position => {
        if (request !== this.geolocationRequest || !form.isConnected) return;
        button.disabled = false;
        field('name').value = '当前位置';
        field('latitude').value = position.coords.latitude.toFixed(6);
        field('longitude').value = position.coords.longitude.toFixed(6);
        field('preset').value = '';
        error.textContent = `定位精度约 ${Math.round(position.coords.accuracy)} m`;
      }, () => {
        if (request !== this.geolocationRequest || !form.isConnected) return;
        button.disabled = false;
        error.textContent = '未获得定位，请手动输入经纬度。';
        field('latitude').focus();
      }, { timeout: 10000, maximumAge: 60000 });
    });
  }

  private timePanel(body: HTMLElement): void {
    const time = astronomicalTime(this.store.state.instant);
    body.innerHTML = `<form><label class="field">日期与时间 · UTC<input name="utc" aria-label="UTC 日期与时间" type="datetime-local" step="1" min="1900-01-01T00:00:00" max="2100-12-31T23:59:59" value="${time.utc.toISOString().slice(0, 19)}" required /></label>
      <dl class="readings"><div><dt data-term="LST">地方恒星时 · LST</dt><dd>${hours(localSiderealTime(time, this.store.state.observer.longitude))}</dd></div><div><dt data-term="JD">儒略日 · JD</dt><dd>${time.julianDate.toFixed(5)} d</dd></div></dl>
      <p class="field-error" role="status" hidden></p><div class="form-actions"><button type="button" class="text-button now">现在</button><button type="submit" class="primary-button">应用</button></div></form>`;
    const form = body.querySelector('form')!;
    const field = form.elements.namedItem('utc') as HTMLInputElement;
    field.addEventListener('change', () => {
      if (!field.value || !field.validity.valid) return;
      this.store.update({ instant: new Date(`${field.value}Z`) });
      const updated = astronomicalTime(this.store.state.instant);
      const readings = body.querySelectorAll('dd');
      readings[0].textContent = hours(localSiderealTime(updated, this.store.state.observer.longitude));
      readings[1].textContent = `${updated.julianDate.toFixed(5)} d`;
      this.feedback('观测时间已更新 · UTC');
    });
    body.querySelector('.now')!.addEventListener('click', () => {
      this.store.update({ instant: new Date() });
      this.renderPanel();
    });
    body.querySelector('.primary-button')!.append(icon(ArrowRight));
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        this.store.update({ instant: new Date(`${field.value}Z`) });
        this.close();
        this.feedback('观测时间已更新 · UTC');
      } catch {
        const error = body.querySelector<HTMLElement>('.field-error')!;
        error.hidden = false;
        error.textContent = '请输入 1900–2100 年间的有效 UTC 时间。';
      }
    });
  }

  private layersPanel(body: HTMLElement): void {
    const layers: [Layer, string, string][] = [
      ['equatorial', '赤道坐标', 'Equatorial'], ['horizon', '地平坐标', 'Horizontal'],
      ['ecliptic', '黄道参考', 'Ecliptic'], ['grid', '赤道网格', 'Grid'],
      ...(this.store.state.view === 'observer' ? [['horizontalGrid', '地平网格', 'Altitude / Azimuth'] as [Layer, string, string]] : [['axes', '地球自转轴', 'Polar axis'] as [Layer, string, string]]),
      ['labels', '空间标签', 'Labels'],
      ['sun', '太阳', 'Sun'], ['moon', '月球', 'Moon'],
    ];
    body.innerHTML = `<div class="layer-list">${layers.map(([id, name, en]) => `<label class="layer-row"><span class="layer-swatch ${id}"></span><span class="layer-title" data-term-cn="${name}" data-term-en="${en}">${name}<small>${en}</small></span><input type="checkbox" role="switch" aria-label="${name}" data-layer="${id}" ${this.store.state.layers[id] ? 'checked' : ''}/></label>`).join('')}</div>`;
    body.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(input => input.addEventListener('change', () => {
      const layer = input.dataset.layer as Layer;
      this.store.update({ layers: { ...this.store.state.layers, [layer]: input.checked }, selected: null });
    }));
    if (this.store.state.view === 'observer') {
      const row = document.createElement('label');
      row.className = 'layer-row';
      row.innerHTML = `<span class="layer-swatch below"></span><span class="layer-title">地平线下参考线<small>Below horizon</small></span><input type="checkbox" role="switch" aria-label="地平线下参考线" ${this.store.state.showBelowHorizon ? 'checked' : ''}/>`;
      row.querySelector('input')!.addEventListener('change', event => this.store.update({ showBelowHorizon: (event.target as HTMLInputElement).checked, selected: null }));
      body.querySelector('.layer-list')!.append(row);
    }
  }

  private probePanel(body: HTMLElement): void {
    const probe = this.store.state.probe!;
    const form = document.createElement('form');
    form.className = 'probe-form';
    form.innerHTML = `<div class="field-pair"><label class="field">RA · h<input aria-label="探针赤经" name="ra" type="number" min="0" max="23.999999" step="any" required value="${(Number(((probe.ra ?? 0) / HOUR).toFixed(5)) % 24).toFixed(5)}" /></label><label class="field">Dec · °<input aria-label="探针赤纬" name="dec" type="number" min="-90" max="90" step="any" required value="${(probe.dec / DEG).toFixed(5)}" /></label></div><div class="form-actions"><button class="text-button remove" type="button">移除探针</button><button class="primary-button" type="submit">应用</button></div>`;
    form.addEventListener('submit', event => {
      event.preventDefault();
      const ra = (form.elements.namedItem('ra') as HTMLInputElement).valueAsNumber;
      const dec = (form.elements.namedItem('dec') as HTMLInputElement).valueAsNumber;
      this.store.update({ probe: { ra: Math.abs(dec) === 90 ? null : ra * HOUR, dec: dec * DEG } });
    });
    form.querySelector('.remove')!.addEventListener('click', () => { this.store.update({ probe: null, selected: null }); });
    form.querySelector('.primary-button')!.append(icon(ArrowRight));
    body.append(form);
  }
}
