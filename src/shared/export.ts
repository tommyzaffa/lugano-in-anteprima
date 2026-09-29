/**
 * Esportazioni del programma: calendario (iCalendar RFC 5545), testo del
 * riepilogo pratico e redazione dei dettagli sensibili per la condivisione.
 */
import type { Plan, GroupRequest } from './types.ts';
import { hhmm, fmtDuration } from './time.ts';
import { fmtRange } from './pricing.ts';

function icsEscape(s: string) { return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function icsDate(iso: string) { return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 74) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

export function planToIcs(plan: Plan, opts: { includeRides?: boolean; url?: string } = {}): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lugano in anteprima//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(plan.title)}`];
  const stamp = icsDate(new Date().toISOString());
  plan.stops.forEach((s, i) => {
    const trip = plan.trips[i];
    const desc = [
      s.reasons.slice(0, 2).join('. '),
      trip ? `Come arrivare: ${trip.summary.label} (${hhmm(trip.departure)}–${hhmm(trip.arrival)})` : '',
      s.cost.length ? `Costo stimato: ${s.cost.map((c) => `${c.label} ${fmtRange(c.min, c.max)}`).join('; ')}` : '',
      ...s.checks.filter((c) => c.status !== 'ok').map((c) => `Da verificare: ${c.detail}`),
      'Pianificato con Lugano in anteprima: orari e prezzi possono cambiare, verificare prima di partire.',
    ].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${s.id}-${plan.id}@lugano-in-anteprima`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(s.start)}`, `DTEND:${icsDate(s.end)}`,
      fold(`SUMMARY:${icsEscape(s.name)}`), fold(`LOCATION:${icsEscape(s.name)}`), `GEO:${s.lat.toFixed(6)};${s.lon.toFixed(6)}`, fold(`DESCRIPTION:${icsEscape(desc)}`));
    if (opts.url) lines.push(fold(`URL:${opts.url}`));
    lines.push('END:VEVENT');
  });
  if (opts.includeRides) {
    plan.trips.forEach((t, i) => t.legs.filter((l) => l.transit).forEach((l, j) => {
      const r = l.transit![0];
      lines.push('BEGIN:VEVENT', `UID:ride-${i}-${j}-${plan.id}@lugano-in-anteprima`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(l.departure)}`, `DTEND:${icsDate(l.arrival)}`,
        fold(`SUMMARY:${icsEscape(`${r.routeShort} → ${r.headsign}`)}`), fold(`LOCATION:${icsEscape(l.from.label)}`), fold(`DESCRIPTION:${icsEscape(`Da ${l.from.label} a ${l.to.label}. Orario pianificato (${l.source.label}); verificare eventuali variazioni.`)}`), 'END:VEVENT');
    }));
  }
  lines.push('END:VCALENDAR');
  // RFC 5545: ogni riga di contenuto al massimo 75 ottetti, con continuazione indentata
  return lines.map((l) => (l.includes('\r\n') ? l : fold(l))).join('\r\n') + '\r\n';
}

export interface Redaction { hideLocations: boolean; hideNames: boolean; hideNeeds: boolean; hideBudget: boolean }
export const DEFAULT_REDACTION: Redaction = { hideLocations: true, hideNames: false, hideNeeds: true, hideBudget: false };

/** Rimuove dal piano i dettagli sensibili prima di condividerlo. */
export function redactPlan(plan: Plan, r: Redaction): Plan {
  const p: Plan = structuredClone(plan);
  const req: GroupRequest = p.request;
  // The search centre may itself be a home address or a precise geolocation.
  if (r.hideLocations) req.area = null;
  const startSensitive = r.hideLocations && (req.start.kind === 'address' || req.start.kind === 'geolocation' || req.start.kind === 'point' || req.start.sensitive || req.end.mode === 'accommodation');
  if (startSensitive) {
    req.start = { ...req.start, label: 'Punto di partenza (nascosto)', lon: 0, lat: 0, placeId: undefined, stopId: undefined };
    if (req.end.location) req.end.location = { ...req.end.location, label: 'Punto di rientro (nascosto)', lon: 0, lat: 0 };
    const hide = (legIdx: 'first' | 'last', trip = legIdx === 'first' ? p.trips[0] : p.trips.length > p.stops.length ? p.trips[p.trips.length - 1] : null) => {
      if (!trip || !trip.legs.length) return;
      const leg = legIdx === 'first' ? trip.legs[0] : trip.legs[trip.legs.length - 1];
      if (leg.mode !== 'walk' && leg.mode !== 'hike') return;
      const keep = legIdx === 'first' ? leg.geometry[leg.geometry.length - 1] : leg.geometry[0];
      leg.geometry = [keep];
      if (legIdx === 'first') { leg.from = { label: 'Partenza (nascosta)', lon: keep[0], lat: keep[1] }; trip.from = leg.from; }
      else { leg.to = { label: 'Rientro (nascosto)', lon: keep[0], lat: keep[1] }; trip.to = leg.to; p.end = leg.to; }
      leg.streets = [];
    };
    hide('first'); hide('last');
  }
  if (r.hideNames) {
    req.people = req.people.map((x, i) => ({ ...x, name: `Persona ${i + 1}` }));
    // anche i nomi citati nelle battute (solo parole intere: «Clinica S. Anna» resta il nome di una fermata)
    const rename = (t: string) => plan.request.people.reduce((acc, x, i) => (x.name.trim().length > 1 ? acc.replace(new RegExp(`(^|[^\\p{L}])${x.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu'), `$1Persona ${i + 1}`) : acc), t);
    p.narrative.lines = p.narrative.lines.map((l) => { const i = plan.request.people.findIndex((x) => x.name === l.speaker); return { ...l, speaker: i >= 0 ? `Persona ${i + 1}` : l.speaker, text: rename(l.text) }; });
  }
  // le decisioni pre-validate contengono piani completi: vanno oscurati allo stesso modo
  p.decisions = p.decisions.map((d) => ({ ...d, options: d.options.map((o) => (o.plan ? { ...o, plan: redactPlan(o.plan, r) } : o)) }));
  if (r.hideNeeds) {
    req.mobility = { stroller: false, wheelchair: false, avoidStairs: false, frequentBreaks: false };
    req.diet = [];
    req.freeText = undefined;
    req.people = req.people.map((x) => ({ ...x, interests: [], ageBand: undefined }));
    req.passes = [];
    p.checks = p.checks.filter((c) => c.id !== 'mobility');
  }
  if (r.hideBudget) { req.budget = { per: 'person', strict: false }; p.checks = p.checks.filter((c) => c.id !== 'budget'); }
  // i dati di vincoli personali non servono a chi guarda la proposta
  req.resolutions = {};
  if (!startSensitive) return p;
  // ogni altra menzione del punto privato (testi dei controlli, etichette, note) viene sostituita
  const secrets = [plan.request.start.label, plan.request.end.location?.label].filter((x): x is string => !!x && x.length > 2);
  let json = JSON.stringify(p);
  for (const sec of secrets) json = json.split(JSON.stringify(sec).slice(1, -1)).join('punto privato');
  return JSON.parse(json);
}

export function planToText(plan: Plan): string {
  const out: string[] = [`${plan.title}`, `${plan.summary}`, ''];
  plan.stops.forEach((s, i) => {
    const t = plan.trips[i];
    if (t) out.push(`${hhmm(t.departure)}  ${t.summary.label} (${fmtDuration(t.summary.durationMin)})`);
    out.push(`${hhmm(s.start)}–${hhmm(s.end)}  ${s.name}`);
  });
  const ret = plan.trips.length > plan.stops.length ? plan.trips[plan.trips.length - 1] : null;
  if (ret) out.push(`${hhmm(ret.departure)}  Rientro: ${ret.summary.label}, arrivo ${hhmm(ret.arrival)}`);
  out.push('', `Costo stimato: ${fmtRange(plan.totals.cost.perPersonMin, plan.totals.cost.perPersonMax)} a persona${plan.totals.cost.unknownEssential ? ' + costi sconosciuti' : ''}`);
  return out.join('\n');
}
