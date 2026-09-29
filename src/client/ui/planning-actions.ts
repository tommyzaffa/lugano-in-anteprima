import { getLocale } from '../locale.ts';
import { useApp } from '../store.ts';
import { planStream, ApiError, track } from '../api.ts';
import type { GroupRequest } from '../../shared/types.ts';
import { usePersonal } from '../personal.ts';

let controller: AbortController | null = null;

export function cancelPlanning() {
  controller?.abort();
  controller = null;
  useApp.getState().set({ view: 'wizard', progress: [] });
}

export async function runPlanning(surprise = false, patch?: Partial<GroupRequest>) {
  const st = useApp.getState();
  if (!st.draft) return;
  if (patch) st.setDraft((d) => ({ ...d, ...patch } as any));
  const draft = useApp.getState().draft!;
  const { favs, visited } = usePersonal.getState();
  // «già fatto»: esclude i posti segnati come visitati su questo dispositivo
  const exclude = draft.avoid.includes('already_done') ? [...new Set([...draft.exclude, ...visited])].filter((id) => !draft.mustSee.includes(id)) : draft.exclude;
  const req = { ...draft, locale: getLocale(), exclude, favorites: favs, surprise } as GroupRequest;
  controller?.abort();
  const active = new AbortController();
  controller = active;
  st.set({ view: 'planning', progress: [], planError: null, contradictions: null, infeasible: null, result: null });
  if (surprise) track('surprise');
  try {
    const res = await planStream(req, (step) => { if (controller === active && !active.signal.aborted) useApp.getState().set({ progress: [...useApp.getState().progress, step] }); }, active.signal);
    if (active.signal.aborted || controller !== active) return;
    if (res.status === 'needs_resolution') useApp.getState().set({ contradictions: res.contradictions, view: 'planning' });
    else if (res.status === 'infeasible') useApp.getState().set({ infeasible: res.infeasible, result: { alternatives: [], understood: res.understood, notices: res.notices, plannerSource: 'deterministic', areaAdvice: res.areaAdvice }, view: 'planning' });
    else useApp.getState().set({ result: { alternatives: res.alternatives, understood: res.understood, notices: res.notices, plannerSource: res.plannerSource, areaAdvice: res.areaAdvice }, selected: 0, view: 'results' });
  } catch (e) {
    if (controller !== active || active.signal.aborted) return;
    if ((e as Error).name === 'AbortError') return;
    const msg = e instanceof ApiError ? e.message : 'Errore imprevisto durante la pianificazione.';
    useApp.getState().set({ planError: msg, view: 'planning' });
  } finally {
    if (controller === active) controller = null;
  }
}

/** Risolve una contraddizione testo/modulo con la scelta esplicita dell'utente. */
export function resolveContradiction(id: string, choice: string) {
  const st = useApp.getState();
  if (choice === 'edit_group') { st.set({ view: 'wizard', wizardStep: 0, contradictions: null }); return; }
  st.setDraft((d) => ({ ...d, resolutions: { ...d.resolutions, [id]: choice } }));
  const remaining = (st.contradictions ?? []).filter((c) => c.id !== id);
  st.set({ contradictions: remaining.length ? remaining : null });
  if (!remaining.length) void runPlanning(false);
}
