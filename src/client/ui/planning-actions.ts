import { useApp } from '../store.ts';
import { planStream, ApiError, track } from '../api.ts';
import type { GroupRequest } from '../../shared/types.ts';

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
  const req = { ...draft, surprise } as GroupRequest;
  controller?.abort();
  controller = new AbortController();
  st.set({ view: 'planning', progress: [], planError: null, contradictions: null, infeasible: null, result: null });
  if (surprise) track('surprise');
  try {
    const res = await planStream(req, (step) => useApp.getState().set({ progress: [...useApp.getState().progress, step] }), controller.signal);
    if (res.status === 'needs_resolution') useApp.getState().set({ contradictions: res.contradictions, view: 'planning' });
    else if (res.status === 'infeasible') useApp.getState().set({ infeasible: res.infeasible, result: { alternatives: [], understood: res.understood, notices: res.notices, plannerSource: 'deterministic' }, view: 'planning' });
    else useApp.getState().set({ result: { alternatives: res.alternatives, understood: res.understood, notices: res.notices, plannerSource: res.plannerSource }, selected: 0, view: 'results' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    const msg = e instanceof ApiError ? e.message : 'Errore imprevisto durante la pianificazione.';
    useApp.getState().set({ planError: msg, view: 'planning' });
  } finally {
    controller = null;
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
