import { BODY_IDS, type SystemBodyId } from './Bodies';
import { SNAPSHOTS, TIME_ZONES, type DisplayTimeZone } from './CivilTime';
import { offlineEphemeris, type SystemSnapshot } from './Ephemeris';

export type ScaleMode = 'physical' | 'enhanced';
export interface ObservationState {
  observer: SystemBodyId;
  target: SystemBodyId;
  snapshot: SystemSnapshot;
  timeZone: DisplayTimeZone;
  scale: ScaleMode;
  earthReferences: boolean;
}
export class SystemStore {
  state: ObservationState = { observer: 'earth', target: 'moon', snapshot: offlineEphemeris.snapshot(new Date(SNAPSHOTS[0])),
    timeZone: 'UTC', scale: 'enhanced', earthReferences: true };
  private listeners = new Set<(state: ObservationState, previous: ObservationState) => void>();
  subscribe(listener: (state: ObservationState, previous: ObservationState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  update(patch: Partial<Omit<ObservationState, 'snapshot'>> & { instant?: Date }): void {
    const previous = this.state;
    const { instant, ...settings } = patch;
    const observer = settings.observer ?? previous.observer;
    let target = settings.target ?? previous.target;
    if (!BODY_IDS.includes(observer) || !BODY_IDS.includes(target)) throw new RangeError('Unknown body.');
    if (target === observer) target = BODY_IDS.find(id => id !== observer)!;
    if (settings.timeZone && !TIME_ZONES.includes(settings.timeZone)) throw new RangeError('Unknown display time zone.');
    if (settings.scale && !['physical', 'enhanced'].includes(settings.scale)) throw new RangeError('Unknown scale mode.');
    this.state = { ...previous, ...settings, observer, target,
      snapshot: instant ? offlineEphemeris.snapshot(instant) : previous.snapshot };
    this.listeners.forEach(listener => listener(this.state, previous));
  }
}
