import { DEG, TAU, combine, equatorialDirection, type Direction } from '../core/astronomy/CoordinateSystems';
import { eclipticDirection } from '../core/astronomy/CoordinateTransform';
import { observerBasis } from '../core/astronomy/Observer';
import { astronomicalTime } from '../core/astronomy/Time';
import type { Layer, State } from '../core/data/State';
import { solarLunarPositions, type BodyPosition } from '../core/astronomy/Ephemeris';
import { referenceInfo, type ReferenceInfo } from './ReferenceInfo';

export const EARTH_RADIUS = 0.78;
export const SPHERE_RADIUS = 2.8;
export interface ReferenceLine extends ReferenceInfo {
  id: string;
  layer: Layer;
  points: Direction[];
  tone: 'grid' | 'horizontal' | 'equatorial' | 'horizon' | 'ecliptic' | 'axis' | 'probe';
  dashed?: boolean;
}
export interface ReferencePoint {
  id: string;
  name: string;
  english: string;
  short: string;
  direction: Direction;
  radius: number;
  layer: Layer;
  priority: number;
  marker?: boolean;
}
export interface SphereModel { lines: ReferenceLine[]; points: ReferencePoint[]; bodies: BodyPosition[] }

function sample(fn: (angle: number) => Direction, end = TAU, start = 0): Direction[] {
  return Array.from({ length: 193 }, (_, i) => fn(start + (end - start) * i / 192));
}

export function celestialSphere(state: State): SphereModel {
  const time = astronomicalTime(state.instant);
  const basis = observerBasis(state.observer, time);
  const lines: ReferenceLine[] = [];
  const points: ReferencePoint[] = [];
  const horizontal = (angle: number) => combine(basis.north, basis.east, Math.cos(angle), Math.sin(angle));
  const addLine = (id: string, layer: Layer, tone: ReferenceLine['tone'], values: Direction[], dashed = false, info = referenceInfo[id]) => {
    if (!info) throw new Error(`Missing reference metadata: ${id}`);
    lines.push({ ...info, id, layer, tone, points: values, dashed });
  };
  const addPoint = (id: string, name: string, english: string, short: string, direction: Direction,
    layer: Layer, priority: number, marker = true, radius = SPHERE_RADIUS) =>
    points.push({ id, name, english, short, direction, layer, priority, marker, radius });

  addLine('equator', 'equatorial', 'equatorial', sample(ra => equatorialDirection({ ra, dec: 0 })));
  addLine('horizon', 'horizon', 'horizon', sample(horizontal));
  addLine('ecliptic', 'ecliptic', 'ecliptic', sample(lon => eclipticDirection(lon, time.obliquity)), true);
  for (const degrees of [-60, -30, 30, 60]) {
    addLine(`dec-${degrees}`, 'grid', 'grid', sample(ra => equatorialDirection({ ra, dec: degrees * DEG })), false,
      { name: '等赤纬圈', english: 'Declination Parallel', system: '赤道坐标系 / Equatorial', coordinates: [['赤纬 · Dec', `${degrees}°`], ['赤经范围 · RA', '0h ≤ RA < 24h']] });
  }
  for (let degrees = 0; degrees < 360; degrees += 30) {
    addLine(`ra-${degrees}`, 'grid', 'grid', sample(angle => [
      Math.cos(angle) * Math.cos(degrees * DEG), Math.cos(angle) * Math.sin(degrees * DEG), Math.sin(angle),
    ], Math.PI / 2, -Math.PI / 2), false,
    { name: '赤经半圈', english: 'Right Ascension Semicircle', system: '赤道坐标系 / Equatorial', coordinates: [['赤经 · RA', `${degrees / 15}h`], ['赤纬范围 · Dec', '-90° ≤ Dec ≤ +90°'], ['天极处赤经', '未定义']] });
  }
  addLine('polar-axis', 'axes', 'axis', [[0, 0, -1.04], [0, 0, 1.04]], true);
  addLine('vertical-axis', 'horizon', 'axis', [
    basis.zenith.map(value => -value) as unknown as Direction, basis.zenith,
  ], true);
  addPoint('ncp', '天北极', 'North Celestial Pole', 'NCP', [0, 0, 1], 'equatorial', 100);
  addPoint('scp', '天南极', 'South Celestial Pole', 'SCP', [0, 0, -1], 'equatorial', 95);
  addPoint('zenith', '天顶', 'Zenith', 'Z', basis.zenith, 'horizon', 99);
  addPoint('nadir', '天底', 'Nadir', "Z′", basis.zenith.map(v => -v) as unknown as Direction, 'horizon', 85);
  for (const [id, name, en, short, angle] of [
    ['north', '北', 'North', 'N', 0], ['east', '东', 'East', 'E', 90],
    ['south', '南', 'South', 'S', 180], ['west', '西', 'West', 'W', 270],
  ] as const) addPoint(id, name, en, short, horizontal(angle * DEG), 'horizon', 70);
  addPoint('nep', '黄北极', 'North Ecliptic Pole', 'NEP', [0, -Math.sin(time.obliquity), Math.cos(time.obliquity)], 'ecliptic', 65);
  addPoint('sep', '黄南极', 'South Ecliptic Pole', 'SEP', [0, Math.sin(time.obliquity), -Math.cos(time.obliquity)], 'ecliptic', 50);
  addPoint('equator', '天赤道', 'Celestial Equator', 'EQ', equatorialDirection({ ra: 210 * DEG, dec: 0 }), 'equatorial', 80, false);
  addPoint('horizon', '地平圈', 'Horizon', 'HZ', horizontal(225 * DEG), 'horizon', 81, false);
  addPoint('ecliptic', '黄道', 'Ecliptic', 'EC', eclipticDirection(35 * DEG, time.obliquity), 'ecliptic', 82, false);
  addPoint('vernal', '春分点', 'Vernal Equinox', '0h', [1, 0, 0], 'equatorial', 40);
  addPoint('observer', '观察者', 'Observer', '', basis.zenith, 'horizon', 110, true, EARTH_RADIUS * 1.02);
  addPoint('earth-north', '地理北极', 'North Geographic Pole', 'NP', [0, 0, 1], 'axes', 30, true, EARTH_RADIUS);
  addPoint('earth-south', '地理南极', 'South Geographic Pole', 'SP', [0, 0, -1], 'axes', 29, true, EARTH_RADIUS);

  if (state.view === 'observer') {
    const direction = (az: number, alt: number) => combine(horizontal(az), basis.zenith, Math.cos(alt), Math.sin(alt));
    for (const altitude of [-75, -60, -45, -30, -15, 15, 30, 45, 60, 75]) {
      addLine(`alt-${altitude}`, 'horizontalGrid', 'horizontal', sample(az => direction(az, altitude * DEG)), false,
        { name: '等高度圈', english: 'Altitude Circle (Almucantar)', system: '地平坐标系 / Horizontal', coordinates: [['高度角 · Alt', `${altitude}°`], ['方位角范围 · Az', '0° ≤ Az < 360°']] });
      addPoint(`alt-label-${altitude}`, `${altitude > 0 ? '+' : ''}${altitude}°`, 'Altitude', 'Alt', direction(340 * DEG, altitude * DEG), 'horizontalGrid', 35, false);
    }
    for (let azimuth = 0; azimuth < 360; azimuth += 30)
      addLine(`az-${azimuth}`, 'horizontalGrid', 'horizontal', sample(alt => direction(azimuth * DEG, alt), Math.PI / 2, -Math.PI / 2), false,
        { name: '等方位半圈', english: 'Azimuth Semicircle', system: '地平坐标系 / Horizontal', coordinates: [['方位角 · Az', `${azimuth}°`], ['高度范围 · Alt', '-90° ≤ Alt ≤ +90°'], ['天顶天底方位角', '未定义']] });
    for (let azimuth = 15; azimuth < 360; azimuth += 15) {
      if (azimuth % 90 === 0) continue;
      addPoint(`az-label-${azimuth}`, `${azimuth}°`, 'Azimuth', 'Az', horizontal(azimuth * DEG), 'horizontalGrid', 25, false);
    }
  }

  if (state.probe) {
    const direction = equatorialDirection(state.probe);
    addPoint('probe', '方向探针', 'Direction Probe', '', direction, 'labels', 120);
    addLine('probe-ray', 'labels', 'probe', [[0, 0, 0], direction], true);
    addLine('probe-declination', 'equatorial', 'probe', sample(dec => equatorialDirection({ ra: state.probe!.ra, dec }), state.probe.dec), false,
      { name: '探针赤纬弧', english: 'Probe Declination Arc', system: '赤道坐标系 / Equatorial', coordinates: [['构造经圈 · RA', `${(state.probe.ra ?? 0) / DEG / 15}h`], ['赤纬弧范围 · Dec', `0° → ${(state.probe.dec / DEG).toFixed(4)}°`]] });
  }
  const bodies = solarLunarPositions(time, state.observer);
  for (const body of bodies) addPoint(body.id, body.name, body.english, body.english,
    equatorialDirection(state.view === 'observer' ? body.topocentric : body.geocentric), body.id, 105, false);
  return { lines, points, bodies };
}
