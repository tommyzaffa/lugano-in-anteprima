/**
 * Cambiare idea e scenari «E se…» (§10 del brief).
 * Il passato del ramo resta invariato (tappe e tratte già vissute, anche una
 * tratta interrotta a metà); si ricalcola solo il futuro, rispettando le tappe
 * bloccate. Il risultato è un nuovo ramo confrontabile e reversibile.
 * Gli scenari «E se…» sono ipotesi attivate dall'utente, non notizie reali.
 */
import type { Plan, Decision, PlanStop, Trip, LegPoint, RouteLeg, GroupRequest, PlanDiff } from '../../shared/types.ts';
import { buildTimeline, stateAt } from '../../shared/simulation.ts';
import { isoFromMs, hhmm, requestWindow } from '../../shared/time.ts';
import { checkVisit } from '../../shared/calendar.ts';
import { DateTime } from 'luxon';
import { TZ } from '../../shared/types.ts';
import type { DataStore } from '../data.ts';
import { buildContext, type PlanContext } from './context.ts';
import { parseFreeText } from './text.ts';
import { selectCandidates, stayFor, type Candidate } from './candidates.ts';
import { buildPlan, finalize, type PastState, type PlannedStep } from './build.ts';
import { Estimator } from './estimate.ts';
import { search, THEMES } from './search.ts';
import { diffPlans, narrate } from './explain.ts';

export interface ReplanResult { plan: Plan | null; diff: PlanDiff | null; explanation: string[]; hypothetical: boolean }

const WHATIF_LABEL: Record<string, string> = {
  whatif_missed_bus: 'E se… perdiamo la corsa',
  whatif_rain: 'E se… piove',
  whatif_unavailable: 'E se… il posto non è disponibile',
  whatif_stay_30: 'E se… restiamo mezz\'ora in più',
};

function candidateFromStop(ctx: PlanContext, data: DataStore, s: PlanStop): Candidate | null {
  const p = data.place(s.placeId);
  if (!p) return null;
  if (s.kind === 'event' && s.eventId) {
    const ev = data.events.get(s.eventId);
    const occ = ev ? data.occurrences(requestWindow(ctx.req.date, '00:00', '23:59').start.minus({ days: 1 }), requestWindow(ctx.req.date, '00:00', '23:59').end.plus({ days: 1 })).find((o) => o.eventId === ev.id && o.start === s.occurrenceStart) : undefined;
    return {
      key: `${s.eventId}@${occ?.sessionId ?? s.occurrenceStart}`, kind: 'event', place: p, event: ev, occ,
      base: 1, stay: { min: s.stayMin, typ: s.stayMin, max: s.stayMin }, fixedStart: Date.parse(s.start), fixedEnd: Date.parse(s.end),
      prices: ev?.prices ?? [], costMin: 0, costMax: 0, unknownEssential: false, meal: null, reasons: s.reasons, warnings: [], dataQuality: 'demo',
      hoursKnown: true, indoor: !!ev?.suitability.indoor, mustSee: s.mandatory || s.locked, themes: [],
    };
  }
  return {
    key: p.id, kind: 'place', place: p, base: 1, stay: stayFor(ctx, p.visit.min, p.visit.typical, p.visit.max),
    prices: p.prices, costMin: 0, costMax: 0, unknownEssential: false, meal: p.meal ?? null, reasons: s.reasons, warnings: [],
    dataQuality: s.dataQuality, hoursKnown: p.schedules.length > 0, indoor: p.suitability.indoor, mustSee: s.mandatory || s.locked, themes: [],
    exit: p.walkTo ? data.place(p.walkTo) : undefined,
    ...(s.locked ? { locked: true, fixedStart: Date.parse(s.start), fixedEnd: Date.parse(s.end) } : {}),
  };
}

/** Taglia una tratta all'istante t: tiene le parti già percorse (geometria troncata). */
function truncateTrip(trip: Trip, t: number, pos: [number, number]): { legs: RouteLeg[]; cutPoint: LegPoint; resumeAt: number } {
  const legs: RouteLeg[] = [];
  for (const l of trip.legs) {
    const s = Date.parse(l.departure), e = Date.parse(l.arrival);
    if (e <= t) { legs.push(l); continue; }
    if (s >= t) break;
    if (l.transit) {
      // non si scende a metà corsa: si arriva alla fermata di discesa
      legs.push(l);
      return { legs, cutPoint: l.to, resumeAt: e };
    }
    if (l.mode === 'wait') {
      legs.push({ ...l, arrival: isoFromMs(t), durationMin: Math.round((t - s) / 6000) / 10 });
      return { legs, cutPoint: l.from, resumeAt: t };
    }
    // cammino: tronca la geometria nel punto raggiunto
    const f = (t - s) / (e - s);
    const n = Math.max(1, Math.round(l.geometry.length * f));
    const geom = [...l.geometry.slice(0, n), pos] as [number, number][];
    const cut: LegPoint = { label: 'Punto del percorso', lon: pos[0], lat: pos[1] };
    legs.push({ ...l, to: cut, arrival: isoFromMs(t), durationMin: Math.round((t - s) / 6000) / 10, distanceM: Math.round(l.distanceM * f), geometry: geom, ascentM: Math.round((l.ascentM ?? 0) * f), descentM: Math.round((l.descentM ?? 0) * f), cost: l.cost });
    return { legs, cutPoint: cut, resumeAt: t };
  }
  const last = trip.legs[trip.legs.length - 1];
  return { legs, cutPoint: last.to, resumeAt: Date.parse(last.arrival) };
}

export function replan(plan: Plan, decision: Decision, data: DataStore): ReplanResult {
  const explanation: string[] = [];
  const hypothetical = decision.kind.startsWith('whatif_') || decision.hypothetical;
  // richiesta modificata secondo la decisione
  const req: GroupRequest = structuredClone(plan.request);
  req.resolutions = { ...req.resolutions, budget: 'keep_form', endTime: 'keep_form', startTime: 'keep_form', people: 'keep_form', kids: 'keep_form', stroller: 'keep_form', wheelchair: 'keep_form' };
  if (decision.kind === 'reduce_budget' && decision.budget != null) { req.budget = { amount: decision.budget, per: req.budget.per, strict: true }; explanation.push(`Nuovo tetto rigido: CHF ${decision.budget} ${req.budget.per === 'person' ? 'a persona' : 'per il gruppo'} (spesa già maturata esclusa dal ricalcolo).`); }
  if (decision.kind === 'less_walking') { req.pace = 'relaxed'; req.maxWalkKm = Math.max(0.5, (plan.totals.walkM / 1000) * 0.6); explanation.push('Meno cammino: ritmo rilassato e più mezzi pubblici.'); }
  if (decision.kind === 'indoor' || decision.kind === 'whatif_rain') { req.environment = 'indoor'; req.rainTolerance = 'low'; explanation.push(decision.kind === 'whatif_rain' ? 'Ipotesi di pioggia: preferite attività al coperto (non è una previsione reale).' : 'Solo attività al coperto per il resto della giornata.'); }
  if (decision.kind === 'change_return') {
    if (decision.endTime) { req.endTime = decision.endTime; explanation.push(`Nuovo orario di rientro: ${decision.endTime}.`); }
    if (decision.endLocation) { req.end = { mode: 'custom', location: decision.endLocation }; explanation.push(`Nuovo punto di rientro: ${decision.endLocation.label}.`); }
  }
  const hints = parseFreeText(req.freeText, []);
  const ctx = buildContext(req, hints, plan.snapshot.weather ?? null, () => {});
  if (decision.kind === 'whatif_rain') ctx.rainLikely = true;
  const tau = Date.parse(decision.atTime);
  const tl = buildTimeline(plan);
  const state = stateAt(tl, tau);

  // --------------------------------------------------------- passato
  const pastStops: PlanStop[] = [];
  const pastTrips: Trip[] = [];
  let pos: LegPoint = ctx.startPoint;
  let t = tau;
  let currentStop: PlanStop | null = null;
  let resumeTrip: { legs: RouteLeg[] } | null = null;
  for (let i = 0; i < plan.stops.length; i++) {
    const s = plan.stops[i];
    const trip = plan.trips[i];
    if (Date.parse(s.departure) <= tau) { pastStops.push(s); pastTrips.push(trip); pos = s.exit ?? { label: s.name, lon: s.lon, lat: s.lat, placeId: s.placeId }; t = Math.max(t, tau); continue; }
    if (Date.parse(s.arrival) <= tau) { currentStop = structuredClone(s); pastTrips.push(trip); break; }
    if (Date.parse(trip.departure) < tau) {
      const cut = truncateTrip(trip, tau, state.position);
      resumeTrip = { legs: cut.legs };
      pos = cut.cutPoint; t = cut.resumeAt;
    }
    break;
  }
  const pastCount = pastStops.length;
  const future0 = plan.stops.slice(pastCount + (currentStop ? 1 : 0));

  // --------------------------------------------------------- tappa corrente
  if (currentStop) {
    const start = Date.parse(currentStop.start);
    let end = Math.max(tau, Date.parse(currentStop.end));
    if (decision.kind === 'extend' || decision.kind === 'whatif_stay_30') {
      const m = decision.kind === 'whatif_stay_30' ? 30 : decision.minutes ?? 15;
      end = Math.max(Date.parse(currentStop.end), tau) + m * 60_000;
      explanation.push(`Restate ${m} minuti in più a ${currentStop.name}: nuova partenza alle ${hhmm(end)}.`);
      const place = data.place(currentStop.placeId);
      const sched = place?.schedules.find((x) => x.kind === 'public');
      if (sched && currentStop.kind !== 'event') {
        // la permanenza estesa deve restare dentro l'orario di apertura
        const chk = checkVisit(sched, DateTime.fromMillis(start, { zone: TZ }), (end - start) / 60_000);
        if (!chk.ok && chk.interval) {
          const close = chk.interval.end.toMillis();
          explanation.push(`${currentStop.name} chiude alle ${hhmm(close)}: oltre quell'ora restate all'esterno.`);
        }
      }
      if (currentStop.kind === 'event') explanation.push("L'evento termina comunque all'orario previsto: il tempo in più è trascorso nei dintorni.");
    } else if (decision.kind === 'skip' && decision.stopId === currentStop.id) {
      end = tau;
      explanation.push(`Lasciate subito ${currentStop.name}.`);
    } else if (decision.kind === 'add_pause') {
      // pausa: si allunga la sosta corrente
      end = Math.max(end, tau) + (decision.minutes ?? 15) * 60_000;
      explanation.push(`Pausa di ${decision.minutes ?? 15} minuti a ${currentStop.name}.`);
    } else if (decision.kind === 'lock' && decision.stopId === currentStop.id) {
      currentStop.locked = true;
    }
    currentStop.end = isoFromMs(Math.max(start, end));
    currentStop.departure = currentStop.end;
    currentStop.stayMin = Math.round((Date.parse(currentStop.end) - start) / 60_000);
    pastStops.push(currentStop);
    pos = currentStop.exit ?? { label: currentStop.name, lon: currentStop.lon, lat: currentStop.lat, placeId: currentStop.placeId };
    t = Date.parse(currentStop.end);
  } else if (decision.kind === 'add_pause') {
    // pausa sul posto (fuori da una tappa): nuova sosta «Pausa»
    const m = decision.minutes ?? 15;
    const at = resumeTrip ? pos : pos;
    const pause: PlanStop = {
      id: `st-pause-${tau}`, kind: 'pause', placeId: '', name: 'Pausa', arrival: isoFromMs(t), start: isoFromMs(t), end: isoFromMs(t + m * 60_000), departure: isoFromMs(t + m * 60_000),
      stayMin: m, locked: false, mandatory: false, cost: [], checks: [], reasons: ['Pausa richiesta'], lon: at.lon, lat: at.lat, category: 'pause', dataQuality: 'estimate',
    };
    if (resumeTrip) pastTrips.push({ ...plan.trips[pastCount], legs: resumeTrip.legs, arrival: isoFromMs(t), to: pos, toStop: pastCount });
    else pastTrips.push({ ...plan.trips[pastCount], legs: [], departure: isoFromMs(t), arrival: isoFromMs(t), to: pos, toStop: pastCount, cost: [] });
    resumeTrip = null;
    pastStops.push(pause);
    explanation.push(`Pausa di ${m} minuti.`);
    t += m * 60_000;
  }
  // lock di una tappa futura
  const lockedIds = new Set(future0.filter((s) => s.locked || s.mandatory).map((s) => s.id));
  if (decision.kind === 'lock' && decision.stopId) { lockedIds.add(decision.stopId); explanation.push('Tappa bloccata: resterà nel programma anche se cambiate altro.'); }

  // --------------------------------------------------------- «perdiamo la corsa»
  if (decision.kind === 'whatif_missed_bus') {
    const nextRideTrip = plan.trips.findIndex((tr) => tr.legs.some((l) => l.transit && Date.parse(l.departure) >= tau));
    if (nextRideTrip < 0) return { plan: null, diff: null, explanation: ['Non ci sono altre corse in programma da perdere.'], hypothetical: true };
    const leg = plan.trips[nextRideTrip].legs.find((l) => l.transit && Date.parse(l.departure) >= tau)!;
    explanation.push(`Ipotesi: perdete ${leg.transit![0].routeShort} delle ${hhmm(leg.departure)} da ${leg.from.label}. Si riparte dalla fermata con la corsa successiva.`);
    // si arriva alla fermata di salita e si riparte un minuto dopo la partenza persa
    if (nextRideTrip === pastCount && !currentStop) {
      const tr = plan.trips[nextRideTrip];
      const before = tr.legs.filter((l) => Date.parse(l.arrival) <= Date.parse(leg.departure) && l !== leg && l.mode !== 'wait');
      resumeTrip = { legs: [...(resumeTrip?.legs.filter((l) => !before.includes(l)) ?? []), ...before] };
      pos = leg.from; t = Date.parse(leg.departure) + 60_000;
    } else {
      // la corsa persa è in una tratta successiva: il futuro verrà ricalcolato da lì
      t = Math.max(t, Date.parse(leg.departure) + 60_000);
    }
  }

  // --------------------------------------------------------- futuro
  let futureStops = future0;
  if (decision.kind === 'skip' && decision.stopId && future0.some((s) => s.id === decision.stopId)) {
    const s = future0.find((x) => x.id === decision.stopId)!;
    if (lockedIds.has(s.id)) explanation.push(`${s.name} è bloccata: sbloccatela prima di saltarla.`);
    else { futureStops = future0.filter((x) => x.id !== decision.stopId); explanation.push(`Saltate ${s.name}.`); }
  }
  const past: PastState = { stops: pastStops, trips: resumeTrip ? pastTrips : pastTrips, t, pos };
  const reoptimize = ['replace', 'reduce_budget', 'less_walking', 'indoor', 'whatif_rain', 'whatif_unavailable'].includes(decision.kind);
  let steps: PlannedStep[] = [];
  const estimator = new Estimator(data.router);
  if (reoptimize) {
    const report = selectCandidates(ctx, data);
    const usedPlaces = new Set([...pastStops.map((s) => s.placeId)]);
    const target = decision.stopId ? future0.find((s) => s.id === decision.stopId) : null;
    if ((decision.kind === 'replace' || decision.kind === 'whatif_unavailable') && target) {
      usedPlaces.add(target.placeId);
      explanation.push(decision.kind === 'whatif_unavailable' ? `Ipotesi: ${target.name} non è disponibile.` : `Sostituite ${target.name}.`);
    }
    const locked = futureStops.filter((s) => lockedIds.has(s.id));
    const lockedCands = locked.map((s) => candidateFromStop(ctx, data, s)).filter(Boolean) as Candidate[];
    let pool = report.candidates.filter((c) => !usedPlaces.has(c.place.id));
    if (decision.kind === 'replace' && decision.placeId) {
      const chosen = pool.find((c) => c.place.id === decision.placeId);
      if (chosen) { chosen.mustSee = true; chosen.base += 20; }
    }
    // i luoghi già previsti restano preferiti per non stravolgere il programma
    const planned = new Set(futureStops.map((s) => s.placeId));
    for (const c of pool) if (planned.has(c.place.id) && !(target && c.place.id === target.placeId)) c.base += 3;
    for (const lc of lockedCands) { pool = pool.filter((c) => c.place.id !== lc.place.id); pool.push({ ...lc, mustSee: true, base: 50 }); }
    if (decision.kind === 'reduce_budget') {
      ctx.cap = decision.budget != null ? (req.budget.per === 'person' ? decision.budget * ctx.people : decision.budget) : ctx.cap;
      ctx.strictBudget = true;
    }
    const lunch = pastStops.some((s) => s.category === 'restaurant' && Number(hhmm(s.start).slice(0, 2)) <= 14);
    const dinner = pastStops.some((s) => s.category === 'restaurant' && Number(hhmm(s.start).slice(0, 2)) >= 18);
    const nodes = search(ctx, pool, estimator, {
      theme: THEMES[plan.theme] ?? THEMES.classico, width: 12, maxStops: Math.max(1, futureStops.length + 1),
      init: { t, pos, used: new Set(), usedPlaces, lunch, dinner },
    });
    const best = nodes.find((n) => lockedCands.every((lc) => n.seq.some((s) => s.cand.place.id === lc.place.id))) ?? nodes[0];
    steps = best ? best.seq.map((s) => ({ cand: s.cand, stayMin: Math.round((s.end - s.start) / 60_000) })) : [];
  } else {
    for (const s of futureStops) {
      const c = candidateFromStop(ctx, data, s);
      if (!c) continue;
      c.mustSee = lockedIds.has(s.id);
      steps.push({ cand: c, stayMin: s.stayMin });
    }
  }
  // costruzione con correzioni: le tappe non più praticabili vengono tolte (tranne le bloccate)
  let result = buildPlan(ctx, data, steps, { theme: plan.theme, themeLabel: plan.title.split(':')[0], branchId: `br-${Date.now().toString(36)}`, parentPlanId: plan.id, version: plan.version + 1 }, { ...past, stops: [...pastStops], trips: [...pastTrips] });
  let attempts = 0;
  while (!result.plan && attempts < 6) {
    attempts++;
    const pr = result.problem!;
    const idx = pr.stepIndex >= steps.length ? steps.map((s, i) => ({ s, i })).reverse().find(({ s }) => !s.cand.mustSee)?.i ?? -1 : pr.stepIndex;
    if (idx < 0 || steps[idx]?.cand.mustSee) {
      explanation.push(`Impossibile: ${pr.message}.`);
      // piano invalido esplicito: passato + ciò che si riesce a mantenere
      return { plan: null, diff: null, explanation: [...explanation, 'Il nuovo programma violerebbe una tappa bloccata o il rientro. Provate un\'altra modifica o sbloccate la tappa.'], hypothetical };
    }
    explanation.push(`${steps[idx].cand.place.name} esce dal programma: ${pr.message}.`);
    steps = steps.filter((_, i) => i !== idx);
    result = buildPlan(ctx, data, steps, { theme: plan.theme, themeLabel: plan.title.split(':')[0], branchId: `br-${Date.now().toString(36)}`, parentPlanId: plan.id, version: plan.version + 1 }, { ...past, stops: [...pastStops], trips: [...pastTrips] });
  }
  if (!result.plan) return { plan: null, diff: null, explanation: [...explanation, 'Nessun proseguimento praticabile.'], hypothetical };
  let np = result.plan;
  // tratta interrotta: la parte già percorsa precede la nuova tratta
  if (resumeTrip && np.trips[pastCount]) {
    const tr = np.trips[pastCount];
    np.trips[pastCount] = { ...tr, legs: [...resumeTrip.legs, ...tr.legs], departure: resumeTrip.legs[0]?.departure ?? tr.departure, from: plan.trips[pastCount].from, fromStop: plan.trips[pastCount].fromStop, cost: [...resumeTrip.legs.flatMap((l) => l.cost ?? []), ...tr.cost] };
    np = finalize(ctx, data, np.stops, np.trips, np.end, { theme: plan.theme, themeLabel: plan.title.split(':')[0], branchId: np.branchId, parentPlanId: plan.id, version: plan.version + 1 });
  }
  np.title = plan.title;
  np.whyThis = plan.whyThis;
  np.narrative = { lines: narrate(np), source: 'deterministic' };
  np.plannerSource = 'deterministic';
  np.decisions = plan.decisions.filter((d) => Date.parse(d.at) < tau).map((d) => ({ ...d, chosen: d.chosen ?? 'keep' }));
  np.hypothetical = hypothetical ? [...(plan.hypothetical ?? []), WHATIF_LABEL[decision.kind] ?? decision.kind] : plan.hypothetical;
  // spese già maturate: invariate (stesso passato)
  const diff = diffPlans(plan, np);
  if (diff.lostConnections.length) explanation.push(`Coincidenze perse: ${diff.lostConnections.join('; ')}.`);
  if (diff.returnChange) explanation.push(diff.returnChange);
  return { plan: np, diff, explanation, hypothetical };
}
