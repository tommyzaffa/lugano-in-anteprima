/**
 * Orchestratore del pianificatore (§8.2 del brief):
 * 1. valida la richiesta e normalizza i vincoli;
 * 2. recupera luoghi ed eventi candidabili;
 * 3–4. genera programmi candidati per temi diversi (identificativi del catalogo);
 * 5–6. valida ogni candidato e lo corregge o scarta con tentativi limitati;
 * 7. restituisce fino a tre alternative distinte, con compromessi e dati mancanti;
 * 8. narrazione breve basata solo sul piano validato.
 */
import type { GroupRequest, Plan, InfeasibleResult, Contradiction, WeatherSnapshot, DecisionPoint } from '../../shared/types.ts';
import { hhmm } from '../../shared/time.ts';
import type { DataStore } from '../data.ts';
import { parseFreeText, findContradictions, applyResolutions, type TextHints } from './text.ts';
import { buildContext, checkAbort, type PlanContext } from './context.ts';
import { selectCandidates, type Candidate, type CandidateReport } from './candidates.ts';
import { Estimator } from './estimate.ts';
import { search, THEMES, type Theme, type SearchNode } from './search.ts';
import { buildPlan, type PlannedStep, type PastState } from './build.ts';
import { narrate, whyThis, tradeoffs, explainInfeasible, diffPlans } from './explain.ts';

export type PlanResponse =
  | { status: 'ok'; alternatives: Plan[]; understood: string[]; notices: string[]; plannerSource: 'ai-live' | 'deterministic'; stats: Record<string, number> }
  | { status: 'needs_resolution'; contradictions: Contradiction[]; understood: string[] }
  | { status: 'infeasible'; infeasible: InfeasibleResult; understood: string[]; notices: string[] };

export interface AiHooks {
  interpret?: (req: GroupRequest, hints: TextHints, signal?: AbortSignal) => Promise<Partial<TextHints> | null>;
  propose?: (ctx: PlanContext, cands: Candidate[], signal?: AbortSignal) => Promise<{ theme: string; placeKeys: string[] }[] | null>;
  narrate?: (plan: Plan, signal?: AbortSignal) => Promise<Plan['narrative']['lines'] | null>;
}

export interface PlanDeps {
  data: DataStore;
  weather?: (req: GroupRequest) => Promise<WeatherSnapshot | null>;
  ai?: AiHooks | null;
  progress?: (step: string) => void;
  signal?: AbortSignal;
}

export function chooseThemes(ctx: PlanContext): Theme[] {
  const list: Theme[] = [THEMES.classico];
  const m = ctx.moods;
  const evening = new Date(ctx.start).getTime() >= ctx.duskAt - 60 * 60_000;
  if (ctx.kids) list.push(THEMES.famiglia);
  if (m.has('views') || m.has('adventure')) list.push(THEMES.panorami);
  if (m.has('cultural')) list.push(THEMES.cultura);
  if (m.has('nature')) list.push(THEMES.natura);
  if (m.has('food') || m.has('lively') || evening) list.push(evening ? THEMES.serata : THEMES.gusto);
  if (m.has('romantic') || m.has('chill')) list.push(THEMES.lago);
  list.push(THEMES.fuori, THEMES.lago, THEMES.panorami, THEMES.cultura);
  const seen = new Set<string>();
  return list.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))).slice(0, 5);
}

function jaccard(a: Set<string>, b: Set<string>) {
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / Math.max(1, new Set([...a, ...b]).size);
}

function stepsOf(n: SearchNode): PlannedStep[] {
  return n.seq.map((s) => ({ cand: s.cand, stayMin: Math.round((s.end - s.start) / 60_000) }));
}

/** Valida e corregge (tentativi limitati) una sequenza. */
export function validateWithFixes(ctx: PlanContext, data: DataStore, steps0: PlannedStep[], theme: Theme, problems: string[], past?: PastState, meta?: { branchId?: string; parentPlanId?: string; version?: number }): Plan | null {
  let steps = [...steps0];
  let shrunk = false;
  for (let attempt = 0; attempt < 5 && steps.length; attempt++) {
    checkAbort(ctx);
    const r = buildPlan(ctx, data, steps, { theme: theme.id, themeLabel: theme.label, ...meta }, past);
    if (r.plan) {
      let plan = r.plan;
      if (plan.feasibility === 'invalid') {
        const bad = plan.checks.find((c) => c.status === 'violated');
        problems.push(bad ? `${bad.label}: ${bad.detail}` : 'vincolo violato');
        // prova a togliere la tappa più costosa o più lontana non obbligatoria
        const removable = steps.map((s, i) => ({ s, i })).filter(({ s }) => !s.cand.mustSee);
        if (!removable.length) return plan;
        const worst = bad?.id === 'budget' ? removable.sort((a, b) => b.s.cand.costMax - a.s.cand.costMax)[0] : removable[removable.length - 1];
        steps = steps.filter((_, i) => i !== worst.i);
        continue;
      }
      // riempi il tempo libero finale prolungando le soste (una volta)
      const retArr = Date.parse(plan.totals.endsAt);
      const slackMin = (ctx.end - retArr) / 60_000;
      if (slackMin > 40 && steps.length && !past) {
        const extendable = steps.filter((s) => s.cand.fixedStart == null);
        const room = extendable.reduce((a, s) => a + Math.max(0, s.cand.stay.max - s.stayMin), 0);
        if (room > 10) {
          const give = Math.min(room, slackMin - 25);
          const stretched = steps.map((s) => s.cand.fixedStart != null ? s : { ...s, stayMin: Math.round(s.stayMin + (Math.max(0, s.cand.stay.max - s.stayMin) / room) * give) });
          const r2 = buildPlan(ctx, data, stretched, { theme: theme.id, themeLabel: theme.label, ...meta }, past);
          if (r2.plan && r2.plan.feasibility !== 'invalid') plan = r2.plan;
        }
      }
      return plan;
    }
    const p = r.problem!;
    problems.push(p.message);
    if (p.code === 'late_return' && !shrunk) {
      shrunk = true;
      steps = steps.map((s) => (s.cand.fixedStart != null ? s : { ...s, stayMin: s.cand.stay.min }));
      continue;
    }
    const idx = p.stepIndex >= steps.length ? steps.map((s, i) => ({ s, i })).reverse().find(({ s }) => !s.cand.mustSee)?.i ?? -1 : p.stepIndex;
    if (idx < 0 || steps[idx].cand.mustSee) return null;
    steps = steps.filter((_, i) => i !== idx);
  }
  return null;
}

export async function planAlternatives(reqIn: GroupRequest, deps: PlanDeps): Promise<PlanResponse> {
  const { data } = deps;
  const progress = deps.progress ?? (() => {});
  const t0 = Date.now();
  progress('Leggo la vostra richiesta');
  const placeNames = [...data.places.values()].map((p) => ({ id: p.id, name: p.name }));
  let hints = parseFreeText(reqIn.freeText, placeNames);
  let plannerSource: 'ai-live' | 'deterministic' = 'deterministic';
  let aiInterpreted = false;
  const notices: string[] = [];
  if (deps.ai?.interpret && reqIn.freeText) {
    try {
      const extra = await deps.ai.interpret(reqIn, hints, deps.signal);
      if (extra) {
        hints = { ...hints, ...extra, moods: [...new Set([...hints.moods, ...(extra.moods ?? [])])], avoid: [...new Set([...hints.avoid, ...(extra.avoid ?? [])])], mentionedPlaces: [...new Set([...hints.mentionedPlaces, ...(extra.mentionedPlaces ?? [])])].filter((id) => data.places.has(id)), understood: [...hints.understood, ...(extra.understood ?? [])] };
        aiInterpreted = true;
      }
    } catch (e) {
      notices.push('Interpretazione AI non disponibile: usata quella deterministica.');
    }
  }
  const contradictions = findContradictions(reqIn, hints);
  if (contradictions.length) return { status: 'needs_resolution', contradictions, understood: hints.understood };
  const req = applyResolutions(reqIn, hints);
  let weather: WeatherSnapshot | null = null;
  if (deps.weather) {
    progress('Controllo le previsioni meteo');
    try { weather = await deps.weather(req); } catch { weather = null; }
    if (weather?.status === 'out_of_horizon') notices.push('Previsioni meteo non ancora disponibili per quella data.');
    if (weather?.status === 'demo') notices.push('Meteo dimostrativo: non è una previsione reale.');
  }
  const ctx = buildContext(req, hints, weather, progress, deps.signal);
  if (!data.transit.covers(req.date)) notices.push(`La data è fuori dal periodo dell'orario importato (${data.transit.feedRange.start}–${data.transit.feedRange.end}): i mezzi pubblici non sono calcolabili.`);
  if (ctx.end - ctx.start < 45 * 60_000) {
    return { status: 'infeasible', infeasible: explainInfeasible(ctx, null, []), understood: hints.understood, notices };
  }
  progress('Cerco attività compatibili');
  const report = selectCandidates(ctx, data);
  if (!report.candidates.length || report.excludedMustSee.length) {
    return { status: 'infeasible', infeasible: explainInfeasible(ctx, report, []), understood: hints.understood, notices };
  }
  // limita il numero di candidati per contenere le combinazioni (i migliori per punteggio + obbligatori)
  const sorted = [...report.candidates].sort((a, b) => b.base - a.base);
  const pool = sorted.filter((c, i) => c.mustSee || c.kind === 'event' || i < 40);
  progress('Verifico i collegamenti');
  const est = new Estimator(data.router);
  const themes = chooseThemes(ctx);
  const seed = req.surprise ? hashSeed(JSON.stringify(req) + Date.now()) : undefined;
  const sequences: { node: SearchNode; theme: Theme; source: 'ai' | 'search' }[] = [];
  // proposte AI (facoltative): solo identificativi esistenti, poi validazione
  if (deps.ai?.propose) {
    try {
      const props = await deps.ai.propose(ctx, pool, deps.signal);
      for (const p of props ?? []) {
        const cands = p.placeKeys.map((k) => pool.find((c) => c.key === k)).filter(Boolean) as Candidate[];
        if (cands.length !== p.placeKeys.length || !cands.length) { notices.push('Una proposta AI citava luoghi non validi ed è stata scartata.'); continue; }
        const theme = THEMES[p.theme] ?? THEMES.classico;
        // tempi provvisori: la validazione precisa ricalcola tutto
        let t = ctx.start;
        const seq = cands.map((c) => { const st = { cand: c, arrive: t, start: t, end: t + c.stay.typ * 60_000, travelSec: 0, mode: 'walk' as const }; t = st.end + 15 * 60_000; return st; });
        sequences.push({ node: { t, pos: ctx.startPoint, seq, used: new Set(), usedPlaces: new Set(), costMin: 0, costMax: 0, walkM: 0, score: 1000, lunch: false, dinner: false, snacks: 0, cats: {} }, theme, source: 'ai' });
        plannerSource = 'ai-live';
      }
    } catch { notices.push('Proposte AI non disponibili: usato il pianificatore deterministico.'); }
  }
  const penalize = new Map<string, number>();
  for (const theme of themes) {
    checkAbort(ctx);
    const nodes = search(ctx, pool, est, { theme, width: 14, maxStops: 7, penalize, seed });
    for (const n of nodes.slice(0, 3)) sequences.push({ node: n, theme, source: 'search' });
    const best = nodes[0];
    if (best) for (const s of best.seq) penalize.set(s.cand.place.id, (penalize.get(s.cand.place.id) ?? 0) + 1.5);
  }
  progress('Controllo orari, rientro e budget');
  const accepted: Plan[] = [];
  const problems: string[] = [];
  const reasonsByStop = new Map<string, string[]>();
  sequences.sort((a, b) => b.node.score - a.node.score);
  // prima un piano per tema, poi i migliori restanti
  const ordered = [...sequences.filter((s) => s.source === 'ai'), ...themes.map((t) => sequences.find((s) => s.theme.id === t.id && s.source === 'search')).filter(Boolean) as typeof sequences, ...sequences];
  const tried = new Set<string>();
  for (const s of ordered) {
    if (accepted.length >= 3) break;
    const key = s.node.seq.map((x) => x.cand.key).join('>');
    if (tried.has(key) || !s.node.seq.length) continue;
    tried.add(key);
    if (Date.now() - t0 > 18000) { notices.push('Ricerca interrotta per limite di tempo: proposte parziali.'); break; }
    const plan = validateWithFixes(ctx, data, stepsOf(s.node), s.theme, problems);
    if (!plan || plan.feasibility === 'invalid' || !plan.stops.length) continue;
    const set = new Set(plan.stops.map((x) => x.placeId));
    if (accepted.some((a) => jaccard(new Set(a.stops.map((x) => x.placeId)), set) > 0.5)) continue;
    if (accepted.some((a) => a.theme === plan.theme) && accepted.length < 2 && ordered.length > accepted.length + 3) {
      // preferisci temi diversi finché possibile
    }
    for (const st of plan.stops) reasonsByStop.set(st.id, st.reasons);
    plan.plannerSource = s.source === 'ai' ? 'ai-live' : 'deterministic';
    accepted.push(plan);
  }
  if (!accepted.length) {
    return { status: 'infeasible', infeasible: explainInfeasible(ctx, report, problems), understood: hints.understood, notices };
  }
  progress('Preparo le alternative');
  tradeoffs(accepted);
  for (const p of accepted) {
    p.whyThis = whyThis(p, ctx, reasonsByStop);
    p.narrative = { lines: narrate(p), source: 'deterministic' };
    if (aiInterpreted) p.aiNote = 'Preferenze del testo libero interpretate con AI; luoghi, orari e collegamenti verificati dal motore.';
    if (p.checks.some((c) => c.id.endsWith(':demo'))) p.missing.push('Gli eventi inclusi sono dimostrativi');
  }
  // punti di decisione pre-validati
  for (const p of accepted) {
    checkAbort(ctx);
    const d = buildDecision(ctx, data, p, pool, est);
    if (d) p.decisions = [d];
  }
  if (deps.ai?.narrate) {
    for (const p of accepted) {
      try {
        const lines = await deps.ai.narrate(p, deps.signal);
        if (lines?.length) p.narrative = { lines, source: 'ai' };
      } catch { /* resta la narrazione deterministica */ }
    }
  }
  plannerSource = accepted.some((p) => p.plannerSource === 'ai-live') ? 'ai-live' : 'deterministic';
  const stats = { candidates: report.candidates.length, sequences: sequences.length, estimatorCalls: est.calls, ms: Date.now() - t0 };
  return { status: 'ok', alternatives: accepted, understood: hints.understood, notices, plannerSource, stats };
}

/** Crea una scelta a metà programma con due proseguimenti entrambi validati. */
export function buildDecision(ctx: PlanContext, data: DataStore, plan: Plan, pool: Candidate[], est: Estimator): DecisionPoint | null {
  if (plan.stops.length < 2) return null;
  const k = Math.max(0, Math.floor((plan.stops.length - 1) / 2) - (plan.stops.length > 3 ? 0 : 0));
  const after = plan.stops[k];
  const nextStop = plan.stops[k + 1];
  if (!nextStop || nextStop.mandatory || nextStop.locked) return null;
  const past: PastState = {
    stops: plan.stops.slice(0, k + 1),
    trips: plan.trips.slice(0, k + 1),
    t: Date.parse(after.end),
    pos: after.exit ?? { label: after.name, lon: after.lon, lat: after.lat, placeId: after.placeId },
  };
  const usedPlaces = new Set(plan.stops.map((s) => s.placeId));
  const lunch = plan.stops.slice(0, k + 1).some((s) => isMealAt(s, 'lunch'));
  const dinner = plan.stops.slice(0, k + 1).some((s) => isMealAt(s, 'dinner'));
  const banned = new Set(pool.filter((c) => usedPlaces.has(c.place.id)).map((c) => c.key));
  const theme = THEMES[plan.theme] ?? THEMES.classico;
  const nodes = search(ctx, pool, est, {
    theme: THEMES.classico, width: 8, maxStops: Math.max(1, plan.stops.length - k - 1), banned,
    init: { t: past.t, pos: past.pos, used: new Set(banned), usedPlaces, lunch, dinner, costMin: 0, costMax: 0 },
  });
  const problems: string[] = [];
  for (const n of nodes.slice(0, 4)) {
    const steps = n.seq.slice(0).map((s) => ({ cand: s.cand, stayMin: Math.round((s.end - s.start) / 60_000) }));
    if (!steps.length) continue;
    const alt = validateWithFixes(ctx, data, steps, theme, problems, past, { branchId: plan.branchId, parentPlanId: plan.id });
    if (!alt || alt.feasibility === 'invalid') continue;
    alt.title = plan.title;
    alt.whyThis = plan.whyThis;
    alt.narrative = { lines: narrate(alt), source: 'deterministic' };
    const altNames = alt.stops.slice(k + 1).map((s) => s.name);
    const curNames = plan.stops.slice(k + 1).map((s) => s.name);
    return {
      id: `dec-${plan.id}`,
      afterStop: k,
      at: after.end,
      prompt: `Finito ${after.name.replace(/\s*\(.*?\)\s*/g, '')}: come proseguiamo?`,
      mandatory: true,
      options: [
        { id: 'keep', label: `Come previsto: ${curNames.slice(0, 2).join(', ')}`, detail: `Rientro alle ${hhmm(plan.totals.endsAt)} · ${plan.summary}`, plan: null, valid: true },
        { id: 'alt', label: `In alternativa: ${altNames.slice(0, 2).join(', ')}`, detail: `Rientro alle ${hhmm(alt.totals.endsAt)} · ${alt.summary}`, plan: alt, valid: true, diff: diffPlans(plan, alt) },
      ],
    };
  }
  return null;
}

function isMealAt(s: { category: string; start: string }, which: 'lunch' | 'dinner') {
  if (!['restaurant'].includes(s.category)) return false;
  const h = Number(hhmm(s.start).slice(0, 2));
  return which === 'lunch' ? h >= 11 && h <= 14 : h >= 18 && h <= 21;
}

function hashSeed(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
