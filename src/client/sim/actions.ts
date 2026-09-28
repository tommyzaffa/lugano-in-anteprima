import { useApp, useSim } from '../store.ts';
import { replan, ApiError, track } from '../api.ts';
import type { Decision, Plan, Branch, DecisionPoint } from '../../shared/types.ts';
import { buildTimeline, skipMoveTarget, nextDecisionTarget, summaryTarget, skipSceneTarget } from '../../shared/simulation.ts';
import { isoFromMs, hhmm } from '../../shared/time.ts';
import { getMap, boundsOf, planCoords, fitPadding } from '../map/MapView.tsx';

const LABEL: Record<string, string> = {
  extend: 'Restiamo di più', skip: 'Saltiamo una tappa', replace: 'Sostituiamo una tappa', reduce_budget: 'Budget ridotto', less_walking: 'Meno cammino',
  add_pause: 'Una pausa', indoor: 'Al coperto', change_return: 'Rientro diverso', lock: 'Tappa bloccata', whatif_missed_bus: 'E se… perdiamo la corsa',
  whatif_rain: 'E se… piove', whatif_unavailable: 'E se… il posto non è disponibile', whatif_stay_30: 'E se… restiamo mezz\'ora', choice: 'Scelta',
};

export function currentTimeline() {
  const p = useApp.getState().plan();
  return p ? buildTimeline(p) : null;
}

export function play() { useSim.getState().set({ playing: true, camera: useSim.getState().camera === 'overview' ? 'follow' : useSim.getState().camera }); }
export function pause() { useSim.getState().set({ playing: false }); }
export function setSpeed(speed: 1 | 4 | 10) { useSim.getState().set({ speed }); }
export function seek(t: number) {
  const tl = currentTimeline();
  if (!tl) return;
  useSim.getState().set({ t: Math.max(tl.start, Math.min(tl.end, t)), cutscene: null, bubbles: [] });
}
export function skipMove() { const tl = currentTimeline(); if (!tl) return; seek(skipMoveTarget(tl, useSim.getState().t)); track('sim_skip'); }
export function skipScene() { const tl = currentTimeline(); if (!tl) return; seek(skipSceneTarget(tl, useSim.getState().t)); }
export function nextDecision() {
  const tl = currentTimeline(); if (!tl) return;
  const r = nextDecisionTarget(tl, useSim.getState().t);
  seek(r.t);
  pause();
  if (!r.decision) useApp.getState().notify('Nessuna altra decisione: siete alla fine del programma.');
}
export function goToSummary() {
  const tl = currentTimeline(); if (!tl) return;
  const r = summaryTarget(tl, useSim.getState().t);
  seek(r.t);
  pause();
  if (r.blockedBy) useApp.getState().notify('Prima serve una scelta: il riepilogo non inventa risposte alle decisioni obbligatorie.');
  else useApp.getState().set({ view: 'summary' });
}
export function cameraMode(mode: 'follow' | 'free' | 'overview') {
  useSim.getState().set({ camera: mode });
  const map = getMap();
  const plan = useApp.getState().plan();
  if (mode === 'overview' && map && plan) {
    const bb = boundsOf(planCoords(plan));
    if (bb) map.fitBounds(bb, { padding: fitPadding(), duration: useApp.getState().settings.reducedMotion ? 0 : 800 });
  }
  if (mode === 'follow' && map) map.easeTo({ zoom: Math.max(map.getZoom(), 15), duration: useApp.getState().settings.reducedMotion ? 0 : 600 });
}

/** Chiede al server un nuovo ramo per la modifica; il risultato va confermato. */
export async function requestChange(partial: Omit<Decision, 'atTime' | 'hypothetical'> & { hypothetical?: boolean }) {
  const app = useApp.getState();
  const plan = app.plan();
  if (!plan) return;
  pause();
  const decision: Decision = { ...partial, atTime: isoFromMs(useSim.getState().t), hypothetical: partial.hypothetical ?? partial.kind.startsWith('whatif_') } as Decision;
  app.set({ pending: { decision, plan: null, diff: null, explanation: ['Ricalcolo del futuro in corso…'], hypothetical: decision.hypothetical, label: LABEL[decision.kind] ?? decision.kind } });
  try {
    const r = await replan(plan, decision);
    useApp.getState().set({ pending: { decision, plan: r.plan, diff: r.diff, explanation: r.explanation, hypothetical: r.hypothetical, label: LABEL[decision.kind] ?? decision.kind } });
  } catch (e) {
    useApp.getState().set({ pending: null });
    useApp.getState().notify(e instanceof ApiError ? e.message : 'Ricalcolo non riuscito.', 'error');
  }
}

export function applyPending() {
  const app = useApp.getState();
  const p = app.pending;
  if (!p?.plan) return;
  const parent = app.currentBranch;
  const id = `br-${Date.now().toString(36)}`;
  const b: Branch = { id, parentId: parent, label: `${p.label} (${hhmm(p.decision.atTime)})`, decision: p.decision, forkTime: p.decision.atTime, plan: { ...p.plan, branchId: id }, createdAt: new Date().toISOString() };
  app.addBranch(b);
  app.set({ pending: null, compareBranch: null });
  track(p.hypothetical ? 'whatif' : 'branch_created');
  app.notify(`Nuovo ramo: ${b.label}. Il passato resta invariato.`, 'ok');
}

export function switchBranch(id: string) {
  const app = useApp.getState();
  const b = app.branches.find((x) => x.id === id);
  if (!b) return;
  app.set({ currentBranch: id, compareBranch: null });
  // si resta allo stesso istante se esiste nel ramo, altrimenti al punto di biforcazione
  const tl = buildTimeline(b.plan);
  const t = useSim.getState().t;
  seek(t >= tl.start && t <= tl.end ? t : Date.parse(b.forkTime ?? b.plan.totals.startsAt));
}

/** Scelta a una decisione pre-validata: «come previsto» o il proseguimento alternativo. */
export function chooseDecision(d: DecisionPoint, optionId: string) {
  const app = useApp.getState();
  const plan = app.plan();
  if (!plan) return;
  const opt = d.options.find((o) => o.id === optionId);
  if (!opt) return;
  const markChosen = (p: Plan): Plan => ({ ...p, decisions: p.decisions.map((x) => (x.id === d.id ? { ...x, chosen: optionId } : x)) });
  if (!opt.plan) {
    // stesso piano, decisione registrata
    const branches = app.branches.map((b) => (b.id === app.currentBranch ? { ...b, plan: markChosen(b.plan) } : b));
    app.set({ branches });
  } else {
    const id = `br-${Date.now().toString(36)}`;
    const np = markChosen({ ...opt.plan, decisions: plan.decisions, branchId: id });
    app.addBranch({ id, parentId: app.currentBranch, label: `Scelta: ${opt.label}`, decision: { kind: 'choice', atTime: d.at, decisionId: d.id, optionId, hypothetical: false }, forkTime: d.at, plan: np, createdAt: new Date().toISOString() });
  }
  track('sim_decision');
  play();
}
