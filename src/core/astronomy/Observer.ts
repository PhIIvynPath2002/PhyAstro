import { DEG, type LocalBasis } from './CoordinateSystems';
import { localSiderealTime, type AstronomicalTime } from './Time';

export interface Observer {
  name: string;
  latitude: number;
  longitude: number;
}

export function validateObserver(observer: Observer): Observer {
  if (!Number.isFinite(observer.latitude) || Math.abs(observer.latitude) > 90)
    throw new RangeError('纬度须在 -90° 至 +90° 之间');
  if (!Number.isFinite(observer.longitude) || Math.abs(observer.longitude) > 180)
    throw new RangeError('经度须在 -180° 至 +180° 之间');
  return { ...observer, name: observer.name.trim().slice(0, 60) || '自定义地点' };
}

export function observerBasis(observer: Observer, time: AstronomicalTime): LocalBasis {
  const phi = observer.latitude * DEG;
  const theta = localSiderealTime(time, observer.longitude);
  const [s, c, sp, cp] = [Math.sin(theta), Math.cos(theta), Math.sin(phi), Math.cos(phi)];
  // At the geographic poles, east/north follow the selected reference meridian.
  return { east: [-s, c, 0], north: [-sp * c, -sp * s, cp], zenith: [cp * c, cp * s, sp] };
}
