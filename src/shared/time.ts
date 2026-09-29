/**
 * Tempo in Europe/Zurich. Gli istanti sono sempre ISO con offset; i calcoli
 * passano per millisecondi epoch. L'ora legale è gestita da Luxon (Intl).
 */
import { DateTime, Duration } from 'luxon';
import { TZ } from './types.ts';

export { TZ };

// Il calcolo dell'offset di un fuso IANA in Luxon passa da Intl ed è costoso: il pianificatore
// chiede migliaia di volte gli stessi istanti locali. I DateTime sono immutabili, quindi
// la cache restituisce sempre lo stesso risultato della costruzione diretta.
const instantCache = new Map<string, DateTime>();

/** Costruisce un istante dalla data e ora locali di Zurigo. Orari inesistenti (salto DST) scivolano in avanti. */
export function localToInstant(date: string, hhmm: string, addDays = 0): DateTime {
  const key = `${date}|${hhmm}|${addDays}`;
  const hit = instantCache.get(key);
  if (hit) return hit;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const dt = DateTime.fromObject({ year: y, month: m, day: d, hour: hh, minute: mm }, { zone: TZ }).plus({ days: addDays });
  if (instantCache.size > 50_000) instantCache.clear();
  instantCache.set(key, dt);
  return dt;
}

// In Europa il cambio d'ora avviene sempre allo scoccare di un'ora UTC (01:00 UTC):
// l'offset di Zurigo è quindi costante all'interno di ogni ora UTC e si può memorizzare per ora.
const offsetCache = new Map<number, number>();
/** Offset di Europe/Zurich (minuti) all'istante `t` (ms epoch). */
export function zurichOffsetMin(t: number): number {
  const h = Math.floor(t / 3_600_000);
  let o = offsetCache.get(h);
  if (o === undefined) {
    o = DateTime.fromMillis(h * 3_600_000, { zone: TZ }).offset;
    if (offsetCache.size > 100_000) offsetCache.clear();
    offsetCache.set(h, o);
  }
  return o;
}
/** Data locale di Zurigo (AAAA-MM-GG) dell'istante `t` (ms epoch). */
export function localDateOfMs(t: number): string {
  return new Date(t + zurichOffsetMin(t) * 60_000).toISOString().slice(0, 10);
}
/** Minuti trascorsi dalla mezzanotte locale di Zurigo all'istante `t` (ms epoch). */
export function localMinuteOfDay(t: number): number {
  const m = Math.floor((t + zurichOffsetMin(t) * 60_000) / 60_000);
  return ((m % 1440) + 1440) % 1440;
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
// Date di calendario (AAAA-MM-GG): aritmetica pura in UTC, indipendente dal fuso e dall'ora legale.
function ymdToUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
/** Giorno della settimana ISO (1 = lunedì … 7 = domenica) di una data di calendario. */
export function isoWeekday(date: string): number {
  return ((new Date(ymdToUtc(date)).getUTCDay() + 6) % 7) + 1;
}
export function addDaysToDate(date: string, n: number): string {
  return new Date(ymdToUtc(date) + n * 86_400_000).toISOString().slice(0, 10);
}
export function todayZurich(): string {
  return DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd');
}
export function formatDateIt(date: string, locale = 'it'): string {
  return DateTime.fromISO(date, { zone: TZ }).setLocale(locale).toFormat('cccc d LLLL yyyy');
}
export function offsetLabel(iso: string): string {
  return parseISO(iso).toFormat('ZZ');
}
export { DateTime, Duration };
