import * as THREE from 'three';
import { BODY_IDS, add, length, subtract, type SystemBodyId, type VectorKm } from '../../core/system/Bodies';
import { constrainCamera } from '../../core/system/CameraGeometry';
import { measure } from '../../core/system/Measurements';
import { meanDateToJ2000 } from '../../core/system/ReferenceFrame';
import { SystemStore, type ObservationState } from '../../core/system/Store';
import { Store as CoordinateStore } from '../../core/data/State';
import { celestialSphere } from '../../celestial/CelestialSphere';
import { CameraController } from '../../interaction/CameraController';
import { toAstronomyVector, toRenderVector } from '../coordinates';
import { KM_PER_RENDER_UNIT, localRenderPosition, renderRadiusKm } from './Scale';
import { bodyVisibility, type RenderSphere, type Visibility } from './Visibility';

interface RenderedBody {
  id: SystemBodyId;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  label: HTMLButtonElement;
  renderRadiusKm: number;
  visibility: Visibility;
}
export class SystemScene {
  readonly camera = new THREE.PerspectiveCamera(42, 1, 1e-8, 1000);
  readonly navigationCamera = new THREE.PerspectiveCamera(42, 1, 1e-8, 1000);
  readonly renderer: THREE.WebGLRenderer;
  readonly controller: CameraController;
  private scene = new THREE.Scene();
  private bodies = new Map<SystemBodyId, RenderedBody>();
  private references = new THREE.Group();
  private referenceLabels: { element: HTMLElement; direction: THREE.Vector3 }[] = [];
  private labelRoot: HTMLElement;
  private observerResize: ResizeObserver;
  private unsubscribe: () => void;
  private frame = 0;
  private fitRadius = 0.25;
  private aimOffset = new THREE.Quaternion();
  private locked = false;
  private previousCameraKm: VectorKm | null = null;
  private cameraKm: VectorKm = [0, 0, 0];
  private currentSpheres: RenderSphere[] = [];
  private raycaster = new THREE.Raycaster();
  private forceSummary = true;
  onFrame?: () => void;

  constructor(private root: HTMLElement, private store: SystemStore, private coordinates: CoordinateStore) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x090909);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', '日地月统一空间视图');
    root.append(canvas);
    this.labelRoot = document.createElement('div');
    this.labelRoot.className = 'system-labels';
    root.append(this.labelRoot);
    this.scene.add(this.references);
    const colors = { sun: 0xe0e0e0, earth: 0x888888, moon: 0x484848 };
    for (const id of BODY_IDS) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.MeshBasicMaterial({ color: colors[id] }));
      mesh.name = id;
      const label = document.createElement('button');
      label.className = 'system-body-label';
      label.dataset.body = id;
      label.setAttribute('aria-label', `选择${store.state.snapshot.bodies[id].name}`);
      label.innerHTML = `<span>${store.state.snapshot.bodies[id].name}</span><small>${store.state.snapshot.bodies[id].english}</small>`;
      label.addEventListener('click', event => {
        if (event.detail !== 0) return;
        if (id !== this.store.state.observer) this.store.update({ target: id });
      });
      this.labelRoot.append(label);
      this.scene.add(mesh);
      this.bodies.set(id, { id, mesh, label, renderRadiusKm: 1,
        visibility: { inFrustum: false, occluded: false, partial: false, inView: false } });
    }
    this.updateFitRadius();
    this.controller = new CameraController(this.navigationCamera, root, {
      referenceRadius: () => this.fitRadius,
      minimumDistance: () => this.observerRadiusKm() * 1.12 / KM_PER_RENDER_UNIT,
      maximumDistance: () => 2_000_000_000 / KM_PER_RENDER_UNIT,
    });
    this.controller.setHome(new THREE.Vector3(0.2, 1.1, 0.65));
    this.controller.onTap = (event, target) => {
      const label = target instanceof Element ? target.closest<HTMLElement>('.system-body-label') : null;
      if (label) {
        const id = label.dataset.body as SystemBodyId;
        if (id !== this.store.state.observer) this.store.update({ target: id });
        return;
      }
      const box = root.getBoundingClientRect();
      this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1,
        -(event.clientY - box.top) / box.height * 2 + 1), this.camera);
      const hit = this.raycaster.intersectObjects([...this.bodies.values()].map(body => body.mesh), false)[0];
      if (hit && hit.object.name !== this.store.state.observer) this.store.update({ target: hit.object.name as SystemBodyId });
    };
    root.addEventListener('pointerdown', this.unlockAim, true);
    root.addEventListener('wheel', this.onWheelAim, { capture: true, passive: true });
    root.addEventListener('keydown', this.onKeyAim, true);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    this.observerResize = new ResizeObserver(this.resize);
    this.observerResize.observe(root);
    this.resize();
    this.unsubscribe = store.subscribe((state, previous) => this.update(state, previous));
    this.update(store.state, store.state);
    this.animate();
  }

  private contextLost = (event: Event): void => {
    event.preventDefault();
    this.root.dispatchEvent(new CustomEvent('render-error', { bubbles: true, detail: '图形上下文已中断，请重新打开 HTML。' }));
  };
  private updateFitRadius(): void {
    const state = this.store.state;
    this.fitRadius = state.observer === 'sun' ? state.snapshot.bodies.sun.physicalRadiusKm * 4 / KM_PER_RENDER_UNIT
      : measure(state.snapshot, 'earth', 'moon').distanceKm * 1.4 / KM_PER_RENDER_UNIT;
  }
  private observerRadiusKm(): number {
    const state = this.store.state;
    const body = state.snapshot.bodies[state.observer];
    return renderRadiusKm(body.id, body.physicalRadiusKm, this.navigationCamera.position.length() * KM_PER_RENDER_UNIT,
      this.camera.fov, this.root.clientHeight, state.scale);
  }
  private update(state: ObservationState, previous: ObservationState): void {
    if (state.observer !== previous.observer) {
      this.updateFitRadius();
      this.controller.resize();
      this.previousCameraKm = null;
      this.unlockAim();
    }
    if (state.snapshot !== previous.snapshot || state.scale !== previous.scale) this.previousCameraKm = null;
    if (state.snapshot !== previous.snapshot || state.earthReferences !== previous.earthReferences || state.observer !== previous.observer || this.references.children.length === 0)
      this.buildReferences();
    this.forceSummary = true;
    this.renderFrame();
  }
  private buildReferences(): void {
    for (const object of this.references.children) if (object instanceof THREE.Line) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
    this.references.clear();
    this.referenceLabels.forEach(label => label.element.remove());
    this.referenceLabels = [];
    const state = this.store.state;
    if (state.observer !== 'earth' || !state.earthReferences) return;
    const instant = new Date(state.snapshot.utc);
    const transform = meanDateToJ2000(instant);
    const model = celestialSphere({ ...this.coordinates.state, instant });
    for (const line of model.lines) {
      if (line.layer === 'labels' || !this.coordinates.state.layers[line.layer]) continue;
      if (line.layer === 'grid' && !this.coordinates.state.layers.equatorial) continue;
      const vertices = line.points.map(direction => toRenderVector(transform(direction)).multiplyScalar(Math.hypot(...direction)));
      const material = line.dashed ? new THREE.LineDashedMaterial({ color: 0x999999, transparent: true, opacity: 0.35, dashSize: 0.05, gapSize: 0.04 })
        : new THREE.LineBasicMaterial({ color: 0x999999, transparent: true, opacity: line.tone === 'grid' ? 0.12 : 0.35 });
      const object = new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices), material);
      object.computeLineDistances();
      object.name = line.id;
      this.references.add(object);
    }
    for (const point of model.points) {
      if (!['ncp', 'scp', 'equator', 'ecliptic', 'horizon'].includes(point.id) || !this.coordinates.state.layers[point.layer] || !this.coordinates.state.layers.labels) continue;
      const element = document.createElement('span');
      element.className = 'system-reference-label';
      element.textContent = `${point.name} · ${point.short}`;
      this.labelRoot.append(element);
      this.referenceLabels.push({ element, direction: toRenderVector(transform(point.direction)) });
    }
  }
  private resize = (): void => {
    const { clientWidth: width, clientHeight: height } = this.root;
    if (!width || !height) return;
    this.camera.aspect = this.navigationCamera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.navigationCamera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.controller.resize();
    this.forceSummary = true;
  };
  private unlockAim = (): void => {
    if (!this.locked) return;
    this.aimOffset.copy(this.navigationCamera.quaternion).invert().multiply(this.camera.quaternion);
    this.locked = false;
  };
  private onWheelAim = (event: WheelEvent): void => { if (!event.ctrlKey && !event.metaKey) this.unlockAim(); };
  private onKeyAim = (event: KeyboardEvent): void => { if (event.key.startsWith('Arrow')) this.unlockAim(); };
  focusTarget(): void { this.locked = true; this.forceSummary = true; this.renderFrame(); }
  recenter(): void {
    this.locked = false;
    this.aimOffset.identity();
    this.previousCameraKm = null;
    this.updateFitRadius();
    this.controller.resize(true);
    this.forceSummary = true;
    this.renderFrame();
  }
  overview(): void {
    this.unlockAim();
    this.aimOffset.identity();
    this.navigationCamera.position.set(0, 450, 150);
    this.navigationCamera.up.set(0, 1, 0);
    this.navigationCamera.lookAt(0, 0, 0);
    this.previousCameraKm = null;
    this.forceSummary = true;
    this.renderFrame();
  }
  private renderFrame(): void {
    const state = this.store.state;
    const observer = state.snapshot.bodies[state.observer].positionKm;
    let candidate = add(observer, toAstronomyVector(this.navigationCamera.position.clone().multiplyScalar(KM_PER_RENDER_UNIT)));
    for (let pass = 0; pass < 2; pass++) {
      const obstacles = BODY_IDS.map(id => {
        const body = state.snapshot.bodies[id];
        return { center: body.positionKm, radiusKm: renderRadiusKm(id, body.physicalRadiusKm,
          length(subtract(body.positionKm, candidate)), this.camera.fov, this.root.clientHeight, state.scale) * 1.08 + 0.001 };
      });
      candidate = constrainCamera(candidate, pass === 0 ? this.previousCameraKm : null, obstacles);
    }
    const cameraChanged = this.cameraKm.some((value, axis) => value !== candidate[axis]);
    this.cameraKm = candidate;
    this.previousCameraKm = candidate;
    this.navigationCamera.position.copy(toRenderVector(subtract(candidate, observer))).multiplyScalar(1 / KM_PER_RENDER_UNIT);
    this.navigationCamera.lookAt(0, 0, 0);
    this.navigationCamera.updateMatrixWorld();
    this.camera.position.set(0, 0, 0);
    this.currentSpheres = BODY_IDS.map(id => {
      const body = state.snapshot.bodies[id];
      const rendered = this.bodies.get(id)!;
      rendered.renderRadiusKm = renderRadiusKm(id, body.physicalRadiusKm, length(subtract(body.positionKm, candidate)),
        this.camera.fov, this.root.clientHeight, state.scale);
      rendered.mesh.position.copy(localRenderPosition(body.positionKm, candidate));
      rendered.mesh.scale.setScalar(rendered.renderRadiusKm / KM_PER_RENDER_UNIT);
      rendered.mesh.visible = true;
      return { id, center: rendered.mesh.position.clone(), radius: rendered.renderRadiusKm / KM_PER_RENDER_UNIT };
    });
    const nearestSurface = Math.min(...this.currentSpheres.map(body => body.center.length() - body.radius));
    this.camera.near = Math.max(1e-10, Math.min(0.001, nearestSurface / 4));
    this.camera.far = Math.max(1, ...this.currentSpheres.map(body => body.center.length() + body.radius)) * 1.2;
    this.camera.updateProjectionMatrix();
    if (this.locked) this.camera.lookAt(this.bodies.get(state.target)!.mesh.position);
    else this.camera.quaternion.copy(this.navigationCamera.quaternion).multiply(this.aimOffset);
    this.camera.updateMatrixWorld();
    const referenceRadiusKm = Math.max(state.snapshot.bodies.earth.physicalRadiusKm * 3.6,
      this.bodies.get('earth')!.renderRadiusKm * 2.7);
    this.references.position.copy(localRenderPosition(state.snapshot.bodies.earth.positionKm, candidate));
    this.references.scale.setScalar(referenceRadiusKm / KM_PER_RENDER_UNIT);
    this.references.visible = state.observer === 'earth' && state.earthReferences;
    this.layoutLabels(referenceRadiusKm);
    this.renderer.render(this.scene, this.camera);
    if (this.forceSummary || cameraChanged || this.controller.isInteracting || this.locked) {
      this.forceSummary = false;
      this.onFrame?.();
    }
  }
  private layoutLabels(referenceRadiusKm: number): void {
    const boxes: { left: number; right: number; top: number; bottom: number }[] = [];
    const width = this.root.clientWidth, height = this.root.clientHeight;
    for (const sphere of this.currentSpheres) {
      const body = this.bodies.get(sphere.id)!;
      body.visibility = bodyVisibility(this.camera, sphere, this.currentSpheres);
      body.label.hidden = !body.visibility.inView;
      body.label.classList.toggle('target', sphere.id === this.store.state.target);
      if (body.label.hidden) continue;
      const projected = sphere.center.clone().project(this.camera);
      if (projected.z < -1 || projected.z > 1) { body.label.hidden = true; continue; }
      const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2;
      const w = body.label.offsetWidth, h = body.label.offsetHeight;
      const pixelRadius = sphere.radius / sphere.center.length() / Math.tan(this.camera.fov * Math.PI / 360) * height / 2;
      const gap = Math.max(14, pixelRadius + 6);
      let placed = false;
      for (const [dx, dy] of [[gap, -h / 2], [-gap - w, -h / 2], [10, gap], [-w - 10, -gap - h]]) {
        const box = { left: x + dx, top: y + dy, right: x + dx + w, bottom: y + dy + h };
        if (box.left < 12 || box.right > width - 12 || box.top < 130 || box.bottom > height - 80) continue;
        if (boxes.some(b => box.left < b.right + 6 && box.right > b.left - 6 && box.top < b.bottom + 6 && box.bottom > b.top - 6)) continue;
        boxes.push(box);
        body.label.style.transform = `translate(${box.left}px, ${box.top}px)`;
        placed = true;
        break;
      }
      body.label.hidden = !placed;
    }
    for (const label of this.referenceLabels) {
      const projected = label.direction.clone().multiplyScalar(referenceRadiusKm / KM_PER_RENDER_UNIT).add(this.references.position).project(this.camera);
      const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2;
      label.element.hidden = !this.references.visible || projected.z < -1 || projected.z > 1 || x < 20 || x > width - 150 || y < 140 || y > height - 90
        || boxes.some(b => x < b.right && x + 140 > b.left && y < b.bottom && y + 20 > b.top);
      label.element.style.transform = `translate(${x + 10}px, ${y}px)`;
    }
  }
  private animate = (): void => {
    this.frame = requestAnimationFrame(this.animate);
    this.controller.update();
    this.renderFrame();
  };
  get diagnostics() {
    const state = this.store.state;
    return { mode: 'space' as const, observerId: state.observer, targetId: state.target,
      instant: state.snapshot.utc, snapshot: state.snapshot, timeZone: state.timeZone, scale: state.scale,
      cameraKm: [...this.cameraKm], cameraOffsetKm: subtract(this.cameraKm, state.snapshot.bodies[state.observer].positionKm),
      cameraQuaternion: this.camera.quaternion.toArray(), cameraUp: this.navigationCamera.up.toArray(),
      locked: this.locked, fov: this.camera.fov, near: this.camera.near, far: this.camera.far,
      interacting: this.controller.isInteracting, drawCalls: this.renderer.info.render.calls,
      visibleBodies: BODY_IDS.filter(id => this.bodies.get(id)!.mesh.visible),
      referencesVisible: this.references.visible, referenceLineCount: this.references.children.length,
      bodies: BODY_IDS.map(id => {
        const body = this.bodies.get(id)!;
        const screen = body.mesh.position.clone().project(this.camera);
        return { id, renderRadiusKm: body.renderRadiusKm, physicalRadiusKm: state.snapshot.bodies[id].physicalRadiusKm,
          renderPosition: body.mesh.position.toArray(), visibility: body.visibility,
          screen: [(screen.x + 1) * this.root.clientWidth / 2, (1 - screen.y) * this.root.clientHeight / 2, screen.z],
          measurement: id === state.observer ? null : measure(state.snapshot, state.observer, id) };
      }) };
  }
  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.unsubscribe();
    this.observerResize.disconnect();
    this.controller.dispose();
    this.root.removeEventListener('pointerdown', this.unlockAim, true);
    this.root.removeEventListener('wheel', this.onWheelAim, true);
    this.root.removeEventListener('keydown', this.onKeyAim, true);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    for (const body of this.bodies.values()) { body.mesh.geometry.dispose(); body.mesh.material.dispose(); }
    for (const line of this.references.children) if (line instanceof THREE.Line) { line.geometry.dispose(); (line.material as THREE.Material).dispose(); }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
