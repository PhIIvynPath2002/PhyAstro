import { celestialSphere } from '../celestial/CelestialSphere';
import { DEG, directionToEquatorial } from '../core/astronomy/CoordinateSystems';
import { equatorialToHorizontal } from '../core/astronomy/CoordinateTransform';
import { astronomicalTime, localSiderealTime } from '../core/astronomy/Time';
import type { State } from '../core/data/State';
import { degrees, hours, latitude, longitude } from './format';
import { equatorialToEcliptic } from '../core/astronomy/CoordinateTransform';
import { solarLunarPositions } from '../core/astronomy/Ephemeris';

export interface InspectorData { name: string; english: string; rows: [string, string][]; note?: string }

export function inspect(state: State): InspectorData | null {
  if (state.selected === 'sun' || state.selected === 'moon') {
    const body = solarLunarPositions(astronomicalTime(state.instant), state.observer).find(body => body.id === state.selected)!;
    return { name: body.name, english: body.english, rows: [
      ['地心赤经 · RA', hours(body.geocentric.ra)], ['地心赤纬 · Dec', degrees(body.geocentric.dec, true)],
      ['站心赤经 · RA', hours(body.topocentric.ra)], ['站心赤纬 · Dec', degrees(body.topocentric.dec, true)],
      ['站心方位 · Az', degrees(body.horizontal.az)], ['站心高度 · Alt', degrees(body.horizontal.alt, true)],
      ['地心距离', `${Math.round(body.distanceKm).toLocaleString('en-US')} km`],
      ['站心距离', `${Math.round(body.topocentricDistanceKm).toLocaleString('en-US')} km`],
      ['物理半径', `${body.radiusKm.toLocaleString('en-US')} km`],
      ['地心角直径', `${(body.angularDiameter / DEG * 60).toFixed(2)} arcmin`],
      ['站心角直径', `${(body.topocentricAngularDiameter / DEG * 60).toFixed(2)} arcmin`],
      ['位置时刻 · UTC', state.instant.toISOString().replace('T', ' ').replace('.000Z', ' UTC')],
      ['绘图方向', state.view === 'observer' ? '站心 / Topocentric' : '地心 / Geocentric'],
    ], note: '日期平赤道几何坐标；地面已计球形地球视差。按角直径投影到天球，非地月日统一距离比例。无折射、章动、光行差、光行时、月相及光影；非导航级星历。' };
  }
  if (state.selected?.startsWith('line:')) {
    const line = celestialSphere(state).lines.find(line => `line:${line.id}` === state.selected);
    if (!line) return null;
    const time = astronomicalTime(state.instant);
    const rows: [string, string][] = [['归属', line.system], ...line.coordinates];
    if (line.id === 'ecliptic') rows.push(['黄赤交角 · ε', degrees(time.obliquity)]);
    if (state.lineHit?.id === line.id && Math.hypot(...state.lineHit.direction) > 1e-10) {
      const eq = directionToEquatorial(state.lineHit.direction);
      const hz = equatorialToHorizontal(eq, state.observer, time);
      const ec = equatorialToEcliptic(eq, time.obliquity);
      rows.push(['拾取赤经 · RA', hours(eq.ra)], ['拾取赤纬 · Dec', degrees(eq.dec, true)], ['拾取方位 · Az', degrees(hz.az)], ['拾取高度 · Alt', degrees(hz.alt, true)], ['拾取黄经 · λ', degrees(Math.abs(Math.cos(ec.lat)) < 1e-7 ? null : ec.lon)], ['拾取黄纬 · β', degrees(ec.lat, true)]);
    }
    rows.push(['参考时刻 · UTC', state.instant.toISOString().replace('T', ' ').replace('.000Z', ' UTC')]);
    return { name: line.name, english: line.english, rows, note: '日期平参考架；方位角北起向东。拾取方向来自绘制线段的插值，圈线定义以上方固定坐标为准。角度单位 °，赤经单位 h / m / s；天极赤经、天顶天底方位角未定义。' };
  }
  const point = celestialSphere(state).points.find(item => item.id === state.selected);
  if (!point) return null;
  const time = astronomicalTime(state.instant);
  const equatorial = directionToEquatorial(point.direction);
  const horizontal = equatorialToHorizontal(equatorial, state.observer, time);
  const data: InspectorData = { name: point.name, english: point.english, rows: [] };
  if (point.id === 'equator') data.rows = [['赤纬 · Dec', '0.00°']];
  else if (point.id === 'horizon') data.rows = [['高度 · Alt', '0.00°']];
  else if (point.id === 'ecliptic') data.rows = [['黄纬 · β', '0.00°'], ['黄赤交角 · ε', degrees(time.obliquity)]];
  else if (point.id === 'observer') {
    data.rows = [['纬度 · Lat', latitude(state.observer.latitude)], ['经度 · Lon', longitude(state.observer.longitude)], ['地方恒星时', hours(localSiderealTime(time, state.observer.longitude))]];
  } else if (point.id.startsWith('earth-')) {
    data.rows = [['纬度 · Lat', point.id === 'earth-north' ? '+90.00°' : '-90.00°']];
  } else {
    data.rows = [['赤经 · RA', hours(equatorial.ra)], ['赤纬 · Dec', degrees(equatorial.dec, true)], ['方位 · Az', degrees(horizontal.az)], ['高度 · Alt', degrees(horizontal.alt, true)]];
    if (state.view === 'observer') data.rows.push(['几何地平', Math.abs(horizontal.alt) < 1e-10 ? '地平线上' : horizontal.alt > 0 ? '地平线以上' : '地平线以下']);
  }
  if (Math.abs(state.observer.latitude) === 90) data.note = '地理极点：水平方向以所选经线为约定。';
  if (point.id === 'nep' || point.id === 'sep') data.rows.unshift(['黄纬 · β', degrees((point.id === 'nep' ? 90 : -90) * DEG, true)]);
  return data;
}
