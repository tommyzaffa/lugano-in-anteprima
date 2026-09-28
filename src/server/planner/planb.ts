/**
 * Piano B per meteo (§12): per ogni tappa all'aperto propone fino a due
 * alternative al coperto vicine, aperte nella stessa fascia oraria secondo i
 * dati del catalogo, compatibili con le esigenze del gruppo. Tempi a piedi sulla
 * rete pedonale reale. Non è una previsione: è un'alternativa pronta se piove.
 */
import { DateTime } from 'luxon';
import type { Plan, PlanStop, Place } from '../../shared/types.ts';
import { TZ } from '../../shared/types.ts';
import { checkVisit } from '../../shared/calendar.ts';
import { groupCost, sumCosts } from '../../shared/pricing.ts';
import { profileFromRequest } from '../routing/walk.ts';
import type { DataStore } from '../data.ts';

export interface PlanBOption {
  placeId: string; name: string; category: string;
  walkMin: number; walkM: number;
  hours: 'open' | 'unknown'; hoursDetail: string;
  costMin: number | null; costMax: number | null; costUnknown: boolean;
  booking: string;
}
export interface PlanBItem { stopId: string; stopName: string; start: string; end: string; reason: string; near?: string; options: PlanBOption[]; none?: string }
export interface PlanB { items: PlanBItem[]; note: string }

const OUTDOOR = new Set(['park', 'viewpoint', 'walk', 'lido', 'hike', 'summit', 'village', 'playground', 'market', 'lift']);
const MAX_WALK_MIN = 25;
const MEAL = new Set(['restaurant', 'cafe']);
const VISIT = new Set(['museum', 'culture', 'church', 'show', 'workshop', 'attraction', 'market', 'seasonal']);

/** Una tappa è esposta al meteo? */
export function weatherExposed(s: PlanStop, p: Place | undefined): boolean {
  if (s.kind === 'pause') return false;
  if (!p) return false;
  if (p.suitability.indoor) return false;
  return p.suitability.weather === 'dry' || OUTDOOR.has(p.category) || !!p.mountain;
}

export function planB(plan: Plan, data: DataStore): PlanB {
  const req = plan.request;
  const profile = profileFromRequest(req);
  const inPlan = new Set(plan.stops.map((s) => s.placeId));
  const excluded = new Set(req.exclude ?? []);
  const kidsAges = req.people.filter((p) => p.kind === 'child').map((p) => Number((p.ageBand ?? '0').split('-')[0]));
  const items: PlanBItem[] = [];
  const used = new Set<string>();

  plan.stops.forEach((s, idx) => {
    const p = data.place(s.placeId);
    if (!weatherExposed(s, p)) return;
    const start = DateTime.fromISO(s.start, { zone: TZ });
    const prev = idx > 0 ? plan.stops[idx - 1] : null;
    const startPoint = plan.trips[0]?.from ?? { lon: s.lon, lat: s.lat };
    const byPrev = prev ? { pt: prev.exit ?? { lon: prev.lon, lat: prev.lat }, near: `vicino a ${prev.name}` } : null;
    const byStart = { pt: startPoint, near: 'vicino al punto di partenza' };
    // in montagna con la pioggia si resta in basso: si cerca attorno alla tappa precedente
    // e poi alla partenza; altrove attorno alla tappa stessa e poi alla precedente
    const origins = p!.mountain ? [byPrev, byStart].filter((x) => !!x)
      : [{ pt: { lon: p!.entrance.lon, lat: p!.entrance.lat }, near: '' }, byPrev].filter((x) => !!x);
    const pool = [...data.places.values()].filter((q) => {
      if (!q.suitability.indoor || q.plannable !== 'yes' || inPlan.has(q.id) || excluded.has(q.id)) return false;
      if (req.mobility.wheelchair && q.accessibility.wheelchair === 'no') return false;
      if (req.mobility.stroller && q.accessibility.stroller === 'no') return false;
      if (q.suitability.minAge != null && kidsAges.some((a) => a < q.suitability.minAge!)) return false;
      // un pasto si sostituisce con un pasto; una visita con una visita (niente bar, locali notturni o sale giochi)
      const meal = MEAL.has(s.category);
      if (meal ? !MEAL.has(q.category) : !VISIT.has(q.category)) return false;
      return true;
    });
    let options: PlanBOption[] = [];
    let nearLabel = '';
    for (const o of origins) {
      options = findOptions(o.pt, s, pool);
      nearLabel = o.near;
      if (options.length) break;
    }
    // prima gli orari confermati, poi i più vicini; si evita di ripetere la stessa alternativa
    options.sort((a, b) => (a.hours === b.hours ? 0 : a.hours === 'open' ? -1 : 1) || a.walkMin - b.walkMin);
    const pick = [...options.filter((o) => !used.has(o.placeId)), ...options.filter((o) => used.has(o.placeId))].slice(0, 2);
    for (const o of pick) used.add(o.placeId);
    items.push({
      stopId: s.id, stopName: s.name, start: s.start, end: s.end,
      reason: p!.mountain ? 'in montagna la pioggia cambia sentieri e panorami: meglio restare in basso' : 'tappa all\'aperto',
      ...(nearLabel && pick.length ? { near: nearLabel } : {}),
      options: pick,
      ...(pick.length ? {} : { none: `Nessun luogo al coperto del catalogo, aperto in quella fascia, a meno di ${MAX_WALK_MIN} minuti a piedi.` }),
    });
  });

  function findOptions(from: { lon: number; lat: number }, s: PlanStop, pool: Place[]): PlanBOption[] {
    const start = DateTime.fromISO(s.start, { zone: TZ });
    const near = pool
      .map((q) => ({ q, d: Math.hypot((q.lon - from.lon) * 77300, (q.lat - from.lat) * 111200) }))
      .filter((x) => x.d < 2200)
      .sort((a, b) => a.d - b.d)
      .slice(0, 10);
    const options: PlanBOption[] = [];
    for (const { q } of near) {
      const stay = Math.min(s.stayMin, q.visit.typical);
      const sched = q.schedules.find((x) => x.kind === 'public');
      let hours: PlanBOption['hours'] = 'unknown';
      let hoursDetail = 'Orari non disponibili: verificare prima di andare.';
      if (sched) {
        const chk = checkVisit(sched, start, stay);
        if (!chk.ok) continue;
        hours = 'open';
        hoursDetail = `Aperto in quella fascia secondo il catalogo (${chk.interval ? `${chk.interval.start.toFormat('HH:mm')}–${chk.interval.end.toFormat('HH:mm')}` : 'orario del giorno'}).`;
      }
      const w = data.router.walk(from, { lon: q.entrance.lon, lat: q.entrance.lat }, profile, MAX_WALK_MIN * 60 * 1.5);
      if (!w || w.seconds > MAX_WALK_MIN * 60) continue;
      const cost = sumCosts(groupCost(q.prices, req.people, s.start, `planb-${q.id}`), req.people.length);
      options.push({
        placeId: q.id, name: q.name, category: q.category,
        walkMin: Math.max(1, Math.round(w.seconds / 60)), walkM: Math.round(w.lengthM),
        hours, hoursDetail,
        costMin: cost.unknownEssential ? null : cost.min, costMax: cost.unknownEssential ? null : cost.max, costUnknown: cost.unknownEssential > 0,
        booking: q.booking.required,
      });
    }
    return options;
  }
  return {
    items,
    note: 'Alternative pronte in caso di pioggia, calcolate sui dati del catalogo: non sono una previsione meteo né una disponibilità verificata in tempo reale.',
  };
}
