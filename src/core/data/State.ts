import { validateObserver, type Observer } from '../astronomy/Observer';
import { astronomicalTime } from '../astronomy/Time';
import type { Direction, EquatorialCoordinates } from '../astronomy/CoordinateSystems';
import { places } from './places';

export type ViewMode = 'orbit' | 'observer';
export type Layer = 'equatorial' | 'horizon' | 'ecliptic' | 'grid' | 'horizontalGrid' | 'labels' | 'axes' | 'sun' | 'moon';
export interface State {
  view: ViewMode;
  showBelowHorizon: boolean;
  observer: Observer;
  instant: Date;
  layers: Record<Layer, boolean>;
  selected: string | null;
  probe: EquatorialCoordinates | null;
  lineHit?: { id: string; direction: Direction };
}

function restoredObserver(): Observer {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('phyastro.observer') || 'null');
    if (saved && typeof saved === 'object' && 'name' in saved && typeof saved.name === 'string')
      return validateObserver(saved as Observer);
  } catch { /* Storage may be disabled; the default remains usable. */ }
  return { ...places[0] };
}

export class Store {
  state: State = {
    view: 'orbit', showBelowHorizon: true,
    observer: restoredObserver(), instant: new Date(), selected: null, probe: null,
    layers: { equatorial: true, horizon: true, ecliptic: true, grid: true, horizontalGrid: true, labels: true, axes: true, sun: true, moon: true },
  };
  private listeners = new Set<(state: State) => void>();

  subscribe(listener: (state: State) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(patch: Partial<State>): void {
    if (patch.observer || patch.instant || patch.view) patch.lineHit = undefined;
    if (patch.observer) patch.observer = validateObserver(patch.observer);
    if (patch.instant) astronomicalTime(patch.instant);
    this.state = { ...this.state, ...patch };
    if (patch.observer) {
      try { localStorage.setItem('phyastro.observer', JSON.stringify(patch.observer)); } catch { /* Optional persistence. */ }
    }
    this.listeners.forEach(listener => listener(this.state));
  }
}
