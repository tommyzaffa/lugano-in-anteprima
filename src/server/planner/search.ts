/**
 * Generazione di programmi candidati: ricerca a fascio (beam search) nel tempo.
 * Ogni tema (lago, panorami, cultura, gusto, natura, famiglia, serata) pesa in
 * modo diverso le categorie, per ottenere alternative realmente differenti.
 * Usa solo identificativi del catalogo; la validazione precisa avviene dopo.
 */
import { DateTime } from 'luxon';
import type { LegPoint } from '../../shared/types.ts';
import { checkVisit } from '../../shared/calendar.ts';
import { localMinuteOfDay } from '../../shared/time.ts';
import { TZ } from '../../shared/types.ts';
import type { PlanContext } from './context.ts';
import { checkAbort } from './context.ts';
import type { Candidate } from './candidates.ts';
import type { Estimator } from './estimate.ts';

export interface Step {
  cand: Candidate;
  arrive: number;
  start: number;
  end: number;
  travelSec: number;
  mode: 'walk' | 'transit';
}

export interface SearchNode {
  t: number;
  pos: LegPoint;
  seq: Step[];
  used: Set<string>;
  usedPlaces: Set<string>;
  costMin: number;
  costMax: number;
  walkM: number;
  score: number;
  lunch: boolean;
  dinner: boolean;
  snacks: number;
  cats: Record<string, number>;
}

export interface Theme { id: string; label: string; boost: string[]; weight: number }

export const THEMES: Record<string, Theme> = {
  classico: { id: 'classico', label: 'Il meglio per voi', boost: [], weight: 1 },
  lago: { id: 'lago', label: 'Lago e borghi', boost: ['lago', 'borghi'], weight: 1.7 },
  panorami: { id: 'panorami', label: 'Panorami dall\'alto', boost: ['panorami'], weight: 1.8 },
  cultura: { id: 'cultura', label: 'Arte e storia', boost: ['cultura'], weight: 1.8 },
  gusto: { id: 'gusto', label: 'Sapori e serata', boost: ['gusto', 'serata'], weight: 1.6 },
  natura: { id: 'natura', label: 'Natura tranquilla', boost: ['natura'], weight: 1.7 },
  famiglia: { id: 'famiglia', label: 'A misura di bambini', boost: ['famiglia'], weight: 1.8 },
  serata: { id: 'serata', label: 'Serata in città', boost: ['serata', 'gusto'], weight: 1.6 },
  fuori: { id: 'fuori', label: 'Oltre il centro', boost: ['fuori-centro'], weight: 1.6 },
};

const MEAL = { lunch: [11 * 60 + 45, 14 * 60 + 15], dinner: [18 * 60 + 30, 21 * 60 + 30] } as const;
const minuteOfDay = localMinuteOfDay;

export function expectedMeals(ctx: PlanContext): { lunch: boolean; dinner: boolean } {
  const overlap = (a: number, b: number) => {
    const s = DateTime.fromMillis(ctx.start, { zone: TZ });
    const dayStart = s.startOf('day').toMillis();
    const ws = dayStart + a * 60_000, we = dayStart + b * 60_000;
    return Math.max(0, Math.min(ctx.end, we) - Math.max(ctx.start, ws)) / 60_000;
  };
  const noMoney = ctx.strictBudget && (ctx.cap ?? 0) < 15 * ctx.people;
  return { lunch: !noMoney && overlap(12 * 60, 13 * 60 + 45) >= 75, dinner: !noMoney && overlap(19 * 60, 21 * 60) >= 90 };
}

export interface SearchOptions {
  theme: Theme;
  width: number;
  maxStops: number;
  init?: Partial<SearchNode>;
  /** candidati da escludere in questa ricerca (per alternative/diversità) */
  banned?: Set<string>;
  /** penalità per luoghi già usati in altre alternative */
  penalize?: Map<string, number>;
  seed?: number;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}

export function search(ctx: PlanContext, cands: Candidate[], est: Estimator, opts: SearchOptions): SearchNode[] {
  const meals = expectedMeals(ctx);
  // penalità per minuto di spostamento: favorisce sequenze compatte, senza avanti e indietro
  const travelPenalty = ctx.req.pace === 'relaxed' ? 0.14 : ctx.req.pace === 'intense' ? 0.07 : 0.1;
  const rand = opts.seed ? rng(opts.seed) : null;
  const jitter = new Map(cands.map((c) => [c.key, rand ? rand() * 2.2 : 0]));
  const root: SearchNode = {
    t: ctx.start, pos: ctx.startPoint, seq: [], used: new Set(), usedPlaces: new Set(), costMin: 0, costMax: 0, walkM: 0, score: 0,
    lunch: false, dinner: false, snacks: 0, cats: {}, ...opts.init,
  } as SearchNode;
  const mustSee = cands.filter((c) => c.mustSee);
  // un obbligo è soddisfatto da una qualsiasi occorrenza dello stesso evento o dallo stesso luogo
  const mustId = (c: Candidate) => c.event?.id ?? c.place.id;
  const mustIds = [...new Set(mustSee.map(mustId))];
  const satisfied = (n: SearchNode, id: string) => n.seq.some((st) => mustId(st.cand) === id);
  // obblighi a orario fisso (eventi, tappe bloccate): ogni nodo deve poterli ancora raggiungere
  const fixedMust = mustIds.map((id) => ({ id, occ: mustSee.filter((c) => mustId(c) === id && c.fixedStart != null) })).filter((x) => x.occ.length);
  const stillReachable = (n: SearchNode) => fixedMust.every(({ id, occ }) => satisfied(n, id) || occ.some((c) => {
    if (n.usedPlaces.has(c.place.id) && !n.seq.some((st) => st.cand.key === c.key)) return false;
    // limite ottimistico: in linea d'aria a 8 m/s (più veloce di qualsiasi combinazione di cammino e mezzi urbani)
    const d = Math.hypot((c.place.lon - n.pos.lon) * 77300, (c.place.lat - n.pos.lat) * 111200);
    return n.t + (d / 8) * 1000 <= c.fixedStart! - 5 * 60_000;
  }));
  const complete: SearchNode[] = [];
  let beam: SearchNode[] = [root];
  const finishScore = (n: SearchNode) => {
    let s = n.score;
    const used = n.seq.reduce((a, st) => a + (st.end - st.start), 0);
    s += (used / Math.max(1, ctx.end - ctx.start)) * 6;
    if (meals.lunch && !n.lunch) s -= 7;
    if (meals.dinner && !n.dinner) s -= 8;
    for (const id of mustIds) if (!satisfied(n, id)) s -= 1000;
    const idle = (ctx.end - n.t) / 60_000;
    if (idle > 120) s -= (idle - 120) / 60;
    return s;
  };
  for (let depth = 0; depth < opts.maxStops && beam.length; depth++) {
    checkAbort(ctx);
    const next: SearchNode[] = [];
    for (const node of beam) {
      const night = node.t >= ctx.duskAt;
      const o = night ? ctx.nightTravel : ctx.travel;
      const avail = cands.filter((c) => !node.used.has(c.key) && !node.usedPlaces.has(c.place.id) && !opts.banned?.has(c.key));
      if (!avail.length) continue;
      const estimates = est.toCandidates(node.pos, node.t, avail, o);
      const children: SearchNode[] = [];
      for (const c of avail) {
        const e = estimates.get(c.key);
        if (!e) continue;
        const arrive = node.t + e.sec * 1000;
        let start = arrive, end: number;
        let stayMin = c.stay.typ;
        const act = est.activity(c, o);
        if (act) stayMin = Math.max(stayMin, Math.round((act.sec * 1.2) / 60));
        if (c.fixedStart != null) {
          if (arrive > c.fixedStart - 5 * 60_000) continue;
          // attesa eccessiva: le tappe bloccate e gli obblighi possono attendere (con penalità), le altre no
          if (!c.locked && !c.mustSee && c.fixedStart - arrive > 50 * 60_000) continue;
          start = c.fixedStart; end = c.fixedEnd!;
        } else {
          const sched = c.place.schedules.find((s) => s.kind === 'public');
          if (sched) {
            let chk = checkVisit(sched, arrive, stayMin);
            if (!chk.ok && chk.status === 'closed' && chk.nextOpen && chk.nextOpen.toMillis() - arrive <= 35 * 60_000) {
              start = chk.nextOpen.toMillis();
              chk = checkVisit(sched, chk.nextOpen, stayMin);
            }
            if (!chk.ok && chk.status === 'closes_before_end') {
              stayMin = c.stay.min;
              chk = checkVisit(sched, start, stayMin);
            }
            if (!chk.ok) continue;
          }
          end = start + stayMin * 60_000;
        }
        // pasti: ristoranti solo in fascia pranzo/cena, un pasto per fascia
        // un pasto vero si fa al ristorante; bar e caffè contano come pausa
        const isMealPlace = c.place.category === 'restaurant' && (c.meal === 'lunch' || c.meal === 'dinner' || c.meal === 'any');
        let mealBonus = 0;
        let lunch = node.lunch, dinner = node.dinner, snacks = node.snacks;
        if (isMealPlace) {
          const m = minuteOfDay(start);
          const inLunch = m >= MEAL.lunch[0] && m <= MEAL.lunch[1];
          const inDinner = m >= MEAL.dinner[0] && m <= MEAL.dinner[1];
          if (inLunch && c.meal !== 'dinner' && !lunch) { lunch = true; mealBonus = meals.lunch ? 5 : 1.5; }
          else if (inDinner && c.meal !== 'lunch' && !dinner) { dinner = true; mealBonus = meals.dinner ? 6 : 1.5; }
          else continue;
        }
        if (c.meal === 'snack' || (c.meal && !isMealPlace)) { if (snacks >= 2) continue; snacks++; }
        if (end > ctx.end) continue;
        const exitPt = c.exit ? c.exit.entrance : c.place.entrance;
        const ret = est.returnEstimate(exitPt, ctx.endPoint, o);
        if (end + (ret + 5 * 60) * 1000 > ctx.end) continue;
        const costMin = node.costMin + c.costMin, costMax = node.costMax + c.costMax;
        if (ctx.strictBudget && ctx.cap != null && costMin + (e.rides ? 2.3 * ctx.people : 0) > ctx.cap) continue;
        const walkM = node.walkM + (e.mode === 'walk' ? e.walkM : e.walkM) + (act?.lengthM ?? 0);
        if (ctx.req.maxWalkKm && walkM > ctx.req.maxWalkKm * 1000 * 1.05) continue;
        // punteggio del passo
        let s = c.base + (jitter.get(c.key) ?? 0);
        if (opts.theme.boost.some((b) => c.themes.includes(b))) s *= opts.theme.weight;
        if (c.mustSee) s += 9;
        s += Math.min(stayMin, 120) / 60;
        s -= (e.sec / 60) * travelPenalty;
        // ritorno verso una zona già visitata: penalità se ci si avvicina molto a una tappa precedente (non l'ultima)
        for (const prev of node.seq.slice(0, -1)) {
          const d = Math.hypot((prev.cand.place.lon - c.place.lon) * 77300, (prev.cand.place.lat - c.place.lat) * 111200);
          if (d < 400) { s -= 1.2; break; }
        }
        s -= ((start - arrive) / 60_000) * 0.05;
        s -= e.rides * 0.3;
        s += mealBonus;
        const cat = c.place.category;
        const catCount = node.cats[cat] ?? 0;
        if (node.seq.length && node.seq[node.seq.length - 1].cand.place.category === cat) s -= 2;
        s -= catCount * 1.2;
        if (c.meal === 'snack' && snacks > 1) s -= 1.5;
        if (ctx.cap != null && !ctx.strictBudget && costMax > ctx.cap) s -= Math.min(6, (costMax - ctx.cap) / Math.max(10, ctx.cap) * 6);
        if (ctx.hints.cheap || ctx.avoid.has('expensive')) s -= (c.costMax / ctx.people) * 0.04;
        const comfortableKm = ctx.req.pace === 'relaxed' ? 3 : ctx.req.pace === 'intense' ? 9 : 5.5;
        if (walkM / 1000 > comfortableKm) s -= (walkM / 1000 - comfortableKm) * 0.8;
        if (c.place.mountain?.kind === 'hike' && !(ctx.moods.has('adventure') || ctx.moods.has('nature') || c.mustSee || ctx.hints.mentionedPlaces.includes(c.place.id))) s -= 4;
        if (opts.penalize?.has(c.place.id)) s -= opts.penalize.get(c.place.id)!;
        const step: Step = { cand: c, arrive, start, end, travelSec: e.sec, mode: e.mode };
        const child: SearchNode = {
          t: end, pos: { label: (c.exit ?? c.place).name, lon: exitPt.lon, lat: exitPt.lat, placeId: (c.exit ?? c.place).id },
          seq: [...node.seq, step], used: new Set([...node.used, c.key]), usedPlaces: new Set([...node.usedPlaces, c.place.id, ...(c.exit ? [c.exit.id] : [])]),
          costMin, costMax, walkM, score: node.score + s, lunch, dinner, snacks, cats: { ...node.cats, [cat]: catCount + 1 },
        };
        // niente rami che rendono irraggiungibile un obbligo a orario fisso
        if (fixedMust.length && !stillReachable(child)) continue;
        children.push(child);
      }
      // diversità: al massimo 6 figli per nodo
      children.sort((a, b) => b.score - a.score);
      next.push(...children.slice(0, 6));
    }
    next.sort((a, b) => b.score - a.score);
    // de-duplica sequenze con lo stesso insieme di luoghi
    const seen = new Set<string>();
    beam = [];
    for (const n of next) {
      const k = n.seq.map((s) => s.cand.key).sort().join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      beam.push(n);
      if (beam.length >= opts.width) break;
    }
    for (const n of beam) complete.push(n);
  }
  return complete.map((n) => ({ ...n, score: finishScore(n) })).sort((a, b) => b.score - a.score);
}
