/**
 * Motore di simulazione (logico, senza grafica).
 *
 * Lo stato logico è una funzione pura di (piano, ora simulata): posizione sulla
 * geometria reale, tappa e tratta correnti, spese maturate, decisioni in attesa.
 * Per questo saltare uno spostamento o una scena porta esattamente allo stesso
 * stato della riproduzione completa (stessa ora, posizione, costo, tappa) e
 * tornare a un checkpoint non duplica spese né eventi.
 * L'orologio simulato è separato dall'orologio reale e dal tempo di animazione.
 */
import type { Plan, LegMode, CostLine, DecisionPoint } from './types.ts';

export type SceneKind = 'depart' | 'walk' | 'wait' | 'board' | 'ride' | 'arrive' | 'activity' | 'pause' | 'decision' | 'end';

export interface Segment {
  id: string;
  kind: SceneKind;
  start: number;
  end: number;
  mode?: LegMode;
  tripIndex?: number;
  legIndex?: number;
  stopIndex?: number;
  label: string;
  /** geometria percorsa nel segmento (lon, lat) e distanze cumulative */
  coords?: [number, number][];
  cum?: number[];
  /** per le corse: istanti e posizioni delle fermate lungo la geometria */
  stopMarks?: { t: number; d: number; name: string }[];
  at?: [number, number];
}

export interface Checkpoint { id: string; t: number; label: string; kind: 'start' | 'arrive' | 'depart' | 'decision' | 'end' | 'board'; stopIndex?: number; decisionId?: string }

export interface Timeline {
  planId: string;
  planVersion: number;
  start: number;
  end: number;
  segments: Segment[];
  checkpoints: Checkpoint[];
  costs: CostLine[];
  decisions: DecisionPoint[];
}

export interface SimState {
  t: number;
  segIndex: number;
  scene: SceneKind;
  label: string;
  position: [number, number];
  bearing: number;
  mode: LegMode | null;
  tripIndex: number | null;
  legIndex: number | null;
  stopIndex: number | null;
  /** tappe completate */
  completedStops: number;
  spent: { min: number; max: number; unknown: number; lines: CostLine[] };
  /** decisione obbligatoria raggiunta ma non ancora presa */
  pendingDecision: DecisionPoint | null;
  progress: number; // 0..1 nel segmento
  finished: boolean;
}

// ------------------------------------------------------------------ geometria
export function hav(a: [number, number], b: [number, number]): number {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
export function cumulative(c: [number, number][]): number[] {
  const out = [0];
  for (let i = 1; i < c.length; i++) out.push(out[i - 1] + hav(c[i - 1], c[i]));
  return out;
}
export function pointAtDistance(c: [number, number][], cum: number[], d: number): { p: [number, number]; bearing: number } {
  if (c.length === 1) return { p: c[0], bearing: 0 };
  const total = cum[cum.length - 1];
  const x = Math.max(0, Math.min(total, d));
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] <= x) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo] || 1;
  const f = (x - cum[lo]) / seg;
  const a = c[lo], b = c[hi];
  const p: [number, number] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  const bearing = (Math.atan2((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]) * 180) / Math.PI;
  return { p, bearing };
}
function nearestIndexDistance(c: [number, number][], cum: number[], pt: [number, number], fromIdx: number): { idx: number; d: number } {
  let best = fromIdx, bd = Infinity;
  for (let i = fromIdx; i < c.length; i++) {
    const d = hav(c[i], pt);
    if (d < bd) { bd = d; best = i; }
  }
  return { idx: best, d: cum[best] };
}

const ms = (iso: string) => Date.parse(iso);

// ------------------------------------------------------------------ timeline
export function buildTimeline(plan: Plan): Timeline {
  const segs: Segment[] = [];
  const cps: Checkpoint[] = [];
  const t0 = ms(plan.totals.startsAt);
  cps.push({ id: 'cp-start', t: t0, label: 'Partenza', kind: 'start' });
  const push = (s: Omit<Segment, 'id'>) => { if (s.end < s.start) s.end = s.start; segs.push({ ...s, id: `seg-${segs.length}` }); };
  const stopCount = plan.stops.length;
  for (let i = 0; i < plan.trips.length; i++) {
    const trip = plan.trips[i];
    trip.legs.forEach((leg, li) => {
      const s = ms(leg.departure), e = ms(leg.arrival);
      if (leg.mode === 'wait') {
        push({ kind: 'wait', start: s, end: e, tripIndex: i, legIndex: li, label: `Attesa a ${leg.from.label}`, at: [leg.from.lon, leg.from.lat], mode: 'wait' });
        return;
      }
      const coords = leg.geometry.length >= 2 ? leg.geometry : [[leg.from.lon, leg.from.lat], [leg.to.lon, leg.to.lat]] as [number, number][];
      const cum = cumulative(coords);
      let stopMarks: Segment['stopMarks'];
      if (leg.transit?.[0]) {
        let from = 0;
        stopMarks = leg.transit[0].stops.map((st) => {
          const r = nearestIndexDistance(coords, cum, [st.lon, st.lat], from);
          from = r.idx;
          return { t: ms(st.time), d: r.d, name: st.name };
        });
        stopMarks[0].d = 0;
        stopMarks[stopMarks.length - 1].d = cum[cum.length - 1];
        cps.push({ id: `cp-board-${i}-${li}`, t: s, label: `Si sale: ${leg.transit[0].routeShort} ${leg.transit[0].headsign}`, kind: 'board', stopIndex: i });
      }
      const isRide = !!leg.transit;
      push({
        kind: isRide ? 'ride' : 'walk', start: s, end: e, mode: leg.mode, tripIndex: i, legIndex: li,
        label: isRide ? `${leg.transit![0].routeShort} → ${leg.to.label}` : `${leg.mode === 'hike' ? 'Escursione' : 'A piedi'} verso ${leg.to.label}`,
        coords, cum, stopMarks,
      });
    });
    if (i < stopCount) {
      const st = plan.stops[i];
      const arr = ms(st.arrival), start = ms(st.start), end = ms(st.end), dep = ms(st.departure);
      cps.push({ id: `cp-arrive-${i}`, t: arr, label: `Arrivo: ${st.name}`, kind: 'arrive', stopIndex: i });
      const at: [number, number] = [st.lon, st.lat];
      if (start > arr) push({ kind: 'wait', start: arr, end: start, stopIndex: i, label: `In attesa: ${st.name}`, at });
      if (st.activityPath) {
        const coords = st.activityPath.coords;
        push({ kind: 'activity', start, end, stopIndex: i, label: st.name, coords, cum: cumulative(coords), mode: st.activityPath.mode });
      } else {
        push({ kind: st.kind === 'pause' ? 'pause' : 'activity', start, end, stopIndex: i, label: st.name, at });
      }
      const exitAt: [number, number] = st.exit ? [st.exit.lon, st.exit.lat] : at;
      if (dep > end) push({ kind: 'wait', start: end, end: dep, stopIndex: i, label: `Tempo libero: ${st.exit?.label ?? st.name}`, at: exitAt });
      for (const d of plan.decisions) if (d.afterStop === i && !d.chosen) cps.push({ id: `cp-dec-${d.id}`, t: ms(d.at), label: d.prompt, kind: 'decision', stopIndex: i, decisionId: d.id });
      cps.push({ id: `cp-depart-${i}`, t: dep, label: `Si riparte da ${st.name}`, kind: 'depart', stopIndex: i });
    }
  }
  const tEnd = segs.length ? segs[segs.length - 1].end : t0;
  cps.push({ id: 'cp-end', t: tEnd, label: 'Fine del programma', kind: 'end' });
  cps.sort((a, b) => a.t - b.t);
  const costs = [...plan.stops.flatMap((s) => s.cost), ...plan.trips.flatMap((t) => t.cost)].sort((a, b) => ms(a.at) - ms(b.at));
  return { planId: plan.id, planVersion: plan.version, start: t0, end: tEnd, segments: segs, checkpoints: cps, costs, decisions: plan.decisions };
}

export function segmentAt(tl: Timeline, t: number): number {
  const s = tl.segments;
  if (!s.length) return -1;
  if (t <= s[0].start) return 0;
  let lo = 0, hi = s.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (s[m].start <= t) lo = m; else hi = m - 1;
  }
  // se il segmento è finito ma il successivo non è ancora iniziato resta sull'ultimo
  return lo;
}

/** Decisione obbligatoria non presa che blocca l'avanzamento oltre l'istante t. */
export function blockingDecision(tl: Timeline, from: number, to: number): DecisionPoint | null {
  for (const d of tl.decisions) {
    if (!d.mandatory || d.chosen) continue;
    const at = ms(d.at);
    if (at >= from && at <= to) return d;
  }
  return null;
}

export function stateAt(tl: Timeline, tIn: number): SimState {
  const t = Math.max(tl.start, Math.min(tl.end, tIn));
  const i = segmentAt(tl, t);
  const seg = tl.segments[i];
  let position: [number, number] = [0, 0];
  let bearing = 0;
  let progress = 0;
  if (seg) {
    progress = seg.end > seg.start ? Math.max(0, Math.min(1, (t - seg.start) / (seg.end - seg.start))) : 1;
    if (seg.coords && seg.cum) {
      let d: number;
      if (seg.stopMarks && seg.stopMarks.length >= 2) {
        const m = seg.stopMarks;
        let k = 0;
        while (k < m.length - 2 && m[k + 1].t <= t) k++;
        const a = m[k], b = m[k + 1];
        const f = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 1;
        d = a.d + (b.d - a.d) * f;
      } else d = seg.cum[seg.cum.length - 1] * progress;
      const r = pointAtDistance(seg.coords, seg.cum, d);
      position = r.p; bearing = r.bearing;
    } else if (seg.at) position = seg.at;
  }
  const lines = tl.costs.filter((c) => ms(c.at) <= t);
  let min = 0, max = 0, unknown = 0;
  for (const l of lines) {
    if (l.min == null || l.max == null) { unknown++; continue; }
    if (l.essential) min += l.min;
    max += l.max;
  }
  const completedStops = tl.checkpoints.filter((c) => c.kind === 'depart' && c.t <= t).length;
  const pending = tl.decisions.find((d) => d.mandatory && !d.chosen && ms(d.at) <= t) ?? null;
  return {
    t, segIndex: i, scene: seg?.kind ?? 'end', label: seg?.label ?? '', position, bearing,
    mode: seg?.mode ?? null, tripIndex: seg?.tripIndex ?? null, legIndex: seg?.legIndex ?? null, stopIndex: seg?.stopIndex ?? null,
    completedStops, spent: { min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100, unknown, lines },
    pendingDecision: pending, progress, finished: t >= tl.end,
  };
}

// ------------------------------------------------------------------ comandi
/** «Salta spostamento»: fine del segmento di movimento corrente (o del prossimo), conseguenze incluse. */
export function skipMoveTarget(tl: Timeline, t: number): number {
  const i = segmentAt(tl, t);
  for (let k = i; k < tl.segments.length; k++) {
    const s = tl.segments[k];
    if ((s.kind === 'walk' || s.kind === 'ride' || s.kind === 'wait') && s.end > t) {
      // salta l'intero spostamento contiguo (camminate, attese e corse della stessa tratta)
      let e = s.end;
      for (let j = k + 1; j < tl.segments.length; j++) {
        const n = tl.segments[j];
        if (n.tripIndex !== s.tripIndex || n.tripIndex == null) break;
        e = n.end;
      }
      return clampToDecision(tl, t, e);
    }
    if (s.kind === 'activity' && s.end > t && k > i) break;
  }
  return clampToDecision(tl, t, tl.segments[i]?.end ?? t);
}

/** Fine della scena corrente (qualsiasi tipo). */
export function skipSceneTarget(tl: Timeline, t: number): number {
  const i = segmentAt(tl, t);
  const s = tl.segments[i];
  if (!s) return t;
  const target = s.end > t ? s.end : tl.segments[i + 1]?.end ?? tl.end;
  return clampToDecision(tl, t, target);
}

/** «Prossima decisione»: il prossimo punto che richiede una scelta (o la fine). */
export function nextDecisionTarget(tl: Timeline, t: number): { t: number; decision: DecisionPoint | null } {
  const next = tl.decisions.filter((d) => !d.chosen && ms(d.at) > t).sort((a, b) => ms(a.at) - ms(b.at))[0];
  return next ? { t: ms(next.at), decision: next } : { t: tl.end, decision: null };
}

/** «Vai al riepilogo»: fino alla fine, fermandosi alle decisioni obbligatorie non prese. */
export function summaryTarget(tl: Timeline, t: number): { t: number; blockedBy: DecisionPoint | null } {
  const p = pendingAt(tl, t);
  if (p) return { t, blockedBy: p };
  const d = blockingDecision(tl, t, tl.end);
  if (d) return { t: ms(d.at), blockedBy: d };
  return { t: tl.end, blockedBy: null };
}

function clampToDecision(tl: Timeline, from: number, to: number): number {
  if (pendingAt(tl, from)) return from;
  const d = blockingDecision(tl, from + 1, to);
  return d ? ms(d.at) : to;
}

/** Avanzamento dell'orologio simulato: ritmo di riproduzione × velocità, fermandosi alle decisioni. */
export function advance(tl: Timeline, t: number, realDtMs: number, rate: number): { t: number; stoppedAt: DecisionPoint | null } {
  const p = pendingAt(tl, t);
  if (p) return { t, stoppedAt: p };
  const target = Math.min(tl.end, t + realDtMs * rate);
  const d = blockingDecision(tl, t + 1, target);
  if (d) return { t: ms(d.at), stoppedAt: d };
  return { t: target, stoppedAt: null };
}

/** Decisione obbligatoria già raggiunta (istante <= t) e non ancora presa. */
export function pendingAt(tl: Timeline, t: number): DecisionPoint | null {
  return tl.decisions.find((d) => d.mandatory && !d.chosen && ms(d.at) <= t) ?? null;
}
