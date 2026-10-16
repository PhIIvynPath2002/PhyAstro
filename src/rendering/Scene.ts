import * as THREE from 'three';
import { celestialSphere, SPHERE_RADIUS, type ReferenceLine } from '../celestial/CelestialSphere';
import { astronomicalTime } from '../core/astronomy/Time';
import { observerBasis } from '../core/astronomy/Observer';
import { directionToEquatorial, type LocalBasis } from '../core/astronomy/CoordinateSystems';
import { splitAtHorizon } from '../core/astronomy/ObserverView';
import type { State, Store } from '../core/data/State';
import { CameraController } from '../interaction/CameraController';
import { createEarth } from './Earth';
import { Labels } from './Labels';
import { toAstronomyVector, toRenderVector, toObserverVector, fromObserverVector } from './coordinates';
import { createGround } from './Ground';
import { createBody } from './Bodies';

const tones = {
  grid: { color: 0x737e80, opacity: 0.17 },
  horizontal: { color: 0x999999, opacity: 0.35 },
  equatorial: { color: 0xb8c6cb, opacity: 0.65 },
  horizon: { color: 0xd0d2c6, opacity: 0.75 },
  ecliptic: { color: 0xbba476, opacity: 0.7 },
  axis: { color: 0x87938e, opacity: 0.3 },
  probe: { color: 0xdbc394, opacity: 0.9 },
};
const selectable = new Set(['sun', 'moon', 'equator', 'horizon', 'ecliptic', 'ncp', 'scp', 'nep', 'sep', 'zenith', 'nadir', 'north', 'east', 'south', 'west', 'vernal', 'observer', 'probe', 'earth-north', 'earth-south']);

export class CelestialScene {
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
  readonly renderer: THREE.WebGLRenderer;
  readonly controller: CameraController;
  private scene = new THREE.Scene();
  private references = new THREE.Group();
  private earth = createEarth();
  private ground = createGround();
  private observerFrame?: LocalBasis;
  private heading = new THREE.Vector3();
  onHeading?: (az: number, alt: number) => void;
  private labels: Labels;
  private raycaster = new THREE.Raycaster();
  private sphere = new THREE.Sphere(new THREE.Vector3(), SPHERE_RADIUS);
  private resizeObserver: ResizeObserver;
  private unsubscribe: () => void;
  private probeMode = false;
  private inputSurface: HTMLElement;
  private pendingPointer: PointerEvent | null = null;
  private pickables: THREE.Object3D[] = [];
  private hoverId: string | null = null;
  private lastStructure = '';
  private frameRequested = 0;
  private tapTimer = 0;
  private lastTap: { time: number; x: number; y: number; label: string | null } | null = null;
  onProbePlaced?: () => void;

  constructor(private root: HTMLElement, labelRoot: HTMLElement, private store: Store) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x090b0d);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    this.renderer.setSize(root.clientWidth, root.clientHeight);
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', '天球三维视图');
    canvas.setAttribute('role', 'application');
    this.root.append(canvas);
    this.camera.aspect = root.clientWidth / root.clientHeight;
    this.camera.updateProjectionMatrix();
    this.scene.add(this.earth, this.ground, this.references, this.camera);
    this.scene.add(new THREE.AmbientLight(0xdce3df, 1.35));
    const light = new THREE.DirectionalLight(0xf5f2e8, 2.3);
    light.position.set(-3, 5, 4);
    this.camera.add(light);
    this.inputSurface = root.parentElement!;
    this.controller = new CameraController(this.camera, this.inputSurface);
    this.controller.onTap = this.onTap;
    const initialBasis = observerBasis(store.state.observer, astronomicalTime(store.state.instant));
    const viewingDirection = toRenderVector(initialBasis.zenith).multiplyScalar(0.85)
      .add(toRenderVector(initialBasis.east).multiplyScalar(-0.65))
      .add(toRenderVector(initialBasis.north).multiplyScalar(0.18));
    this.controller.setHome(viewingDirection);
    this.labels = new Labels(labelRoot, id => {
      this.setProbeMode(false);
      this.onProbePlaced?.();
      store.update({ selected: id });
    });
    this.raycaster.params.Line = { threshold: 0.035 };
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);
    this.inputSurface.addEventListener('pointermove', this.onPointerMove);
    this.inputSurface.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.root.dispatchEvent(new CustomEvent('render-error', { detail: '图形上下文已中断，请重新加载。' }));
    });
    this.unsubscribe = store.subscribe(state => this.update(state));
    this.update(store.state);
    this.animate();
  }

  private update(state: State): void {
    const structure = JSON.stringify([state.observer, state.instant, state.layers, state.probe, state.view, state.showBelowHorizon]);
    if (structure === this.lastStructure) return;
    clearTimeout(this.tapTimer);
    this.lastTap = null;
    this.lastStructure = structure;
    const ground = state.view === 'observer';
    this.controller.setView(state.view);
    this.earth.visible = !ground;
    this.ground.visible = ground;
    this.renderer.setClearColor(ground ? 0x090909 : 0x090b0d);
    this.renderer.domElement.setAttribute('aria-label', ground ? '地面观察者三维视图' : '天球三维视图');
    this.observerFrame = ground ? observerBasis(state.observer, astronomicalTime(state.instant)) : undefined;
    this.earth.rotation.y = astronomicalTime(state.instant).gmst;
    this.disposeReferences();
    const model = celestialSphere(state);
    for (const body of model.bodies) if (state.layers[body.id]) this.references.add(...createBody(body, this.observerFrame, state.showBelowHorizon));
    for (const reference of model.lines) {
      if (reference.layer !== 'labels' && !state.layers[reference.layer] || reference.layer === 'grid' && !state.layers.equatorial) continue;
      if (this.observerFrame) {
        if (['polar-axis', 'vertical-axis', 'probe-ray'].includes(reference.id)) continue;
        for (const segment of splitAtHorizon(reference.points, this.observerFrame)) {
          if (segment.below && !state.showBelowHorizon) continue;
          this.references.add(this.createLine({ ...reference, points: segment.points }, segment.below));
        }
      } else this.references.add(this.createLine(reference));
    }
    const points = model.points.filter(point => !this.observerFrame || point.radius >= SPHERE_RADIUS &&
      (state.showBelowHorizon || toObserverVector(point.direction, this.observerFrame).y >= -1e-10));
    for (const point of points) {
      if (!point.marker || point.layer !== 'labels' && !state.layers[point.layer]) continue;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(point.id === 'observer' ? 0.022 : 0.017, 12, 8),
        new THREE.MeshBasicMaterial({ color: ground ? 0xcccccc : point.layer === 'ecliptic' || point.id === 'probe' || point.id === 'observer' ? 0xc8b183 : 0xbfc7c6 }),
      );
      dot.position.copy((this.observerFrame ? toObserverVector(point.direction, this.observerFrame) : toRenderVector(point.direction)).multiplyScalar(point.radius));
      if (ground && dot.position.y < -1e-10) { dot.material.transparent = true; dot.material.opacity = 0.35; }
      dot.userData.id = point.id;
      this.references.add(dot);
    }
    this.labels.set(points, this.observerFrame);
    this.pickables = [...(ground ? [] : [this.earth]), ...this.references.children.filter(object => object instanceof THREE.Line || selectable.has(object.userData.id))];
  }

  private createLine(reference: ReferenceLine, below = false): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints(reference.points.map(point =>
      (this.observerFrame ? toObserverVector(point, this.observerFrame) : toRenderVector(point)).multiplyScalar(SPHERE_RADIUS)));
    const color = this.observerFrame ? 0xdddddd : tones[reference.tone].color;
    const opacity = this.observerFrame && below ? (reference.tone === 'grid' || reference.tone === 'horizontal' ? 0.13 : 0.25) : tones[reference.tone].opacity;
    const material = reference.dashed || below
      ? new THREE.LineDashedMaterial({ color, opacity, transparent: true, dashSize: 0.055, gapSize: 0.045, depthWrite: false })
      : new THREE.LineBasicMaterial({ color, opacity, transparent: true, depthWrite: false });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    line.userData.id = reference.id;
    line.userData.baseOpacity = opacity;
    line.userData.below = below;
    return line;
  }

  private disposeReferences(): void {
    for (const object of this.references.children) {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    }
    this.references.clear();
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.root;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.controller.resize();
    this.labels.invalidateMeasurements();
  }

  setProbeMode(enabled: boolean): void {
    clearTimeout(this.tapTimer);
    this.lastTap = null;
    this.probeMode = enabled;
    this.renderer.domElement.classList.toggle('probe-mode', enabled);
  }

  private cast(event: PointerEvent): void {
    const box = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1), this.camera);
  }

  private intersections(): THREE.Intersection[] {
    return this.raycaster.intersectObjects(this.pickables, false).filter(hit => {
      if (!this.observerFrame || !['sun', 'moon'].includes(hit.object.userData.id)) return true;
      return hit.object.userData.below ? hit.point.y < 0 : hit.point.y >= 0;
    });
  }

  private pick(): string | null {
    const intersections = this.intersections();
    for (const hit of intersections) {
      if (hit.object === this.earth) return null;
      const id = hit.object.userData.id;
      if (selectable.has(id)) return id;
    }
    return null;
  }

  private onTap = (event: PointerEvent, target: EventTarget | null) => {
    this.cast(event);
    if (this.probeMode) {
      const point = this.raycaster.ray.intersectSphere(this.sphere, new THREE.Vector3());
      if (!point) return;
      if (this.observerFrame && !this.store.state.showBelowHorizon && point.y < -1e-10) return;
      this.store.update({ probe: directionToEquatorial(this.observerFrame ? fromObserverVector(point, this.observerFrame) : toAstronomyVector(point)), selected: 'probe' });
      this.setProbeMode(false);
      this.onProbePlaced?.();
    } else {
      const label = target instanceof Element ? target.closest<HTMLElement>('.space-label') : null;
      const id = label?.dataset.object ?? null;
      const now = performance.now();
      const previous = this.lastTap;
      clearTimeout(this.tapTimer);
      if (previous && now - previous.time < 350 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 8 && previous.label === id) {
        this.lastTap = null;
        if (id) this.labels.showTerm(id);
        else {
          const intersections = this.intersections();
          const blocker = intersections.find(hit => hit.object === this.earth);
          const candidates = intersections.filter(hit => (!blocker || hit.distance < blocker.distance) && hit.object instanceof THREE.Line);
          // On a direction sphere depth differences are tessellation artifacts; pick the closest stroke to the ray.
          candidates.sort((a, b) => this.raycaster.ray.distanceSqToPoint(a.point) - this.raycaster.ray.distanceSqToPoint(b.point));
          const hit = candidates[0] ?? intersections.find(hit => hit.object === this.earth || ['sun', 'moon'].includes(hit.object.userData.id));
          if (hit?.object instanceof THREE.Line) {
            const direction = this.observerFrame ? fromObserverVector(hit.point, this.observerFrame) : toAstronomyVector(hit.point);
            this.store.update({ selected: `line:${hit.object.userData.id}`, lineHit: { id: hit.object.userData.id, direction } });
          } else if (hit && hit.object !== this.earth) this.store.update({ selected: hit.object.userData.id });
        }
      } else {
        this.lastTap = { time: now, x: event.clientX, y: event.clientY, label: id };
        const selected = id ?? this.pick();
        this.tapTimer = window.setTimeout(() => {
          this.lastTap = null;
          this.store.update({ selected });
        }, 350);
      }
    }
  };
  private onPointerMove = (event: PointerEvent) => {
    if (event.buttons || this.probeMode || this.controller.isInteracting) return;
    this.pendingPointer = event;
  };
  private onPointerLeave = (): void => { this.pendingPointer = null; this.hoverId = null; };

  private animate = (): void => {
    this.frameRequested = requestAnimationFrame(this.animate);
    this.controller.update();
    if (this.observerFrame) {
      this.camera.getWorldDirection(this.heading);
      this.onHeading?.((Math.atan2(this.heading.x, -this.heading.z) * 180 / Math.PI + 360) % 360, Math.asin(THREE.MathUtils.clamp(this.heading.y, -1, 1)) * 180 / Math.PI);
    }
    if (this.controller.isInteracting) {
      this.pendingPointer = null;
      this.hoverId = null;
    } else if (this.pendingPointer) {
      this.cast(this.pendingPointer);
      this.hoverId = this.pick();
      this.pendingPointer = null;
    }
    const selected = this.store.state.selected;
    for (const object of this.references.children) {
      if (object instanceof THREE.Line) {
        const material = object.material as THREE.LineBasicMaterial;
        material.opacity = object.userData.id === selected || `line:${object.userData.id}` === selected || object.userData.id === this.hoverId ? object.userData.below ? 0.4 : 1 : object.userData.baseOpacity;
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.labels.update(this.camera, this.root.clientWidth, this.root.clientHeight, this.store.state);
  };

  get referenceDiagnostics() {
    return this.references.children.map(object => {
      const mesh = object as THREE.Mesh;
      const position = mesh.geometry.getAttribute('position');
      const index = Math.floor(position.count * 0.31);
      const world = object instanceof THREE.Line ? new THREE.Vector3().fromBufferAttribute(position, index) : object.position.clone();
      const projected = world.project(this.camera);
      return { id: object.userData.id as string, line: object instanceof THREE.Line, below: !!object.userData.below,
        x: (projected.x + 1) / 2 * this.root.clientWidth, y: (1 - projected.y) / 2 * this.root.clientHeight, z: projected.z,
        position: object.position.toArray(), radius: mesh.geometry instanceof THREE.SphereGeometry ? mesh.geometry.parameters.radius : null };
    });
  }

  dispose(): void {
    clearTimeout(this.tapTimer);
    cancelAnimationFrame(this.frameRequested);
    this.unsubscribe();
    this.resizeObserver.disconnect();
    this.controller.dispose();
    this.disposeReferences();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.earth.geometry.dispose();
    const material = this.earth.material as THREE.MeshStandardMaterial;
    material.map?.dispose();
    material.dispose();
    this.renderer.dispose();
    this.inputSurface.removeEventListener('pointermove', this.onPointerMove);
    this.inputSurface.removeEventListener('pointerleave', this.onPointerLeave);
  }
}
