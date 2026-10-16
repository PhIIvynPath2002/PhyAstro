import * as THREE from 'three';
import { EARTH_RADIUS, type ReferencePoint } from '../celestial/CelestialSphere';
import type { State } from '../core/data/State';
import { toRenderVector, toObserverVector } from './coordinates';
import type { LocalBasis } from '../core/astronomy/CoordinateSystems';
import { showTerm, hideTerm } from '../ui/Terminology';

interface Label { reference: ReferencePoint; element: HTMLButtonElement; position: THREE.Vector3; width: number; height: number }
interface Box { left: number; top: number; right: number; bottom: number }
const intersects = (a: Box, b: Box) => a.left < b.right + 7 && a.right > b.left - 7 && a.top < b.bottom + 5 && a.bottom > b.top - 5;

export class Labels {
  private labels: Label[] = [];
  private earth = new THREE.Sphere(new THREE.Vector3(), EARTH_RADIUS * 0.99);
  private needsMeasurement = true;
  private needsLayout = true;
  private lastView = new THREE.Matrix4();
  private lastProjection = new THREE.Matrix4();
  private lastPanel: HTMLElement | null = null;
  private lastPanelBounds = '';
  private lastSelected: string | null = null;
  private lastLayers: State['layers'] | null = null;
  private ray = new THREE.Ray();
  private hit = new THREE.Vector3();
  private projected = new THREE.Vector3();
  private direction = new THREE.Vector3();

  constructor(private root: HTMLElement, private onSelect: (id: string) => void) {
    document.fonts.ready.then(() => this.invalidateMeasurements());
  }

  invalidateMeasurements(): void {
    this.needsMeasurement = true;
    this.needsLayout = true;
  }

  set(points: ReferencePoint[], basis?: LocalBasis): void {
    hideTerm();
    this.root.replaceChildren();
    this.labels = [...points].sort((a, b) => b.priority - a.priority).map(reference => {
      const element = document.createElement('button');
      element.className = `space-label ${reference.layer === 'ecliptic' ? 'warm' : ''}`;
      element.dataset.object = reference.id;
      element.dataset.termCn = reference.name;
      element.dataset.termEn = reference.english;
      element.setAttribute('aria-label', reference.name);
      const name = document.createElement('span');
      name.className = 'label-name';
      name.textContent = reference.name;
      const abbreviation = document.createElement('span');
      abbreviation.className = 'label-sub';
      abbreviation.textContent = reference.short || reference.english;
      element.append(name, abbreviation);
      // Pointer taps are routed by the shared gesture surface; preserve keyboard activation.
      element.addEventListener('click', event => { if (event.detail === 0) this.onSelect(reference.id); });
      this.root.append(element);
      const position = (basis ? toObserverVector(reference.direction, basis) : toRenderVector(reference.direction)).multiplyScalar(reference.radius);
      element.dataset.region = basis && position.y < -1e-10 ? 'below' : 'above';
      return { reference, element, position, width: 0, height: 0 };
    });
    this.invalidateMeasurements();
  }

  showTerm(id: string): void {
    const label = this.labels.find(label => label.reference.id === id);
    if (label) showTerm(label.element, label.reference);
  }

  update(camera: THREE.PerspectiveCamera, width: number, height: number, state: State): void {
    const panel = document.querySelector<HTMLElement>('.tool-panel:not([hidden])');
    const panelBox = panel?.getBoundingClientRect();
    const toastBox = document.querySelector<HTMLElement>('.toast:not([hidden])')?.getBoundingClientRect();
    const panelBounds = [panelBox, toastBox].map(box => box ? `${box.x},${box.y},${box.width},${box.height}` : '').join(';');
    if (!this.needsLayout && this.lastView.equals(camera.matrixWorld) && this.lastProjection.equals(camera.projectionMatrix)
      && panel === this.lastPanel && panelBounds === this.lastPanelBounds && state.selected === this.lastSelected && state.layers === this.lastLayers) return;
    this.lastView.copy(camera.matrixWorld);
    this.lastProjection.copy(camera.projectionMatrix);
    this.lastPanel = panel;
    this.lastPanelBounds = panelBounds;
    this.lastSelected = state.selected;
    this.lastLayers = state.layers;
    this.needsLayout = false;
    // Batch every layout read before writes, and only remeasure when content/viewport changes.
    if (this.needsMeasurement) {
      for (const label of this.labels) {
        label.width = label.element.offsetWidth;
        label.height = label.element.offsetHeight;
      }
      this.needsMeasurement = false;
    }
    const occupied: Box[] = panelBox ? [panelBox] : [];
    if (toastBox) occupied.push(toastBox);
    document.querySelectorAll<HTMLElement>('.view-switch, .heading-readout:not([hidden]), .camera-tools').forEach(element => occupied.push(element.getBoundingClientRect()));
    const ordered = [...this.labels].sort((a, b) => Number(b.reference.id === state.selected) - Number(a.reference.id === state.selected));
    for (const { reference, element, position, width: w, height: h } of ordered) {
      const visible = state.layers.labels && state.layers[reference.layer];
      element.style.visibility = 'hidden';
      if (!visible) continue;
      const projected = this.projected.copy(position).project(camera);
      if (projected.z > 1 || projected.z < -1) continue;
      this.direction.copy(position).sub(camera.position).normalize();
      this.ray.set(camera.position, this.direction);
      if (state.view !== 'observer' && this.ray.intersectSphere(this.earth, this.hit) && this.hit.distanceTo(camera.position) < position.distanceTo(camera.position) - 0.02) continue;
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      const placements = [[12, -h / 2], [-w - 12, -h / 2], [10, 12], [-w - 10, -h - 12]];
      for (const [dx, dy] of placements) {
        const box = { left: x + dx, top: y + dy, right: x + dx + w, bottom: y + dy + h };
        if (box.left < 16 || box.right > width - 16 || box.top < 82 || box.bottom > height - 87 || occupied.some(other => intersects(box, other))) continue;
        occupied.push(box);
        element.style.transform = `translate(${box.left}px, ${box.top}px)`;
        element.style.visibility = 'visible';
        const front = state.view === 'observer' ? position.y >= -1e-10 : position.dot(camera.position) > 0;
        element.style.opacity = reference.id === state.selected && front ? '1' : front ? '0.9' : '0.42';
        element.classList.toggle('selected', reference.id === state.selected);
        break;
      }
    }
  }
}
