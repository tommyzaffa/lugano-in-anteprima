/**
 * Calendario: aperture settimanali, stagionalità, festività ticinesi, eccezioni,
 * ultimo ingresso, intervalli oltre mezzanotte, ricorrenze di eventi con
 * validità e occorrenze annullate. Tutto in Europe/Zurich preservando gli istanti.
 */
import { DateTime } from 'luxon';
import type { OpeningSchedule, OpeningRule, CatalogEvent, EventOccurrence } from './types.ts';
import { TZ, localToInstant, toISO, addDaysToDate, isoWeekday } from './time.ts';

// ------------------------------------------------------------- festività (Canton Ticino)
function easterSunday(year: number): string {
  // Algoritmo di Meeus/Jones/Butcher (calendario gregoriano)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const holidayCache = new Map<number, Map<string, string>>();
/** Giorni festivi ufficiali nel Canton Ticino (fonte: legge cantonale sui giorni festivi; da verificare annualmente). */
export function ticinoHolidays(year: number): Map<string, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const plus = (n: number) => addDaysToDate(easter, n);
  const m = new Map<string, string>([
    [`${year}-01-01`, 'Capodanno'],
    [`${year}-01-06`, 'Epifania'],
    [`${year}-03-19`, 'San Giuseppe'],
    [plus(1), 'Lunedì di Pasqua'],
    [`${year}-05-01`, 'Festa del lavoro'],
    [plus(39), 'Ascensione'],
    [plus(50), 'Lunedì di Pentecoste'],
    [plus(60), 'Corpus Domini'],
    [`${year}-06-29`, 'SS. Pietro e Paolo'],
    [`${year}-08-01`, 'Festa nazionale'],
    [`${year}-08-15`, 'Assunzione'],
    [`${year}-11-01`, 'Ognissanti'],
    [`${year}-12-08`, 'Immacolata'],
    [`${year}-12-25`, 'Natale'],
    [`${year}-12-26`, 'Santo Stefano'],
  ]);
  holidayCache.set(year, m);
  return m;
}
export function holidayName(date: string): string | null {
  return ticinoHolidays(Number(date.slice(0, 4))).get(date) ?? null;
}

// ------------------------------------------------------------- intervalli
export interface OpenInterval {
  start: DateTime;
  end: DateTime;
  lastEntry: DateTime | null;
  /** data locale di apertura (l'intervallo può terminare il giorno dopo) */
  date: string;
  source: 'rule' | 'exception' | 'always';
  note?: string;
}

function mmdd(date: string): string { return date.slice(5); }
function inSeason(date: string, from?: string, to?: string): boolean {
  if (!from || !to) return true;
  const d = mmdd(date);
  return from <= to ? d >= from && d <= to : d >= from || d <= to; // stagione a cavallo d'anno
}
function inValidity(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}
function mkInterval(date: string, from: string, to: string, lastEntry: string | undefined, source: OpenInterval['source'], note?: string): OpenInterval {
  const start = localToInstant(date, from);
  const overnight = to <= from;
  const end = localToInstant(date, to, overnight ? 1 : 0);
  let le: DateTime | null = null;
  if (lastEntry) {
    // l'ultimo ingresso appartiene allo stesso intervallo: se è "prima" dell'apertura è il giorno dopo
    le = localToInstant(date, lastEntry, overnight && lastEntry < from ? 1 : 0);
  }
  return { start, end, lastEntry: le, date, source, note };
}

/** Regole che si applicano in una certa data locale (festività comprese). */
function rulesForDate(s: OpeningSchedule, date: string): OpeningRule[] {
  const hol = holidayName(date);
  let weekday = isoWeekday(date);
  if (hol) {
    if (s.holidays === 'closed') return [];
    if (s.holidays === 'as_sunday') weekday = 7;
  }
  return s.rules.filter((r) => r.days.includes(weekday) && inSeason(date, r.seasonFrom, r.seasonTo) && inValidity(date, r.validFrom, r.validTo));
}

export function intervalsForDate(s: OpeningSchedule, date: string): OpenInterval[] {
  if (s.alwaysOpen) {
    return [{ start: localToInstant(date, '00:00'), end: localToInstant(date, '00:00', 1), lastEntry: null, date, source: 'always' }];
  }
  const ex = s.exceptions.find((e) => e.date === date);
  if (ex) {
    if (ex.closed) return [];
    if (ex.intervals) return ex.intervals.map((i) => mkInterval(date, i.from, i.to, i.lastEntry, 'exception', ex.note));
  }
  return rulesForDate(s, date).map((r) => mkInterval(date, r.from, r.to, r.lastEntry, 'rule'));
}

/** Tutti gli intervalli che toccano [from, to]; include quelli iniziati il giorno prima (oltre mezzanotte). */
export function openIntervals(s: OpeningSchedule, from: DateTime, to: DateTime): OpenInterval[] {
  const out: OpenInterval[] = [];
  let d = from.setZone(TZ).minus({ days: 1 }).toFormat('yyyy-MM-dd');
  const last = to.setZone(TZ).toFormat('yyyy-MM-dd');
  for (let guard = 0; d <= last && guard < 400; guard++) {
    for (const iv of intervalsForDate(s, d)) if (iv.end > from && iv.start < to) out.push(iv);
    d = addDaysToDate(d, 1);
  }
  // unisce intervalli contigui (es. 24/7 su più giorni)
  out.sort((a, b) => a.start.toMillis() - b.start.toMillis());
  const merged: OpenInterval[] = [];
  for (const iv of out) {
    const prev = merged[merged.length - 1];
    if (prev && iv.start.toMillis() <= prev.end.toMillis() && prev.source === 'always' && iv.source === 'always') {
      if (iv.end > prev.end) prev.end = iv.end;
    } else merged.push({ ...iv });
  }
  return merged;
}

export interface VisitCheck {
  ok: boolean;
  status: 'ok' | 'closed' | 'last_entry_passed' | 'closes_before_end' | 'unknown';
  message: string;
  interval?: OpenInterval;
  /** primo istante utile di ingresso >= arrivo, se esiste nella stessa giornata */
  nextOpen?: DateTime;
}

/**
 * Verifica che la struttura sia aperta per tutta la permanenza [arrivo, arrivo+durata]
 * e che l'arrivo non superi l'ultimo ingresso.
 */
export function checkVisit(s: OpeningSchedule | undefined, arrival: DateTime, stayMin: number): VisitCheck {
  if (!s) return { ok: true, status: 'unknown', message: 'Orari non disponibili: da verificare' };
  const end = arrival.plus({ minutes: stayMin });
  const ivs = openIntervals(s, arrival.minus({ hours: 1 }), end.plus({ hours: 12 }));
  const containing = ivs.find((iv) => iv.start <= arrival && iv.end > arrival);
  if (!containing) {
    const next = ivs.find((iv) => iv.start > arrival);
    const why = s.exceptions.find((e) => e.date === arrival.setZone(TZ).toFormat('yyyy-MM-dd') && e.closed && e.note)?.note;
    if (why) return { ok: false, status: 'closed', message: `Chiuso in questa data: ${why}` };
    return { ok: false, status: 'closed', message: next ? `Chiuso all'arrivo; apre alle ${next.start.toFormat('HH:mm')}` : "Chiuso all'orario previsto", nextOpen: next?.start };
  }
  if (containing.lastEntry && arrival > containing.lastEntry) {
    return { ok: false, status: 'last_entry_passed', message: `Ultimo ingresso alle ${containing.lastEntry.toFormat('HH:mm')}: arrivo troppo tardi`, interval: containing };
  }
  if (containing.end < end) {
    return { ok: false, status: 'closes_before_end', message: `Chiude alle ${containing.end.toFormat('HH:mm')}, prima della fine della visita`, interval: containing };
  }
  return { ok: true, status: 'ok', message: `Aperto fino alle ${containing.end.toFormat('HH:mm')}${containing.lastEntry ? ` (ultimo ingresso ${containing.lastEntry.toFormat('HH:mm')})` : ''}`, interval: containing };
}

/** Descrizione leggibile degli orari di una data. */
export function describeDay(s: OpeningSchedule, date: string): string {
  if (s.alwaysOpen) return 'Sempre accessibile';
  const ivs = intervalsForDate(s, date);
  if (!ivs.length) {
    const why = s.exceptions.find((e) => e.date === date && e.closed && e.note)?.note;
    if (why) return `Chiuso (${why})`;
    // il nome della festività spiega la chiusura solo se l'orario dichiara i festivi chiusi
    const hol = s.holidays === 'closed' ? holidayName(date) : null;
    return hol ? `Chiuso (${hol})` : 'Chiuso';
  }
  return ivs.map((i) => `${i.start.toFormat('HH:mm')}–${i.end.toFormat('HH:mm')}${i.end.toFormat('yyyy-MM-dd') !== date ? ' (+1)' : ''}${i.lastEntry ? ` · ultimo ingresso ${i.lastEntry.toFormat('HH:mm')}` : ''}`).join(', ');
}

// ------------------------------------------------------------- eventi
/**
 * Espande un evento nelle occorrenze che toccano [from, to].
 * Le ricorrenze non esistono fuori dall'intervallo di validità; le eccezioni
 * (annullato, rinviato, esaurito) sono riportate con il loro stato.
 */
export function expandEvent(ev: CatalogEvent, from: DateTime, to: DateTime): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  const r = ev.recurrence;
  if (r) {
    let d = from.setZone(TZ).minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const last = to.setZone(TZ).toFormat('yyyy-MM-dd');
    for (let guard = 0; d <= last && guard < 400; guard++, d = addDaysToDate(d, 1)) {
      if (d < r.validFrom || d > r.validTo) continue;
      if (!r.byDay.includes(isoWeekday(d))) continue;
      const start = localToInstant(d, r.from);
      const end = r.to ? localToInstant(d, r.to, r.to <= r.from ? 1 : 0) : null;
      if ((end ?? start) < from || start > to) continue;
      const ex = r.exceptions.find((e) => e.date === d);
      out.push({
        eventId: ev.id, sessionId: `${ev.id}@${d}`, placeId: ev.placeId, title: ev.title,
        start: toISO(start), end: end ? toISO(end) : null, timeCertain: true,
        status: ex?.status ?? 'scheduled', origin: 'recurrence', demo: ev.demo, note: ex?.note,
      });
    }
  }
  for (const s of ev.sessions) {
    const start = DateTime.fromISO(s.start, { setZone: true }).setZone(TZ);
    const end = s.end ? DateTime.fromISO(s.end, { setZone: true }).setZone(TZ) : null;
    if ((end ?? start) < from || start > to) continue;
    out.push({
      eventId: ev.id, sessionId: s.id, placeId: ev.placeId, title: s.label ? `${ev.title} — ${s.label}` : ev.title,
      start: toISO(start), end: end ? toISO(end) : null, timeCertain: !s.timeUncertain,
      status: s.status, origin: 'session', demo: ev.demo,
    });
  }
  return out.sort((a, b) => DateTime.fromISO(a.start).toMillis() - DateTime.fromISO(b.start).toMillis());
}
