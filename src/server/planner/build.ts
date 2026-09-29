/**
 * Validazione precisa di un programma candidato: tratte reali (cammino + orario
 * GTFS), aperture per tutta la permanenza, ultimo ingresso, eventi, rientro,
 * budget, cammino e mobilità. Restituisce un Plan completo oppure il problema
 * che lo rende invalido (per correggerlo o scartarlo).
 */
import { applyReturnTickets } from '../catalog/fares.ts';
import { DateTime } from 'luxon';
import type { Plan, PlanStop, Trip, CheckResult, LegPoint, CostLine, DataSnapshot } from '../../shared/types.ts';
import { TZ } from '../../shared/types.ts';
import { checkVisit, describeDay, holidayName } from '../../shared/calendar.ts';
import { groupCost, sumCosts, fmtRange } from '../../shared/pricing.ts';
import { isoFromMs, hhmm, fmtDuration } from '../../shared/time.ts';
import type { PlanContext } from './context.ts';
import type { Candidate } from './candidates.ts';
import type { DataStore } from '../data.ts';
import type { Step } from './search.ts';

export interface BuildProblem { code: 'unreachable' | 'late_event' | 'closed' | 'no_return' | 'late_return' | 'over_budget' | 'walk_limit' | 'ascent_limit'; stepIndex: number; message: string }
export interface BuildResult { plan?: Plan; problem?: BuildProblem }

export interface PlannedStep { cand: Candidate; stayMin: number }

let seq = 0;
export function newId(prefix: string) { seq = (seq + 1) % 1e6; return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`; }

function pointOf(c: Candidate): LegPoint { return { label: c.place.name, lon: c.place.entrance.lon, lat: c.place.entrance.lat, placeId: c.place.id }; }

export interface PastState {
  stops: PlanStop[];
  trips: Trip[];
  t: number;
  pos: LegPoint;
}

/**
 * Costruisce il piano dalla sequenza. `past` (facoltativo) contiene tappe e tratte
 * già vissute in un ramo: non vengono ricalcolate.
 */
export function buildPlan(ctx: PlanContext, data: DataStore, steps: PlannedStep[], meta: { theme: string; themeLabel: string; branchId?: string; parentPlanId?: string; version?: number }, past?: PastState): BuildResult {
  const stops: PlanStop[] = past ? structuredClone(past.stops) : [];
  const trips: Trip[] = past ? structuredClone(past.trips) : [];
  let t = past?.t ?? ctx.start;
  let pos: LegPoint = past?.pos ?? ctx.startPoint;
  const base = stops.length;
  const optsAt = (ms: number) => (ms >= ctx.duskAt ? ctx.nightTravel : ctx.travel);

  for (let i = 0; i < steps.length; i++) {
    const { cand: c } = steps[i];
    let stayMin = steps[i].stayMin;
    const target = pointOf(c);
    const trip = data.router.trip(pos, target, t, optsAt(t), { fromStop: base + i - 1, toStop: base + i });
    if (!trip) return { problem: { code: 'unreachable', stepIndex: i, message: `Nessun collegamento praticabile verso ${c.place.name} alle ${hhmm(t)}` } };
    const tripDep = Date.parse(trip.departure);
    const arrival = Date.parse(trip.arrival);
    // la tappa precedente si prolunga fino alla partenza effettiva (se rimane aperta)
    if (stops.length && tripDep > t) extendPrevious(stops[stops.length - 1], data, tripDep);
    let start = arrival;
    let end: number;
    const checks: CheckResult[] = [];
    if (c.fixedStart != null && c.locked) {
      if (arrival > c.fixedStart) return { problem: { code: 'late_event', stepIndex: i, message: `Arrivo alle ${hhmm(arrival)}: oltre l'orario bloccato delle ${hhmm(c.fixedStart)} a ${c.place.name}` } };
      start = c.fixedStart; end = c.fixedEnd!;
      const sched = c.place.schedules.find((s) => s.kind === 'public');
      const chk = sched ? checkVisit(sched, DateTime.fromMillis(start, { zone: TZ }), (end - start) / 60_000) : null;
      checks.push({ id: 'locked', label: 'Tappa bloccata', status: 'ok', detail: `Orario fissato da voi: ${hhmm(start)}–${hhmm(end)}.` });
      if (chk && !chk.ok) checks.push({ id: 'hours', label: 'Apertura', status: 'uncertain', detail: `Secondo i dati: ${chk.message}. Verificate la vostra prenotazione.` });
      else if (chk) checks.push({ id: 'hours', label: 'Apertura', status: 'ok', detail: chk.message });
    } else if (c.fixedStart != null) {
      if (arrival > c.fixedStart - 3 * 60_000) return { problem: { code: 'late_event', stepIndex: i, message: `Arrivo alle ${hhmm(arrival)}: troppo tardi per ${c.event?.title} delle ${hhmm(c.fixedStart)}` } };
      start = c.fixedStart; end = c.fixedEnd!;
      checks.push({ id: 'event', label: 'Evento', status: c.occ?.timeCertain ? 'ok' : 'uncertain', detail: `${c.event?.title}: ${hhmm(c.fixedStart)}–${hhmm(c.fixedEnd!)}${c.occ?.timeCertain ? '' : ' (orario non confermato)'}` });
      if (c.event?.demo) checks.push({ id: 'demo', label: 'Dato dimostrativo', status: 'uncertain', detail: 'Evento di esempio (fixture): non rappresenta l\'agenda reale.' });
      else if (c.event?.url) checks.push({ id: 'source', label: 'Fonte', status: 'ok', detail: `Calendario ufficiale Lugano Eventi: ${c.event.url}` });
    } else {
      const sched = c.place.schedules.find((s) => s.kind === 'public');
      if (sched) {
        let chk = checkVisit(sched, DateTime.fromMillis(start, { zone: TZ }), stayMin);
        if (!chk.ok && chk.status === 'closed' && chk.nextOpen && chk.nextOpen.toMillis() - start <= 35 * 60_000) {
          start = chk.nextOpen.toMillis();
          chk = checkVisit(sched, chk.nextOpen, stayMin);
        }
        if (!chk.ok && chk.status === 'closes_before_end' && chk.interval) {
          const avail = Math.floor((chk.interval.end.toMillis() - start) / 60_000) - 5;
          if (avail >= c.stay.min) { stayMin = avail; chk = checkVisit(sched, DateTime.fromMillis(start, { zone: TZ }), stayMin); }
        }
        if (!chk.ok) return { problem: { code: 'closed', stepIndex: i, message: `${c.place.name}: ${chk.message}` } };
        const src = sched.evidence.status;
        checks.push({ id: 'hours', label: 'Apertura', status: src === 'verified' || src === 'official_import' ? 'ok' : 'ok', detail: `${chk.message}. Fonte: ${evidenceLabel(src)}${src !== 'verified' ? ', da verificare' : ''}.` });
        const hol = holidayName(DateTime.fromMillis(start, { zone: TZ }).toFormat('yyyy-MM-dd'));
        if (hol) checks.push({ id: 'holiday', label: 'Festivo', status: sched.holidays === 'unknown' ? 'uncertain' : 'ok', detail: `${hol}: ${describeDay(sched, DateTime.fromMillis(start, { zone: TZ }).toFormat('yyyy-MM-dd'))}` });
      } else {
        checks.push({ id: 'hours', label: 'Apertura', status: 'uncertain', detail: 'Orari non disponibili nel catalogo: da verificare prima di andare.' });
      }
      end = start + stayMin * 60_000;
    }
    if (end > ctx.end) return { problem: { code: 'late_return', stepIndex: i, message: `${c.place.name} terminerebbe dopo la fine della finestra` } };
    const cost = c.kind === 'event' ? groupCost(c.prices, ctx.req.people, isoFromMs(start), c.key) : groupCost(c.prices, ctx.req.people, isoFromMs(start), c.place.id);
    if (cost.some((x) => x.status === 'unknown' && x.essential)) checks.push({ id: 'cost', label: 'Costo', status: 'uncertain', detail: 'Costo non disponibile: non è stato considerato zero.' });
    const acc = c.place.accessibility;
    if (ctx.req.mobility.stroller || ctx.req.mobility.wheelchair) {
      const v = ctx.req.mobility.wheelchair ? acc.wheelchair : acc.stroller;
      checks.push({ id: 'access', label: 'Accessibilità', status: v === 'yes' ? 'ok' : 'uncertain', detail: v === 'yes' ? `Indicato come accessibile (${evidenceLabel(acc.evidence.status)})` : v === 'limited' ? 'Accessibilità limitata' : 'Accessibilità non verificata: nessun dato sulle scale all\'interno.' });
    }
    if (c.place.mountain) {
      checks.push({ id: 'mountain', label: 'Montagna', status: c.place.mountain.conditionsVerified ? 'ok' : 'uncertain', detail: `${c.place.mountain.access[0]}. ${c.place.mountain.returnNote ?? ''}`.trim() });
    }
    if (ctx.rainLikely && !c.indoor && c.place.suitability.weather === 'dry') checks.push({ id: 'weather', label: 'Meteo', status: 'uncertain', detail: 'Attività all\'aperto con pioggia prevista.' });
    const stop: PlanStop = {
      id: `st-${base + i}-${c.key}`,
      kind: c.kind === 'event' ? 'event' : 'place',
      placeId: c.place.id,
      eventId: c.event?.id,
      occurrenceStart: c.occ?.start,
      name: c.kind === 'event' ? c.event!.title : c.place.name,
      arrival: isoFromMs(arrival),
      start: isoFromMs(start),
      end: isoFromMs(end),
      departure: isoFromMs(end),
      stayMin: Math.round((end - start) / 60_000),
      locked: !!c.locked,
      mandatory: c.mustSee,
      cost,
      checks,
      reasons: c.reasons,
      lon: c.place.entrance.lon,
      lat: c.place.entrance.lat,
      category: c.place.category,
      dataQuality: c.dataQuality,
    };
    if (c.exit) {
      const w = data.router.walk(c.place.entrance, c.exit.entrance, optsAt(start).profile);
      if (w) {
        stop.exit = { label: c.exit.name, lon: c.exit.entrance.lon, lat: c.exit.entrance.lat, placeId: c.exit.id };
        stop.activityPath = { coords: w.coords, lengthM: Math.round(w.lengthM), upM: Math.round(w.upM), downM: Math.round(w.downM), mode: w.hike ? 'hike' : 'walk' };
        const need = Math.round(w.seconds / 60);
        if (stop.stayMin < need) { end = start + need * 60_000; stop.end = stop.departure = isoFromMs(end); stop.stayMin = need; }
      }
    }
    trips.push(trip);
    stops.push(stop);
    t = end;
    pos = stop.exit ?? { label: c.place.name, lon: c.place.entrance.lon, lat: c.place.entrance.lat, placeId: c.place.id };
  }
  // rientro
  let endPoint: LegPoint = ctx.endPoint ?? pos;
  if (ctx.endPoint) {
    const ret = data.router.trip(pos, ctx.endPoint, t, optsAt(t), { fromStop: stops.length - 1, toStop: stops.length });
    if (!ret) return { problem: { code: 'no_return', stepIndex: steps.length, message: `Nessun rientro praticabile verso ${ctx.endPoint.label} dopo le ${hhmm(t)}` } };
    if (Date.parse(ret.arrival) > ctx.end) return { problem: { code: 'late_return', stepIndex: steps.length, message: `Rientro alle ${hhmm(Date.parse(ret.arrival))}, oltre l'orario di fine ${ctx.req.endTime}` } };
    if (stops.length && Date.parse(ret.departure) > t) extendPrevious(stops[stops.length - 1], data, Date.parse(ret.departure));
    trips.push(ret);
  } else endPoint = pos;

  return { plan: finalize(ctx, data, stops, trips, endPoint, meta) };
}

function extendPrevious(prev: PlanStop, data: DataStore, until: number) {
  const place = data.place(prev.placeId);
  const start = Date.parse(prev.start);
  const maxEnd = prev.kind === 'event' ? Date.parse(prev.end) : start + (place?.visit.max ?? prev.stayMin) * 60_000;
  let newEnd = Math.min(until, Math.max(Date.parse(prev.end), maxEnd));
  const sched = place?.schedules.find((s) => s.kind === 'public');
  if (sched && prev.kind !== 'event') {
    const chk = checkVisit(sched, DateTime.fromMillis(start, { zone: TZ }), (newEnd - start) / 60_000);
    if (!chk.ok && chk.interval) newEnd = Math.min(newEnd, chk.interval.end.toMillis());
    if (newEnd < Date.parse(prev.end)) newEnd = Date.parse(prev.end);
  }
  prev.end = isoFromMs(newEnd);
  prev.stayMin = Math.round((newEnd - start) / 60_000);
  prev.departure = isoFromMs(until);
}

export function evidenceLabel(s: string) {
  return ({ verified: 'verificato dalla redazione', official_import: 'dato ufficiale importato', editorial: 'redazione', osm: 'OpenStreetMap', estimate: 'stima', demo: 'dato dimostrativo', unknown: 'non disponibile' } as Record<string, string>)[s] ?? s;
}

export function finalize(ctx: PlanContext, data: DataStore, stops: PlanStop[], trips: Trip[], endPoint: LegPoint, meta: { theme: string; themeLabel: string; branchId?: string; parentPlanId?: string; version?: number }): Plan {
  // andata e ritorno sulla stessa funicolare: listino a/r al posto di due corse semplici
  const fareLines = trips.flatMap((t, ti) => t.cost.map((c, ci) => ({ c, ti, ci })));
  const adjusted = applyReturnTickets(fareLines.map((x) => x.c), ctx.req.people, ctx.req.passes ?? []);
  fareLines.forEach((x, i) => { trips[x.ti].cost[x.ci] = adjusted[i]; });
  const allCosts: CostLine[] = [...stops.flatMap((s) => s.cost), ...trips.flatMap((t) => t.cost)];
  const cost = sumCosts(allCosts, ctx.people, ctx.req.budget.amount != null ? ctx.req.budget : undefined);
  const walkM = trips.reduce((s, t) => s + t.summary.walkM, 0) + stops.reduce((s, st) => s + (st.activityPath?.lengthM ?? 0), 0);
  const ascentM = trips.reduce((s, t) => s + t.summary.ascentM, 0) + stops.reduce((s, st) => s + (st.activityPath?.upM ?? 0), 0);
  const descentM = trips.reduce((s, t) => s + t.summary.descentM, 0) + stops.reduce((s, st) => s + (st.activityPath?.downM ?? 0), 0);
  const startsAt = trips[0]?.departure ?? stops[0]?.start ?? isoFromMs(ctx.start);
  const endsAt = trips.length > stops.length ? trips[trips.length - 1].arrival : stops[stops.length - 1]?.departure ?? isoFromMs(ctx.start);
  const checks: CheckResult[] = [];
  const endMs = Date.parse(endsAt);
  checks.push({ id: 'window', label: 'Orari della giornata', status: endMs <= ctx.end ? 'ok' : 'violated', detail: `Dalle ${hhmm(startsAt)} alle ${hhmm(endsAt)}${ctx.crossesMidnight ? ' (fine il giorno successivo)' : ''}; limite ${ctx.req.endTime}.` });
  if (ctx.endPoint) {
    const ret = trips[trips.length - 1];
    const slack = (ctx.end - Date.parse(ret.arrival)) / 60_000;
    checks.push({ id: 'return', label: 'Rientro', status: slack >= 0 ? (slack < 10 ? 'uncertain' : 'ok') : 'violated', detail: `Arrivo a ${ctx.endPoint.label} alle ${hhmm(ret.arrival)} con ${ret.summary.label.toLowerCase()}${slack < 10 && slack >= 0 ? ': margine inferiore a 10 minuti' : ''}.` });
  } else checks.push({ id: 'return', label: 'Rientro', status: 'ok', detail: 'Punto finale libero: nessun rientro calcolato.' });
  if (ctx.req.budget.amount != null) {
    const b = ctx.req.budget;
    const capLabel = `CHF ${b.amount} ${b.per === 'person' ? 'a persona' : 'per il gruppo'}${b.strict ? ' (limite rigido)' : ' (preferenza)'}`;
    const st = cost.status;
    checks.push({
      id: 'budget', label: 'Budget',
      status: st === 'within' ? 'ok' : st === 'over' ? (b.strict ? 'violated' : 'uncertain') : 'uncertain',
      detail: st === 'within' ? `Stima ${fmtRange(cost.min, cost.max)} entro ${capLabel}.`
        : st === 'over' ? `Stima minima ${fmtRange(cost.min, cost.min)} oltre ${capLabel}.`
        : cost.unknownEssential ? `Non verificabile: ${cost.unknownEssential} cost${cost.unknownEssential > 1 ? 'i' : 'o'} essenzial${cost.unknownEssential > 1 ? 'i' : 'e'} sconosciut${cost.unknownEssential > 1 ? 'i' : 'o'}. Stima nota ${fmtRange(cost.min, cost.max)} rispetto a ${capLabel}.`
        : `La fascia stimata ${fmtRange(cost.min, cost.max)} potrebbe superare ${capLabel}.`,
    });
  }
  if (ctx.req.maxWalkKm) checks.push({ id: 'walk', label: 'Cammino', status: walkM <= ctx.req.maxWalkKm * 1000 ? 'ok' : 'violated', detail: `${(walkM / 1000).toFixed(1)} km a piedi (massimo ${ctx.req.maxWalkKm} km).` });
  if (ctx.req.maxAscentM != null) checks.push({ id: 'ascent', label: 'Dislivello', status: ascentM <= ctx.req.maxAscentM ? 'ok' : 'violated', detail: `${Math.round(ascentM)} m in salita (massimo ${ctx.req.maxAscentM} m, stima dal modello del terreno).` });
  if (ctx.req.mobility.stroller || ctx.req.mobility.wheelchair || ctx.req.mobility.avoidStairs) {
    const stairLegs = trips.flatMap((t) => t.legs).filter((l) => l.flags.stairs).length;
    const unknownLegs = trips.flatMap((t) => t.legs).filter((l) => (l.mode === 'walk' || l.mode === 'hike') && l.flags.strollerOk === 'unknown').length;
    checks.push({ id: 'mobility', label: 'Mobilità', status: stairLegs ? (ctx.req.mobility.avoidStairs && !ctx.req.mobility.stroller && !ctx.req.mobility.wheelchair ? 'uncertain' : 'violated') : unknownLegs ? 'uncertain' : 'ok',
      detail: stairLegs ? `${stairLegs} tratt${stairLegs > 1 ? 'i' : 'o'} con scale.` : unknownLegs ? `Percorsi senza scale note, ma ${unknownLegs} tratt${unknownLegs > 1 ? 'i' : 'o'} con fondo o pendenza da verificare. Un percorso senza dati sulle scale non è marcato come accessibile.` : 'Percorsi senza scale secondo i dati OSM (da verificare sul posto).' });
  }
  const rides = trips.flatMap((t) => t.legs).filter((l) => l.transit);
  if (rides.length) {
    const freq = rides.filter((r) => r.transit![0].frequencyBased).length;
    const covered = data.transit.covers(ctx.req.date);
    const ref = covered ? null : data.transit.referenceDate(ctx.req.date);
    checks.push({
      id: 'transit', label: 'Trasporti', status: covered ? (freq ? 'uncertain' : 'ok') : ref ? 'uncertain' : 'violated',
      detail: covered ? `${rides.length} corse dall'orario ufficiale statico ${data.transit.feedVersion}; nessun dato in tempo reale.${freq ? ` ${freq} a cadenza (orario indicativo).` : ''}`
        : ref ? `Orario stimato: l'orario ufficiale per questa data non è ancora importato; ${rides.length} corse ricavate dall'orario del ${ref} (stesso giorno della settimana). Verificate le corse reali prima di partire.`
        : 'La data è fuori dal periodo di validità dell\'orario importato.',
    });
  }
  if (walkM > 0 && trips.some((t) => t.legs.some((l) => l.mode === 'hike'))) checks.push({ id: 'hike', label: 'Escursione', status: 'uncertain', detail: 'Il programma include tratti di sentiero di montagna: tempi e dislivelli stimati, condizioni non verificate.' });
  for (const s of stops) for (const c of s.checks) if (c.status !== 'ok') checks.push({ ...c, id: `${s.id}:${c.id}`, label: `${s.name} — ${c.label}` });
  const feasibility: Plan['feasibility'] = checks.some((c) => c.status === 'violated') ? 'invalid' : checks.some((c) => c.status === 'uncertain') ? 'uncertain' : 'valid';
  const missing: string[] = [];
  for (const s of stops) {
    if (s.cost.some((c) => c.status === 'unknown' && c.essential)) missing.push(`Costo di ${s.name}`);
    if (s.checks.some((c) => c.id === 'hours' && c.status === 'uncertain')) missing.push(`Orari di ${s.name}`);
  }
  const snapshot: DataSnapshot = {
    catalogVersion: data.catalogVersion,
    transitFeed: `${data.transit.feedVersion} (${data.transit.feedRange.start}–${data.transit.feedRange.end})`,
    computedAt: new Date().toISOString(),
    weather: ctx.weather,
    places: Object.fromEntries(stops.map((s) => {
      const p = data.place(s.placeId)!;
      return [p.id, { name: p.name, schedules: p.schedules, prices: p.prices, evidence: p.evidence }];
    })),
    demo: true,
  };
  const n = stops.length;
  const themeCats: Record<string, string[]> = { panorami: ['summit', 'viewpoint', 'lift'], cultura: ['museum', 'culture', 'church', 'show'], lago: ['village', 'walk', 'lido', 'park'], natura: ['park', 'walk', 'hike', 'summit'], famiglia: ['attraction', 'playground', 'museum', 'park'], gusto: ['restaurant', 'market'], serata: ['show', 'restaurant', 'bar'], fuori: ['village', 'summit', 'museum', 'park'] };
  const prefer = themeCats[meta.theme] ?? [];
  const ranked = stops.filter((s) => !['cafe', 'gelato', 'bar'].includes(s.category)).sort((a, b) => (prefer.includes(b.category) ? 1 : 0) - (prefer.includes(a.category) ? 1 : 0));
  const main = ranked.slice(0, 2).map((s) => s.name.replace(/\s*\(.*?\)\s*/g, ''));
  // l'etichetta del tema deve corrispondere al contenuto reale
  if (meta.theme !== 'classico' && prefer.length && !stops.some((s) => prefer.includes(s.category))) meta = { ...meta, themeLabel: 'Il meglio per voi' };
  if (meta.theme === 'fuori' && !stops.some((s) => Math.hypot((s.lon - 8.9513) * 77300, (s.lat - 46.0039) * 111200) > 1300)) meta = { ...meta, themeLabel: 'Il meglio per voi' };
  return {
    id: newId('plan'),
    version: meta.version ?? 1,
    branchId: meta.branchId ?? 'main',
    parentPlanId: meta.parentPlanId,
    createdAt: new Date().toISOString(),
    title: `${meta.themeLabel}${main.length ? `: ${main.join({ it: ' e ', en: ' and ', fr: ' et ', de: ' und ' }[ctx.req.locale])}` : ''}`,
    theme: meta.theme,
    summary: `${n} tapp${n === 1 ? 'a' : 'e'} · ${fmtDuration((endMs - Date.parse(startsAt)) / 60000)} · ${(walkM / 1000).toFixed(1)} km a piedi · ${cost.unknownEssential ? 'costi in parte sconosciuti' : `${fmtRange(cost.perPersonMin, cost.perPersonMax)} a persona`}`,
    request: ctx.req,
    stops, trips, end: endPoint,
    totals: {
      startsAt, endsAt, durationMin: Math.round((endMs - Date.parse(startsAt)) / 60000),
      walkM: Math.round(walkM), ascentM: Math.round(ascentM), descentM: Math.round(descentM),
      transitRides: rides.length, cost,
    },
    checks, feasibility, tradeoffs: [], missing, whyThis: [], decisions: [],
    narrative: { lines: [], source: 'deterministic' },
    plannerSource: 'deterministic',
    snapshot,
  };
}
