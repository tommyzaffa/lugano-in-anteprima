/**
 * Spiegazioni sintetiche, compromessi, confronto fra rami e narrazione breve.
 * La narrazione usa esclusivamente il piano validato (nessun luogo inventato).
 * Le battute sono semplificazioni di gioco e non derivano da stereotipi.
 */
import type { Plan, NarrativeLine, PlanDiff, InfeasibleResult, GroupRequest } from '../../shared/types.ts';
import { hhmm, fmtDuration } from '../../shared/time.ts';
import { fmtRange } from '../../shared/pricing.ts';
import { modeLabel } from '../routing/router.ts';
import type { CandidateReport } from './candidates.ts';
import type { PlanContext } from './context.ts';

function pick<T>(arr: T[], seed: number): T { return arr[Math.abs(seed) % arr.length]; }
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

export function narrate(plan: Plan): NarrativeLine[] {
  const people = plan.request.people;
  const lines: NarrativeLine[] = [];
  const speaker = (i: number, interestHint?: string) => {
    if (interestHint) {
      const p = people.find((x) => x.interests.some((it) => interestHint.includes(it.toLowerCase())));
      if (p) return p.name;
    }
    return people[Math.abs(i) % people.length].name;
  };
  const first = plan.trips[0];
  if (first) lines.push({ at: first.departure, speaker: speaker(0), text: pick(['Si parte! Prima tappa: ' + (plan.stops[0]?.name ?? 'il rientro') + '.', `Pronti? Ci aspetta ${plan.stops[0]?.name ?? 'una bella giornata'}.`, 'Zaino in spalla, andiamo.'], hash(plan.id)) });
  plan.stops.forEach((s, i) => {
    const trip = plan.trips[i];
    const ride = trip?.legs.find((l) => l.transit);
    if (ride) {
      const r = ride.transit![0];
      const txt = r.mode === 'funicular' ? pick(['Si sale in funicolare: tenetevi forte!', 'Funicolare: la città si rimpicciolisce sotto di noi.'], i)
        : r.mode === 'boat' ? pick(['In battello: il lago da qui è un\'altra cosa.', 'Si naviga! Occhio agli spruzzi.'], i)
        : r.mode === 'train' ? 'Due fermate di treno e ci siamo.'
        : pick([`Prendiamo il ${modeLabel(r.mode).toLowerCase()} ${r.routeShort} per ${r.headsign}.`, `${modeLabel(r.mode)} ${r.routeShort}: comodi comodi.`], i);
      lines.push({ at: ride.departure, speaker: speaker(i + 1), text: txt });
    } else if (trip && trip.summary.mainMode === 'hike') {
      lines.push({ at: trip.departure, speaker: speaker(i + 1), text: `Da qui è un'escursione vera: ${fmtDuration(trip.summary.durationMin)} e ${trip.summary.ascentM} m di salita (stima).` });
    } else if (trip && trip.summary.walkM > 1500) {
      lines.push({ at: trip.departure, speaker: speaker(i + 1), text: `Camminiamo un po': circa ${(trip.summary.walkM / 1000).toFixed(1)} km.` });
    }
    const cat = s.category;
    const byCat: Record<string, string[]> = {
      museum: ['Qui dentro si potrebbe restare ore.', 'Un museo: si parla sottovoce.'],
      culture: ['Che architettura!', 'Diamo un\'occhiata al programma.'],
      summit: ['Guardate che vista!', 'Da quassù si vede tutto il lago.'],
      viewpoint: ['Foto di gruppo?', 'Che panorama.'],
      restaurant: ['Si mangia!', 'Ho già deciso cosa ordinare.'],
      cafe: ['Una pausa ci voleva.', 'Caffè per tutti?'],
      gelato: ['Gelato: il momento più atteso.', 'Io prendo due gusti.'],
      bar: ['Un brindisi?', 'Due chiacchiere e si riparte.'],
      park: ['Un po\' di verde.', 'Sediamoci un attimo sul prato.'],
      walk: ['Si passeggia con calma.', 'Che bella passeggiata.'],
      village: ['Che vicoli!', 'Sembra di essere tornati indietro nel tempo.'],
      church: ['Entriamo un momento.', 'Guardate gli affreschi.'],
      show: ['Si comincia tra poco!', 'Posti presi.'],
      attraction: ['Tutto in miniatura, come noi!', 'Che dettagli.'],
    };
    const txt = s.kind === 'event' ? pick(['Arrivati giusti per l\'inizio.', 'Eccoci, sta per cominciare.'], i) : pick(byCat[cat] ?? ['Eccoci arrivati.'], hash(s.id));
    lines.push({ at: s.start, speaker: speaker(i + 2, s.name.toLowerCase()), text: txt, stopId: s.id });
  });
  const ret = plan.trips.length > plan.stops.length ? plan.trips[plan.trips.length - 1] : null;
  if (ret) lines.push({ at: ret.departure, speaker: speaker(plan.stops.length + 3), text: pick(['Si torna: bella giornata.', `Rientro previsto alle ${hhmm(ret.arrival)}.`, 'Ultimo tratto, poi a casa.'], hash(ret.id)) });
  return lines.slice(0, 24);
}

export function whyThis(plan: Plan, ctx: PlanContext, reasonsByStop: Map<string, string[]>): string[] {
  const out: string[] = [];
  const all = plan.stops.flatMap((s) => reasonsByStop.get(s.id) ?? s.reasons);
  const counts = new Map<string, number>();
  for (const r of all) counts.set(r, (counts.get(r) ?? 0) + 1);
  out.push(...[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r));
  const outside = plan.stops.filter((s) => isOutsideCenter(s.lon, s.lat)).length;
  if (outside >= 1) out.push(`Esce dal centro: ${plan.stops.filter((s) => isOutsideCenter(s.lon, s.lat)).map((s) => s.name.replace(/\s*\(.*?\)\s*/g, '')).slice(0, 3).join(', ')}`);
  if (plan.trips.some((t) => t.legs.some((l) => l.mode === 'funicular'))) out.push('Include una funicolare con orario ufficiale');
  if (plan.trips.some((t) => t.legs.some((l) => l.mode === 'boat'))) out.push('Include un tratto in battello');
  if (ctx.req.pace === 'relaxed' && plan.totals.walkM < 3000) out.push('Poco cammino, adatto a un ritmo rilassato');
  return [...new Set(out)].slice(0, 5);
}

/** Compromessi relativi fra le alternative proposte. */
export function tradeoffs(plans: Plan[]): void {
  if (plans.length < 2) return;
  const minCost = Math.min(...plans.map((p) => p.totals.cost.perPersonMax));
  const minWalk = Math.min(...plans.map((p) => p.totals.walkM));
  const earliest = Math.min(...plans.map((p) => Date.parse(p.totals.endsAt)));
  for (const p of plans) {
    const t: string[] = [];
    if (p.totals.cost.perPersonMax === minCost) t.push('La più economica fra le proposte');
    else t.push(`Fino a ${fmtRange(Math.round((p.totals.cost.perPersonMax - minCost) * 10) / 10, Math.round((p.totals.cost.perPersonMax - minCost) * 10) / 10)} a persona in più della più economica`);
    if (p.totals.walkM === minWalk) t.push('Il minor cammino');
    else t.push(`+${((p.totals.walkM - minWalk) / 1000).toFixed(1)} km a piedi rispetto alla più comoda`);
    if (Date.parse(p.totals.endsAt) > earliest + 20 * 60_000) t.push(`Rientro più tardi (${hhmm(p.totals.endsAt)})`);
    if (p.totals.ascentM > 200) t.push(`Dislivello importante: ${p.totals.ascentM} m in salita (stima)`);
    if (p.feasibility === 'uncertain') t.push('Alcuni dati sono da verificare');
    if (p.totals.cost.unknownEssential) t.push('Alcuni costi sono sconosciuti');
    p.tradeoffs = t;
  }
}

export function diffPlans(a: Plan, b: Plan): PlanDiff {
  const names = (p: Plan) => p.stops.map((s) => s.name);
  const added = names(b).filter((n) => !names(a).includes(n));
  const removed = names(a).filter((n) => !names(b).includes(n));
  const moved: PlanDiff['moved'] = [];
  for (const s of b.stops) {
    const o = a.stops.find((x) => x.name === s.name);
    if (o && Math.abs(Date.parse(o.start) - Date.parse(s.start)) >= 60_000) moved.push({ name: s.name, fromTime: hhmm(o.start), toTime: hhmm(s.start) });
  }
  const retA = a.trips.length > a.stops.length ? a.trips[a.trips.length - 1] : null;
  const retB = b.trips.length > b.stops.length ? b.trips[b.trips.length - 1] : null;
  const lost: string[] = [];
  for (const t of a.trips) for (const l of t.legs) {
    if (!l.transit) continue;
    const kept = b.trips.some((tb) => tb.legs.some((lb) => lb.transit && lb.transit[0].tripId === l.transit![0].tripId && lb.departure === l.departure));
    const future = Date.parse(l.departure) > Date.parse(b.stops[0]?.start ?? b.totals.startsAt);
    if (!kept && future) lost.push(`${modeLabel(l.mode)} ${l.transit[0].routeShort} delle ${hhmm(l.departure)} da ${l.from.label}`);
  }
  const notes: string[] = [];
  let returnChange: string | undefined;
  if (retA && retB) {
    const d = (Date.parse(retB.arrival) - Date.parse(retA.arrival)) / 60000;
    if (Math.abs(d) >= 1 || retA.summary.label !== retB.summary.label) returnChange = `Rientro: ${retA.summary.label} alle ${hhmm(retA.arrival)} → ${retB.summary.label} alle ${hhmm(retB.arrival)}${d ? ` (${d > 0 ? '+' : ''}${Math.round(d)} min)` : ''}`;
  }
  if (b.feasibility === 'invalid') notes.push('Il nuovo piano viola almeno un vincolo.');
  return {
    endTimeDeltaMin: Math.round((Date.parse(b.totals.endsAt) - Date.parse(a.totals.endsAt)) / 60000),
    costDeltaMin: Math.round((b.totals.cost.min - a.totals.cost.min) * 100) / 100,
    costDeltaMax: Math.round((b.totals.cost.max - a.totals.cost.max) * 100) / 100,
    walkDeltaM: b.totals.walkM - a.totals.walkM,
    ascentDeltaM: b.totals.ascentM - a.totals.ascentM,
    added, removed, moved, returnChange, lostConnections: lost.slice(0, 5), notes,
  };
}

/** Spiega perché non esiste un piano e propone modifiche esplicite (mai applicate da sole). */
export function explainInfeasible(ctx: PlanContext, report: CandidateReport | null, lastProblems: string[]): InfeasibleResult {
  const reasons: InfeasibleResult['reasons'] = [];
  const suggestions: InfeasibleResult['suggestions'] = [];
  const req = ctx.req;
  const winMin = (ctx.end - ctx.start) / 60000;
  if (winMin < 45) {
    reasons.push({ code: 'window_short', message: `La finestra di ${Math.round(winMin)} minuti è troppo breve per un'uscita con rientro.` });
  }
  if (report) {
    for (const m of report.excludedMustSee) reasons.push({ code: 'must_see', message: `Tappa obbligatoria non possibile: ${m.name ?? m.id} (${m.reason}).` });
    if (report.excludedMustSee.length) suggestions.push({ id: 'drop_must', label: 'Rendi facoltative le tappe obbligatorie', patch: { mustSee: [] } });
    if (report.candidates.length === 0) {
      const top = Object.entries(report.excluded).sort((a, b) => b[1] - a[1]).slice(0, 3);
      reasons.push({ code: 'no_candidates', message: `Nessuna attività compatibile. Esclusioni principali: ${top.map(([r, n]) => `${r} (${n})`).join('; ')}.` });
    }
  }
  if (ctx.strictBudget && ctx.cap != null) {
    reasons.push({ code: 'budget', message: `Con un limite rigido di CHF ${req.budget.amount} ${req.budget.per === 'person' ? 'a persona' : 'in totale'} non si trova una combinazione con costi noti entro il tetto.` });
    suggestions.push({ id: 'budget_soft', label: 'Tratta il budget come preferenza', patch: { budget: { ...req.budget, strict: false } } });
    suggestions.push({ id: 'budget_up', label: `Aumenta il budget a CHF ${Math.ceil((req.budget.amount ?? 0) * 1.5 + 10)}`, patch: { budget: { ...req.budget, amount: Math.ceil((req.budget.amount ?? 0) * 1.5 + 10) } } });
  }
  if (req.maxWalkKm) suggestions.push({ id: 'walk_up', label: `Accetta fino a ${req.maxWalkKm + 3} km a piedi`, patch: { maxWalkKm: req.maxWalkKm + 3 } });
  if (req.maxAscentM != null) suggestions.push({ id: 'ascent_up', label: 'Rimuovi il limite di dislivello', patch: { maxAscentM: undefined } });
  const [eh, em] = req.endTime.split(':').map(Number);
  const later = `${String((eh + 2) % 24).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  suggestions.push({ id: 'later', label: `Termina alle ${later}`, patch: { endTime: later } });
  if (!req.transport.bus || !req.transport.boat || !req.transport.funicular || !req.transport.train) suggestions.push({ id: 'transport', label: 'Consenti tutti i mezzi pubblici', patch: { transport: { walk: true, bus: true, train: true, boat: true, funicular: true } } });
  if (req.avoid.length) suggestions.push({ id: 'avoid', label: 'Allenta i filtri «da evitare»', patch: { avoid: [] } });
  if (req.locked.length) reasons.push({ code: 'locked', message: 'Le tappe bloccate potrebbero non essere compatibili fra loro o con la finestra.' });
  if (lastProblems.length) reasons.push({ code: 'validation', message: `Ultimi problemi riscontrati: ${[...new Set(lastProblems)].slice(0, 3).join(' · ')}` });
  if (!reasons.length) reasons.push({ code: 'combination', message: 'Nessuna combinazione rispetta insieme durata, orari, rientro e vincoli indicati.' });
  return { reasons, suggestions: dedupe(suggestions) };
}

function dedupe(s: InfeasibleResult['suggestions']) {
  const seen = new Set<string>();
  return s.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

export function requestSummary(r: GroupRequest): string {
  return `${r.people.length} person${r.people.length > 1 ? 'e' : 'a'}, ${r.date} ${r.startTime}–${r.endTime}`;
}

/** Oltre ~1,3 km da Piazza della Riforma: fuori dal centro cittadino. */
export function isOutsideCenter(lon: number, lat: number): boolean {
  const dx = (lon - 8.9513) * 77300, dy = (lat - 46.0039) * 111200;
  return Math.hypot(dx, dy) > 1300;
}
