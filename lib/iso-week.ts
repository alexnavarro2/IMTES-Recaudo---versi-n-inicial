export interface IsoWeek { year: number; week: number }
export function isoWeek(date: Date): IsoWeek {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const year = day.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 1));
  return { year, week: Math.ceil(((day.getTime() - first.getTime()) / 86400000 + 1) / 7) };
}
export function lastClosedWeek(now = new Date()): IsoWeek {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Hermosillo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: string) => Number(parts.find(value => value.type === name)!.value);
  const localDay = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  localDay.setUTCDate(localDay.getUTCDate() - (localDay.getUTCDay() || 7));
  return isoWeek(localDay);
}
export function weekLabel(value: IsoWeek) { return `${value.year}-S${String(value.week).padStart(2,'0')}`; }
