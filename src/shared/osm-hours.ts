/**
 * Conversione di un sottoinsieme della sintassi OSM `opening_hours` nel modello
 * OpeningSchedule. La stringa originale resta come evidenza; se la sintassi non è
 * supportata con certezza, la conversione fallisce e l'orario resta «da verificare»
 * (non si indovina).
 */
import type { OpeningRule, OpeningSchedule, Evidence } from './types.ts';

const DAYS: Record<string, number> = { mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, su: 7, so: 7 };
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_END = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface OsmHoursResult { ok: true; schedule: OpeningSchedule }
export interface OsmHoursFail { ok: false; reason: string }

const pad = (n: number) => String(n).padStart(2, '0');

function parseDays(sel: string): { days: number[]; ph: boolean } | null {
  const days = new Set<number>();
  let ph = false;
  for (const part of sel.split(',')) {
    const p = part.trim().toLowerCase();
    if (!p) continue;
    if (p === 'ph') { ph = true; continue; }
    const m = p.match(/^([a-z]{2})(?:-([a-z]{2}))?$/);
    if (!m) return null;
    const a = DAYS[m[1]], b = m[2] ? DAYS[m[2]] : a;
    if (!a || !b) return null;
    for (let d = a, guard = 0; guard < 8; guard++) { days.add(d); if (d === b) break; d = (d % 7) + 1; }
  }
  return { days: [...days].sort(), ph };
}

function normTime(t: string): { hhmm: string; nextDay: boolean } | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return null;
  let nextDay = false;
  if (h >= 24) { h -= 24; nextDay = true; }
  if (h > 23) return null;
  return { hhmm: `${pad(h)}:${pad(min)}`, nextDay };
}

function parseTimes(s: string): { from: string; to: string }[] | 'off' | null {
  const x = s.trim().toLowerCase();
  if (x === 'off' || x === 'closed') return 'off';
  const out: { from: string; to: string }[] = [];
  for (const span of x.split(',')) {
    const m = span.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\+?$/);
    if (!m) return null;
    const a = normTime(m[1]), b = normTime(m[2]);
    if (!a || !b || a.nextDay) return null;
    let to = b.hhmm;
    if (!b.nextDay && to === '00:00') to = '00:00';
    // "24:00" o "25:00" -> termina il giorno dopo; to <= from è interpretato così dal calendario
    if (b.nextDay && b.hhmm > a.hhmm) return null; // oltre 24 ore: non supportato
    if (!b.nextDay && to <= a.hhmm && to !== '00:00') {
      // es. 20:00-01:00: OSM lo accetta come oltre mezzanotte
    }
    out.push({ from: a.hhmm, to });
  }
  return out;
}

function parseSeason(s: string): { from: string; to: string } | null {
  const x = s.trim().toLowerCase().replace(/\s+/g, ' ');
  // "mar-oct", "jun 09-oct 18", "mar 1 - sep 30", "jan 01-feb 13", "may"
  let m = x.match(/^([a-z]{3})\s*-\s*([a-z]{3})$/);
  if (m && MONTHS[m[1]] && MONTHS[m[2]]) return { from: `${pad(MONTHS[m[1]])}-01`, to: `${pad(MONTHS[m[2]])}-${pad(MONTH_END[MONTHS[m[2]]])}` };
  m = x.match(/^([a-z]{3}) (\d{1,2})\s*-\s*([a-z]{3}) (\d{1,2})$/);
  if (m && MONTHS[m[1]] && MONTHS[m[3]]) return { from: `${pad(MONTHS[m[1]])}-${pad(Number(m[2]))}`, to: `${pad(MONTHS[m[3]])}-${pad(Number(m[4]))}` };
  m = x.match(/^([a-z]{3}) (\d{1,2})\s*-\s*(\d{1,2})$/);
  if (m && MONTHS[m[1]]) return { from: `${pad(MONTHS[m[1]])}-${pad(Number(m[2]))}`, to: `${pad(MONTHS[m[1]])}-${pad(Number(m[3]))}` };
  m = x.match(/^([a-z]{3})$/);
  if (m && MONTHS[m[1]]) return { from: `${pad(MONTHS[m[1]])}-01`, to: `${pad(MONTHS[m[1]])}-${pad(MONTH_END[MONTHS[m[1]]])}` };
  return null;
}

function dayBefore(mmdd: string): string {
  let [m, d] = mmdd.split('-').map(Number);
  d -= 1;
  if (d < 1) { m = m === 1 ? 12 : m - 1; d = MONTH_END[m]; }
  return `${pad(m)}-${pad(d)}`;
}
function dayAfter(mmdd: string): string {
  let [m, d] = mmdd.split('-').map(Number);
  d += 1;
  if (d > MONTH_END[m]) { m = m === 12 ? 1 : m + 1; d = 1; }
  return `${pad(m)}-${pad(d)}`;
}

/**
 * Separa le regole: ';' introduce una regola normale (sostituisce i giorni indicati),
 * ',' seguita da un selettore di giorni introduce una regola aggiuntiva (si somma).
 */
function splitRules(s: string): { text: string; additional: boolean }[] {
  const out: { text: string; additional: boolean }[] = [];
  for (const part of s.split(';')) {
    const p = part.trim();
    if (!p) continue;
    const pieces = p.split(/(?<=\d|off|closed),\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|So|PH)\b)/);
    pieces.map((x) => x.trim()).filter(Boolean).forEach((text, i) => out.push({ text, additional: i > 0 }));
  }
  return out;
}

export function parseOsmOpeningHours(raw: string, opts: { id: string; kind?: OpeningSchedule['kind']; evidence: Evidence }): OsmHoursResult | OsmHoursFail {
  const s = raw.replace(/\n/g, ' ').trim();
  if (!s) return { ok: false, reason: 'vuoto' };
  if (/"[^"]*"/.test(s)) return { ok: false, reason: 'commenti non supportati' };
  if (s === '24/7') {
    return { ok: true, schedule: { id: opts.id, kind: opts.kind ?? 'public', tz: 'Europe/Zurich', alwaysOpen: true, rules: [], holidays: 'regular', exceptions: [], osmOpeningHours: raw, evidence: opts.evidence } };
  }
  type Bucket = Map<number, { from: string; to: string }[]>;
  const buckets = new Map<string, Bucket>(); // chiave: "all" oppure "MM-DD..MM-DD"
  let holidays: OpeningSchedule['holidays'] = 'unknown';
  let phTimes: string | null = null;
  for (const { text: rule0, additional } of splitRules(s)) {
    let rule = rule0;
    let seasonKey = 'all';
    const sm = rule.match(/^([A-Za-z]{3}(?:\s*\d{1,2})?\s*-\s*[A-Za-z]{0,3}\s*\d{0,2})\s*:?\s+(.*)$/);
    if (sm && /^[A-Za-z]{3}/.test(sm[1]) && MONTHS[sm[1].slice(0, 3).toLowerCase()]) {
      const season = parseSeason(sm[1].replace(/:$/, ''));
      if (!season) return { ok: false, reason: `stagione non riconosciuta: ${sm[1]}` };
      seasonKey = `${season.from}..${season.to}`;
      rule = sm[2].replace(/^:\s*/, '');
    }
    let daySel = '';
    let timeSel = rule;
    const dm = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|So|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su|So))?)(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|So|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su|So))?)*)\s+(.*)$/);
    if (dm) { daySel = dm[1].replace(/\s/g, ''); timeSel = dm[2]; }
    else if (/^(Mo|Tu|We|Th|Fr|Sa|Su|So|PH)/.test(rule)) {
      // "PH off", "Su off"
      const m2 = rule.match(/^([A-Za-z,\-]+)\s+(off|closed)$/);
      if (!m2) return { ok: false, reason: `regola non riconosciuta: ${rule}` };
      daySel = m2[1]; timeSel = m2[2];
    }
    const dayInfo = daySel ? parseDays(daySel) : { days: [1, 2, 3, 4, 5, 6, 7], ph: false };
    if (!dayInfo) return { ok: false, reason: `giorni non riconosciuti: ${daySel}` };
    const times = parseTimes(timeSel);
    if (times == null) return { ok: false, reason: `orario non riconosciuto: ${timeSel}` };
    if (dayInfo.ph) {
      if (times === 'off') holidays = 'closed';
      else phTimes = JSON.stringify(times);
    }
    if (!dayInfo.days.length) continue;
    let b = buckets.get(seasonKey);
    if (!b) buckets.set(seasonKey, (b = new Map()));
    for (const d of dayInfo.days) {
      if (times === 'off') b.set(d, []);
      else if (additional && b.has(d)) b.set(d, [...b.get(d)!, ...times].sort((x, y) => x.from.localeCompare(y.from)));
      else b.set(d, times);
    }
  }
  if (phTimes) {
    const sun = buckets.get('all')?.get(7);
    holidays = sun && JSON.stringify(sun) === phTimes ? 'as_sunday' : 'regular';
  }
  const seasonal = [...buckets.keys()].filter((k) => k !== 'all');
  const rules: OpeningRule[] = [];
  for (const [key, b] of buckets) {
    let seasonFrom: string | undefined, seasonTo: string | undefined;
    if (key !== 'all') [seasonFrom, seasonTo] = key.split('..');
    else if (seasonal.length === 1) {
      const [f, t] = seasonal[0].split('..');
      seasonFrom = dayAfter(t); seasonTo = dayBefore(f);
    } else if (seasonal.length > 1) {
      return { ok: false, reason: 'combinazione di più stagioni con regole generali non supportata' };
    }
    // raggruppa giorni con gli stessi intervalli
    const groups = new Map<string, number[]>();
    for (const [d, ivs] of b) {
      if (!ivs.length) continue;
      const k = JSON.stringify(ivs);
      groups.set(k, [...(groups.get(k) ?? []), d]);
    }
    for (const [k, days] of groups) {
      for (const iv of JSON.parse(k) as { from: string; to: string }[]) {
        rules.push({ days: days.sort(), from: iv.from, to: iv.to, ...(seasonFrom ? { seasonFrom, seasonTo } : {}) });
      }
    }
  }
  return { ok: true, schedule: { id: opts.id, kind: opts.kind ?? 'public', tz: 'Europe/Zurich', rules, holidays, exceptions: [], osmOpeningHours: raw, evidence: opts.evidence } };
}
