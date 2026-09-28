import { describe, it, expect, beforeAll } from 'vitest';
import { DataStore } from '../src/server/data.ts';
import { planAlternatives } from '../src/server/planner/index.ts';
import { replan } from '../src/server/planner/replan.ts';
import { GroupRequest, type Plan } from '../src/shared/types.ts';
import { buildTimeline, stateAt, skipMoveTarget, skipSceneTarget, summaryTarget, nextDecisionTarget, advance } from '../src/shared/simulation.ts';

const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short' };
const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, kind: 'adult', avatar: av, interests: [] }));
let data: DataStore;
let plan: Plan;

beforeAll(async () => {
  data = new DataStore();
  data.load();
  const req = GroupRequest.parse({
    people: people(2), date: '2026-10-03', startTime: '09:30', endTime: '18:00',
    start: { kind: 'stop', label: 'Stazione', lon: 8.946849, lat: 46.005499 }, end: { mode: 'same' },
    occasion: 'date', moods: ['views', 'cultural'], budget: { per: 'person', strict: false },
  });
  const res = await planAlternatives(req, { data });
  if (res.status !== 'ok') throw new Error('nessun piano');
  plan = res.alternatives[0];
});

describe('simulazione e salto equivalente (scenario H)', () => {
  it('saltare uno spostamento produce lo stesso stato della riproduzione completa', () => {
    const tl = buildTimeline(plan);
    const firstMove = tl.segments.find((s) => s.kind === 'walk' || s.kind === 'ride')!;
    const tSkip = skipMoveTarget(tl, firstMove.start);
    // riproduzione a passi piccoli fino allo stesso istante
    let t = tl.start;
    while (t < tSkip) t = Math.min(tSkip, advance(tl, t, 16, 60).t);
    const a = stateAt(tl, tSkip), b = stateAt(tl, t);
    expect(b.t).toBe(a.t);
    expect(b.position).toEqual(a.position);
    expect(b.spent).toEqual(a.spent);
    expect(b.stopIndex).toBe(a.stopIndex);
    expect(b.completedStops).toBe(a.completedStops);
  });
  it('tornare a un checkpoint non duplica le spese', () => {
    const tl = buildTimeline(plan);
    const end = stateAt(tl, tl.end);
    const mid = tl.checkpoints[Math.floor(tl.checkpoints.length / 2)];
    const back = stateAt(tl, mid.t);
    const again = stateAt(tl, tl.end);
    expect(again.spent).toEqual(end.spent);
    expect(back.spent.max).toBeLessThanOrEqual(end.spent.max);
  });
  it('lo stato finale coincide con i totali del piano', () => {
    const tl = buildTimeline(plan);
    const s = stateAt(tl, tl.end);
    expect(s.finished).toBe(true);
    expect(s.spent.max).toBeCloseTo(plan.totals.cost.max, 1);
    expect(s.completedStops).toBe(plan.stops.length);
  });
  it('«vai al riepilogo» si ferma alle decisioni obbligatorie non prese', () => {
    const tl = buildTimeline(plan);
    const r = summaryTarget(tl, tl.start);
    if (plan.decisions.length) {
      expect(r.blockedBy?.id).toBe(plan.decisions[0].id);
      expect(nextDecisionTarget(tl, tl.start).decision?.id).toBe(plan.decisions[0].id);
      // da lì nessun comando avanza senza scelta
      expect(skipSceneTarget(tl, r.t)).toBe(r.t);
      expect(advance(tl, r.t, 1000, 60).t).toBe(r.t);
    } else expect(r.t).toBe(tl.end);
  });
  it('la posizione resta sulla geometria reale (mai fuori dalla tratta)', () => {
    const tl = buildTimeline(plan);
    for (const seg of tl.segments.filter((s) => s.coords)) {
      const st = stateAt(tl, (seg.start + seg.end) / 2);
      const near = seg.coords!.some((c) => Math.abs(c[0] - st.position[0]) < 0.01 && Math.abs(c[1] - st.position[1]) < 0.01);
      expect(near).toBe(true);
    }
  });
});

describe('rami (scenario G)', () => {
  it('restare mezz\'ora in più conserva il passato e sposta il futuro', () => {
    const s0 = plan.stops[0];
    const at = new Date((Date.parse(s0.start) + Date.parse(s0.end)) / 2).toISOString();
    const r = replan(plan, { kind: 'whatif_stay_30', atTime: at, hypothetical: true }, data);
    expect(r.plan).not.toBeNull();
    const np = r.plan!;
    expect(np.stops[0].start).toBe(s0.start);
    expect(np.trips[0].departure).toBe(plan.trips[0].departure);
    expect(Date.parse(np.stops[0].end)).toBeGreaterThanOrEqual(Date.parse(s0.end) + 29 * 60_000);
    expect(r.diff).not.toBeNull();
    expect(r.hypothetical).toBe(true);
    expect(np.hypothetical?.length).toBeGreaterThan(0);
  });
  it('saltare una tappa futura la rimuove e ricalcola il resto', () => {
    if (plan.stops.length < 3) return;
    const target = plan.stops[1];
    const r = replan(plan, { kind: 'skip', atTime: plan.stops[0].start, stopId: target.id, hypothetical: false }, data);
    expect(r.plan?.stops.some((s) => s.id === target.id && s.name === target.name)).toBe(false);
    expect(r.diff?.removed).toContain(target.name);
  });
});

import { redactPlan, DEFAULT_REDACTION, planToIcs } from '../src/shared/export.ts';
describe('condivisione ed esportazioni', () => {
  it('il link condiviso non contiene la posizione privata né le esigenze personali', () => {
    const priv = { ...plan, request: { ...plan.request, start: { kind: 'address' as const, label: 'Via Segreta 12, Lugano', lon: 8.95, lat: 46.0, sensitive: true }, mobility: { stroller: true, wheelchair: false, avoidStairs: true, frequentBreaks: false }, freeText: 'mio figlio ha paura dei cani' } };
    priv.checks = [...priv.checks, { id: 'return', label: 'Rientro', status: 'ok', detail: 'Arrivo a Via Segreta 12, Lugano alle 18:00' }];
    const r = redactPlan(priv, DEFAULT_REDACTION);
    const text = JSON.stringify(r);
    expect(text).not.toContain('Via Segreta');
    expect(text).not.toContain('paura dei cani');
    expect(r.request.mobility.stroller).toBe(false);
    expect(r.request.start.lon).toBe(0);
  });
  it('l\'esportazione iCalendar ha un evento per tappa e righe CRLF', () => {
    const ics = planToIcs(plan);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(plan.stops.length);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
