/**
 * Tempo in Europe/Zurich. Gli istanti sono sempre ISO con offset; i calcoli
 * passano per millisecondi epoch. L'ora legale è gestita da Luxon (Intl).
 */
import { DateTime, Duration } from 'luxon';
import { TZ } from './types.ts';

export { TZ };

/** Costruisce un istante dalla data e ora locali di Zurigo. Orari inesistenti (salto DST) scivolano in avanti. */
export function localToInstant(date: string, hhmm: string, addDays = 0): DateTime {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return DateTime.fromObject({ year: y, month: m, day: d, hour: hh, minute: mm }, { zone: TZ }).plus({ days: addDays });
}

export function parseISO(iso: string): DateTime {
  return DateTime.fromISO(iso, { setZone: false }).setZone(TZ);
}
export function toISO(dt: DateTime): string {
  return dt.setZone(TZ).toISO({ suppressMilliseconds: true })!;
}
export function ms(iso: string): number {
  return DateTime.fromISO(iso).toMillis();
}
export function fromMs(t: number): DateTime {
  return DateTime.fromMillis(t, { zone: TZ });
}
export function isoFromMs(t: number): string {
  return toISO(fromMs(t));
}
export function hhmm(iso: string | number): string {
  const dt = typeof iso === 'number' ? fromMs(iso) : parseISO(iso);
  return dt.toFormat('HH:mm');
}
export function localDate(iso: string | number): string {
  const dt = typeof iso === 'number' ? fromMs(iso) : parseISO(iso);
  return dt.toFormat('yyyy-MM-dd');
}
export function minutesBetween(a: string | number, b: string | number): number {
  const ta = typeof a === 'number' ? a : ms(a);
  const tb = typeof b === 'number' ? b : ms(b);
  return (tb - ta) / 60000;
}
export function addMinutes(iso: string, minutes: number): string {
  return isoFromMs(ms(iso) + minutes * 60000);
}
export function fmtDuration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
/** Finestra richiesta: se l'ora di fine è <= inizio, la fine cade il giorno successivo. */
export function requestWindow(date: string, start: string, end: string): { start: DateTime; end: DateTime; crossesMidnight: boolean } {
  const s = localToInstant(date, start);
  let e = localToInstant(date, end);
  let crosses = false;
  if (e <= s) { e = localToInstant(date, end, 1); crosses = true; }
  return { start: s, end: e, crossesMidnight: crosses };
}
export function isoWeekday(date: string): number {
  return DateTime.fromISO(date, { zone: TZ }).weekday;
}
export function addDaysToDate(date: string, n: number): string {
  return DateTime.fromISO(date, { zone: TZ }).plus({ days: n }).toFormat('yyyy-MM-dd');
}
export function todayZurich(): string {
  return DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd');
}
export function formatDateIt(date: string): string {
  return DateTime.fromISO(date, { zone: TZ }).setLocale('it').toFormat('cccc d LLLL yyyy');
}
export function offsetLabel(iso: string): string {
  return parseISO(iso).toFormat('ZZ');
}
export { DateTime, Duration };
