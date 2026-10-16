export interface ReferenceInfo {
  name: string;
  english: string;
  system: string;
  coordinates: [string, string][];
}

export const referenceInfo: Record<string, ReferenceInfo> = {
  equator: { name: '天赤道', english: 'Celestial Equator', system: '赤道坐标系 / Equatorial', coordinates: [['赤纬 · Dec', '0°'], ['赤经范围 · RA', '0h ≤ RA < 24h']] },
  horizon: { name: '地平圈', english: 'Horizon', system: '地平坐标系 / Horizontal', coordinates: [['高度角 · Alt', '0°'], ['方位角范围 · Az', '0° ≤ Az < 360°']] },
  ecliptic: { name: '黄道', english: 'Ecliptic', system: '黄道坐标系 / Ecliptic', coordinates: [['黄纬 · β', '0°'], ['黄经范围 · λ', '0° ≤ λ < 360°']] },
  'polar-axis': { name: '地球自转轴', english: 'Earth Rotation Axis', system: '赤道参考架 / Equatorial Frame', coordinates: [['正向赤纬 · Dec', '+90°'], ['负向赤纬 · Dec', '-90°'], ['赤经 · RA', '未定义']] },
  'vertical-axis': { name: '天顶天底轴', english: 'Zenith-Nadir Axis', system: '地平参考架 / Horizontal Frame', coordinates: [['天顶高度 · Alt', '+90°'], ['天底高度 · Alt', '-90°'], ['方位角 · Az', '未定义']] },
  'probe-ray': { name: '探针方向射线', english: 'Probe Direction Ray', system: '日期平赤道参考架 / Mean Equatorial Frame of Date', coordinates: [] },
};
