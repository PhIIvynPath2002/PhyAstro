import { DEG, HOUR, normalize } from '../core/astronomy/CoordinateSystems';

export const degrees = (value: number | null, signed = false): string => value === null || !Number.isFinite(value)
  ? '未定义' : `${signed && value >= 0 ? '+' : ''}${(value / DEG).toFixed(2)}°`;

export function hours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '未定义';
  const total = Math.round(normalize(value) / HOUR * 3600) % 86400;
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}h ${String(Math.floor(total % 3600 / 60)).padStart(2, '0')}m ${String(total % 60).padStart(2, '0')}s`;
}

export const latitude = (value: number) => `${Math.abs(value).toFixed(4)}° ${value < 0 ? 'S' : 'N'}`;
export const longitude = (value: number) => `${Math.abs(value).toFixed(4)}° ${value < 0 ? 'W' : 'E'}`;
export const utcLabel = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ');
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));
