export const TIME_ZONES = ['UTC', 'Asia/Shanghai', 'America/New_York'] as const;
export type DisplayTimeZone = typeof TIME_ZONES[number];
export function civilTime(instant: Date, zone: DisplayTimeZone): string {
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Invalid instant.');
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset' }).format(instant);
}
export const SNAPSHOTS = ['2026-01-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'] as const;
