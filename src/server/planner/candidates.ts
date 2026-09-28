/**
 * Selezione dei candidati: luoghi ed eventi realmente candidabili nella finestra,
 * filtrati dai vincoli rigidi (evitare, mobilità, età, esclusioni) e valutati
 * sulle preferenze. Ogni esclusione è contata per spiegare un eventuale fallimento.
 */
import { DateTime } from 'luxon';
import type { Place, EventOccurrence, PriceEstimate, CatalogEvent } from '../../shared/types.ts';
import { openIntervals } from '../../shared/calendar.ts';
import { groupCost, sumCosts } from '../../shared/pricing.ts';
import { localToInstant } from '../../shared/time.ts';
import type { PlanContext } from './context.ts';
import type { DataStore } from '../data.ts';

export interface Candidate {
  key: string;
  kind: 'place' | 'event';
  place: Place;
  event?: CatalogEvent;
  occ?: EventOccurrence;
  /** punteggio di preferenza (indipendente dal tempo) */
  base: number;
  stay: { min: number; typ: number; max: number };
  fixedStart?: number;
  fixedEnd?: number;
  prices: PriceEstimate[];
  costMin: number;
  costMax: number;
  unknownEssential: boolean;
  meal: 'lunch' | 'dinner' | 'any' | 'snack' | null;
  reasons: string[];
  warnings: string[];
  dataQuality: 'verified' | 'osm' | 'editorial' | 'estimate' | 'unknown' | 'demo';
  hoursKnown: boolean;
  indoor: boolean;
  mustSee: boolean;
  themes: string[];
  exit?: Place;
  /** tappa bloccata dall'utente a orario fisso */
  locked?: boolean;
}

export interface CandidateReport { candidates: Candidate[]; excluded: Record<string, number>; excludedMustSee: { id: string; reason: string }[] }

const THEME_OF: Record<string, string[]> = {
  park: ['natura', 'lago'], museum: ['cultura'], culture: ['cultura'], viewpoint: ['panorami'], walk: ['lago', 'natura'],
  lido: ['lago'], lift: ['panorami'], restaurant: ['gusto'], cafe: ['gusto'], bar: ['serata', 'gusto'], nightlife: ['serata'],
  market: ['gusto'], show: ['serata', 'cultura'], workshop: ['famiglia', 'cultura'], seasonal: [], church: ['cultura'],
  village: ['lago', 'borghi'], hike: ['panorami', 'natura'], playground: ['famiglia'], gelato: ['gusto', 'famiglia'],
  summit: ['panorami'], attraction: ['famiglia'],
};

function dataQuality(p: Place, hoursKnown: boolean): Candidate['dataQuality'] {
  if (p.demo) return 'demo';
  if (!hoursKnown) return 'unknown';
  const hs = p.schedules[0]?.evidence.status;
  if (hs === 'verified') return 'verified';
  if (hs === 'osm') return 'osm';
  if (hs === 'estimate') return 'estimate';
  return 'editorial';
}

export function selectCandidates(ctx: PlanContext, data: DataStore): CandidateReport {
  const excluded: Record<string, number> = {};
  const excludedMustSee: { id: string; reason: string }[] = [];
  const req = ctx.req;
  const from = DateTime.fromMillis(ctx.start), to = DateTime.fromMillis(ctx.end);
  const out: Candidate[] = [];
  const mustSee = new Set(req.mustSee);
  const minKidAge = ctx.kids ? Math.min(...req.people.filter((p) => p.kind === 'child').map((p) => (p.ageBand === '0-5' ? 3 : p.ageBand === '6-11' ? 6 : p.ageBand === '12-15' ? 12 : p.ageBand === '16-17' ? 16 : 6))) : 99;
  const exclude = (reason: string, id: string) => {
    excluded[reason] = (excluded[reason] ?? 0) + 1;
    if (mustSee.has(id)) excludedMustSee.push({ id, reason });
    return null;
  };

  const baseChecks = (p: Place, id: string, extra?: { noise?: string; alcohol?: string; minAge?: number; indoor?: boolean; tags?: string[] }): string | null => {
    if (req.exclude.includes(p.id)) return 'escluso dall\'utente';
    const tags = new Set([...(p.tags ?? []), ...(extra?.tags ?? [])]);
    const noise = extra?.noise ?? p.suitability.noise;
    const alcohol = extra?.alcohol ?? p.suitability.alcohol;
    if (ctx.avoid.has('nightclub') && (p.category === 'nightlife' || tags.has('discoteca'))) return 'discoteche escluse';
    if (ctx.avoid.has('noisy') && noise === 'loud') return 'luoghi rumorosi esclusi';
    if (ctx.avoid.has('alcohol') && alcohol === 'central') return 'locali centrati sull\'alcol esclusi';
    if (ctx.avoid.has('crowds') && p.suitability.habitualAtmosphere === 'usually_lively') return 'luoghi abitualmente affollati esclusi';
    if (ctx.avoid.has('climbs') && (p.category === 'hike' || p.mountain?.kind === 'hike' || p.accessibility.stairs === 'many')) return 'salite ed escursioni escluse';
    if (ctx.avoid.has('heights') && (p.category === 'summit' || p.id.startsWith('swing'))) return 'luoghi in quota esclusi';
    if (req.mobility.stroller && p.accessibility.stroller === 'no') return 'non adatto al passeggino';
    if (req.mobility.wheelchair && (p.accessibility.wheelchair === 'no' || p.accessibility.stroller === 'no')) return 'non accessibile in sedia a rotelle';
    if ((req.mobility.stroller || req.mobility.wheelchair) && p.mountain?.kind === 'hike') return 'escursione non praticabile con passeggino';
    const minAge = extra?.minAge ?? p.suitability.minAge;
    if (minAge && minAge > minKidAge) return 'età minima non compatibile';
    if (ctx.youngKids && p.mountain?.kind === 'hike') return 'escursione impegnativa con bambini piccoli';
    if (req.pace === 'relaxed' && p.mountain?.kind === 'hike') return 'escursione non compatibile con ritmo rilassato';
    if (req.environment === 'indoor' && !(extra?.indoor ?? p.suitability.indoor) && p.suitability.weather !== 'any' && !mustSee.has(p.id)) return 'solo attività al coperto richieste';
    if (req.environment === 'outdoor' && (extra?.indoor ?? p.suitability.indoor) && !['restaurant', 'cafe', 'bar', 'gelato'].includes(p.category) && !mustSee.has(p.id)) return 'solo attività all\'aperto richieste';
    void id;
    return null;
  };

  const score = (p: Place, moods: string[], occasions: string[], tags: string[]): { s: number; reasons: string[] } => {
    let s = 1;
    const reasons: string[] = [];
    const mm = moods.filter((m) => ctx.moods.has(m));
    if (mm.length) { s += mm.length * 2.2; reasons.push(`Adatto all'atmosfera: ${mm.map(moodLabel).join(', ')}`); }
    if (occasions.includes(ctx.req.occasion)) { s += 1.2; reasons.push(`Indicato per ${occasionLabel(ctx.req.occasion)}`); }
    const interests = new Set(ctx.req.people.flatMap((x) => x.interests.map((i) => i.toLowerCase())));
    const hit = tags.filter((t) => interests.has(t));
    if (hit.length) { s += hit.length * 1.5; reasons.push(`Interessi del gruppo: ${hit.join(', ')}`); }
    if (ctx.hints.mentionedPlaces.includes(p.id)) { s += 4; reasons.push('Citato nella vostra richiesta'); }
    if (ctx.kids && (tags.includes('famiglia') || tags.includes('bambini'))) { s += 1.5; reasons.push('Adatto ai bambini'); }
    if (ctx.rainLikely && p.suitability.indoor) { s += 1.5; reasons.push('Al coperto: previsione di pioggia'); }
    if (ctx.rainLikely && p.suitability.weather === 'dry' && ctx.req.rainTolerance === 'low') s -= 3;
    if (ctx.req.environment === 'indoor' && p.suitability.indoor) s += 1;
    if (ctx.req.environment === 'outdoor' && !p.suitability.indoor) s += 1;
    if (ctx.hints.cheap || ctx.avoid.has('expensive')) {
      const free = p.prices.every((x) => x.unit === 'free' || (x.max ?? 99) === 0);
      if (free) s += 1;
    }
    if (ctx.moods.has('lively') && p.suitability.habitualAtmosphere === 'usually_lively') { s += 1; reasons.push('Luogo abitualmente animato (caratteristica curata, non affluenza reale)'); }
    if (ctx.moods.has('chill') && p.suitability.habitualAtmosphere === 'usually_quiet') s += 0.5;
    if (ctx.req.diet.includes('vegetarian') && p.diet.includes('vegetarian')) { s += 1; reasons.push('Opzioni vegetariane segnalate (da verificare)'); }
    return { s, reasons };
  };

  // ------------------------------------------------------------------ luoghi
  for (const p of data.places.values()) {
    if (p.plannable === 'no') { exclude('non pianificabile', p.id); continue; }
    if (p.plannable === 'events') continue; // entra solo tramite evento
    const bad = baseChecks(p, p.id);
    if (bad) { exclude(bad, p.id); continue; }
    const pub = p.schedules.find((s) => s.kind === 'public');
    const hoursKnown = !!pub;
    if (pub) {
      const ivs = openIntervals(pub, from, to);
      const minStay = p.visit.min * 60_000;
      const usable = ivs.some((iv) => Math.min(iv.end.toMillis(), ctx.end) - Math.max(iv.start.toMillis(), ctx.start) >= minStay);
      if (!usable) { exclude('chiuso nella finestra richiesta', p.id); continue; }
    } else {
      // orari sconosciuti: candidabile solo di giorno e segnalato come incerto
      const h0 = from.hour, h1 = to.hour + (ctx.crossesMidnight ? 24 : 0);
      if (h1 <= 9 || h0 >= 20) { exclude('orari sconosciuti fuori dalle ore diurne', p.id); continue; }
    }
    if (p.category === 'lido' && ['10', '11', '12', '01', '02', '03', '04'].includes(ctx.req.date.slice(5, 7)) && !hoursKnown) { exclude('stagione balneare conclusa', p.id); continue; }
    const costs = groupCost(p.prices, ctx.req.people, new Date(ctx.start).toISOString(), p.id);
    const t = sumCosts(costs, ctx.people);
    if (ctx.avoid.has('expensive') && t.perPersonMin > 60) { exclude('troppo costoso', p.id); continue; }
    if (ctx.strictBudget && ctx.cap != null && t.min > ctx.cap) { exclude('supera il budget da solo', p.id); continue; }
    const { s, reasons } = score(p, p.moods, p.suitability.occasions, p.tags);
    const stay = stayFor(ctx, p.visit.min, p.visit.typical, p.visit.max);
    const warnings: string[] = [];
    if (!hoursKnown) warnings.push('Orari non disponibili: da verificare prima di andare');
    if (t.unknownEssential) warnings.push('Costo non disponibile');
    if ((ctx.req.mobility.stroller || ctx.req.mobility.wheelchair) && p.accessibility.stroller === 'unknown') warnings.push('Accessibilità con passeggino non verificata');
    if (p.mountain && !p.mountain.conditionsVerified && p.mountain.kind === 'hike') warnings.push('Condizioni del sentiero non verificate');
    let base = s;
    if (!hoursKnown) base -= 1.2;
    if (t.unknownEssential) base -= 0.8;
    if (ctx.req.mobility.stroller && p.accessibility.stroller === 'unknown') base -= 1.5;
    const themes = [...(THEME_OF[p.category] ?? [])];
    if (p.tags.includes('lago')) themes.push('lago');
    if (p.moods.includes('views')) themes.push('panorami');
    if (p.tags.includes('famiglia') || p.tags.includes('bambini')) themes.push('famiglia');
    if (p.municipality.name !== 'Lugano' || /Brè|Gandria|Carona|Castagnola|Collina|Montagnola|Melide|Paradiso|Monte/.test(p.area ?? '')) themes.push('fuori-centro');
    out.push({
      key: p.id, kind: 'place', place: p, base, stay, prices: p.prices, costMin: t.min, costMax: t.max, unknownEssential: t.unknownEssential > 0,
      meal: p.meal ?? null, reasons, warnings, dataQuality: dataQuality(p, hoursKnown), hoursKnown, indoor: p.suitability.indoor,
      mustSee: mustSee.has(p.id), themes: [...new Set(themes)],
      exit: p.walkTo ? data.place(p.walkTo) : undefined,
    });
  }

  // ------------------------------------------------------------------ eventi
  for (const occ of data.occurrences(from, to)) {
    const ev = data.events.get(occ.eventId)!;
    const p = data.place(occ.placeId);
    if (!p) continue;
    if (occ.status !== 'scheduled') { exclude(occ.status === 'cancelled' ? 'evento annullato in quella data' : occ.status === 'sold_out' ? 'evento esaurito' : 'evento rinviato', ev.id); continue; }
    const s0 = Date.parse(occ.start), e0 = occ.end ? Date.parse(occ.end) : s0 + 90 * 60_000;
    if (s0 < ctx.start + 10 * 60_000 || s0 > ctx.end - 30 * 60_000) { exclude('evento fuori dalla finestra', ev.id); continue; }
    const bad = baseChecks(p, ev.id, { noise: ev.suitability.noise, alcohol: ev.suitability.alcohol, minAge: ev.suitability.minAge, indoor: ev.suitability.indoor, tags: ev.tags });
    if (bad) { exclude(bad, ev.id); continue; }
    const costs = groupCost(ev.prices, ctx.req.people, occ.start, ev.id);
    const t = sumCosts(costs, ctx.people);
    if (ctx.strictBudget && ctx.cap != null && t.min > ctx.cap) { exclude('supera il budget da solo', ev.id); continue; }
    const { s, reasons } = score(p, ev.moods, ev.suitability.occasions, ev.tags);
    reasons.unshift(`Evento in programma: ${fmt(s0)}${occ.end ? `–${fmt(e0)}` : ''}${occ.timeCertain ? '' : ' (orario non confermato)'}`);
    const durMin = Math.round((Math.min(e0, ctx.end) - s0) / 60000);
    const warnings = ['Evento dimostrativo (fixture): non è l\'agenda reale'];
    if (!occ.timeCertain) warnings.push('Orario dell\'evento non confermato');
    if (t.unknownEssential) warnings.push('Costo non disponibile');
    out.push({
      key: `${ev.id}@${occ.sessionId}`, kind: 'event', place: p, event: ev, occ,
      base: s + 2 - (occ.timeCertain ? 0 : 1.5), stay: { min: Math.min(durMin, 45), typ: durMin, max: durMin },
      fixedStart: s0, fixedEnd: Math.min(e0, ctx.end), prices: ev.prices, costMin: t.min, costMax: t.max, unknownEssential: t.unknownEssential > 0,
      meal: null, reasons, warnings, dataQuality: 'demo', hoursKnown: occ.timeCertain, indoor: ev.suitability.indoor,
      mustSee: mustSee.has(ev.id), themes: ['serata', ...(THEME_OF[p.category] ?? [])],
    });
  }
  // tappe bloccate a orario fisso (prenotazioni): obbligatorie, all'ora indicata dall'utente
  for (const l of req.locked) {
    const p = l.placeId ? data.place(l.placeId) : undefined;
    if (!p) { excludedMustSee.push({ id: l.placeId ?? l.eventId ?? '?', reason: 'tappa bloccata non presente nel catalogo' }); continue; }
    let s0 = localToInstant(req.date, l.start).toMillis();
    if (s0 < ctx.start) s0 = localToInstant(req.date, l.start, 1).toMillis();
    let e0 = localToInstant(req.date, l.end).toMillis();
    while (e0 <= s0) e0 += 24 * 3600_000;
    if (s0 < ctx.start || e0 > ctx.end) { excludedMustSee.push({ id: p.id, reason: `orario bloccato ${l.start}–${l.end} fuori dalla finestra della giornata` }); continue; }
    const existing = out.findIndex((c) => c.place.id === p.id && c.kind === 'place');
    const base = existing >= 0 ? out[existing] : null;
    const costs = groupCost(p.prices, ctx.req.people, new Date(s0).toISOString(), p.id);
    const t = sumCosts(costs, ctx.people);
    const lockedCand: Candidate = {
      key: `${p.id}@locked`, kind: 'place', place: p, base: 50, stay: { min: (e0 - s0) / 60000, typ: (e0 - s0) / 60000, max: (e0 - s0) / 60000 },
      fixedStart: s0, fixedEnd: e0, prices: p.prices, costMin: t.min, costMax: t.max, unknownEssential: t.unknownEssential > 0,
      meal: base?.meal ?? p.meal ?? null, reasons: ['Tappa bloccata da voi (prenotazione o impegno)', ...(base?.reasons ?? [])],
      warnings: base ? base.warnings : ['Inclusa su vostra richiesta anche se non rispetta alcuni filtri'], dataQuality: base?.dataQuality ?? 'editorial', hoursKnown: p.schedules.length > 0,
      indoor: p.suitability.indoor, mustSee: true, themes: base?.themes ?? [], locked: true,
    };
    if (existing >= 0) out.splice(existing, 1);
    out.push(lockedCand);
    mustSee.delete(p.id);
  }
  for (const m of mustSee) {
    if (!out.some((c) => c.place.id === m || c.event?.id === m) && !excludedMustSee.some((x) => x.id === m)) {
      const p = data.place(m);
      excludedMustSee.push({ id: m, reason: p ? 'non disponibile nella finestra richiesta' : 'non presente nel catalogo' });
    }
  }
  return { candidates: out, excluded, excludedMustSee };
}

export function stayFor(ctx: PlanContext, min: number, typ: number, max: number) {
  const f = ctx.req.pace === 'relaxed' ? 1.2 : ctx.req.pace === 'intense' ? 0.85 : 1;
  const typical = Math.round(Math.min(max, Math.max(min, typ * f * (ctx.req.mobility.frequentBreaks ? 1.1 : 1))));
  return { min, typ: typical, max };
}

function fmt(ms: number) { return DateTime.fromMillis(ms, { zone: 'Europe/Zurich' }).toFormat('HH:mm'); }
export function moodLabel(m: string) { return ({ chill: 'chill', lively: 'vivace', romantic: 'romantica', cultural: 'culturale', nature: 'natura', views: 'panorami', food: 'gastronomia', adventure: 'avventura leggera' } as Record<string, string>)[m] ?? m; }
export function occasionLabel(o: string) { return ({ friends: 'uscite fra amici', date: 'un appuntamento', family: 'famiglie', sightseeing: 'visite turistiche', birthday: 'un compleanno', guests: 'accogliere ospiti', leisure: 'il tempo libero', custom: 'la vostra occasione' } as Record<string, string>)[o] ?? o; }
