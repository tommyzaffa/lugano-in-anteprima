/**
 * Stato dell'applicazione (zustand). L'orologio simulato vive in uno store
 * separato e leggero, aggiornato a ogni fotogramma senza ridisegnare l'intera UI.
 */
import { create } from 'zustand';
import type { GroupRequest, Plan, Branch, Contradiction, InfeasibleResult, Decision, PlanDiff, Person, Location } from '../shared/types.ts';
import { defaultAvatar } from './map/avatars.ts';
import { track } from './api.ts';

export type View = 'home' | 'wizard' | 'planning' | 'results' | 'sim' | 'summary' | 'explore' | 'events' | 'saved' | 'settings' | 'about' | 'share' | 'admin';

export interface Meta {
  perimeter: { core: { south: number; west: number; north: number; east: number }; perimeter: { south: number; west: number; north: number; east: number }; buffer: { south: number; west: number; north: number; east: number }; references: any[]; sizeKm: { width: number; height: number }; polygon: any };
  catalogVersion: string;
  transit: { feedVersion: string; range: { start: string; end: string }; source: string };
  sources: any[];
  integrations: { id: string; name: string; status: string; active: boolean; detail: string; activation: string }[];
  maxPeople: number;
  demoMode: boolean;
  ai: { configured: boolean; label: string; model: string | null };
  weather: string;
  today: string;
  quickStarts: { kind: 'stop' | 'place'; label: string; lon: number; lat: number; stopId?: string; placeId?: string }[];
  hosting?: { ephemeralStorage: boolean };
  features?: { sharing: boolean };
}

/** mustSeeLabels: nomi leggibili delle tappe obbligatorie che non sono luoghi (es. eventi scelti dal calendario) */
export interface Draft extends Omit<GroupRequest, 'people'> { people: Person[]; mustSeeLabels?: Record<string, string> }

const LS = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* archiviazione non disponibile */ } },
};

export function makePerson(i: number, kind: 'adult' | 'child' = 'adult'): Person {
  return { id: `p${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 5)}`, name: kind === 'child' ? `Bimbo ${i + 1}` : `Persona ${i + 1}`, kind, avatar: defaultAvatar(i), interests: [] };
}

export function defaultDraft(today: string): Draft {
  // punto di partenza predefinito: la stazione risolta dall'orario ufficiale (vedi /api/meta)
  const qs = useApp.getState().meta?.quickStarts?.[0];
  const station: Location = qs ? { ...qs } : { kind: 'stop', label: 'Stazione FFS di Lugano', lon: 8.946849, lat: 46.005499 };
  return {
    people: [makePerson(0), makePerson(1)],
    date: today, startTime: '10:00', endTime: '18:00',
    start: station, end: { mode: 'same' },
    occasion: 'leisure', moods: [], budget: { per: 'person', strict: false },
    pace: 'balanced', transport: { walk: true, bus: true, train: true, boat: true, funicular: true },
    avoid: [], mobility: { stroller: false, wheelchair: false, avoidStairs: false, frequentBreaks: false },
    diet: [], environment: 'any', rainTolerance: 'medium', mustSee: [], locked: [], passes: [], exclude: [], favorites: [],
    freeText: '', resolutions: {}, locale: 'it', surprise: false,
  };
}

export interface Settings { reducedMotion: boolean; sound: boolean; threeD: boolean; cutscenes: boolean; lighting: 'sim' | 'day'; listView: boolean; dialogues: boolean }
export interface SavedRef { id: string; token: string; title: string; date: string; savedAt: string }

export interface PendingChange { decision: Decision; plan: Plan | null; diff: PlanDiff | null; explanation: string[]; hypothetical: boolean; label: string }

export interface EventPin { id: string; lon: number; lat: number; title: string; time: string; placeId: string; status: string }

interface AppState {
  eventPins: EventPin[];
  meta: Meta | null;
  metaError: string | null;
  view: View;
  sheet: 'peek' | 'half' | 'full';
  draft: Draft | null;
  wizardStep: number;
  progress: string[];
  planError: string | null;
  result: { alternatives: Plan[]; understood: string[]; notices: string[]; plannerSource: string } | null;
  contradictions: Contradiction[] | null;
  infeasible: InfeasibleResult | null;
  selected: number;
  branches: Branch[];
  currentBranch: string | null;
  compareBranch: string | null;
  settings: Settings;
  placeCard: string | null;
  saved: SavedRef[];
  savedRef: { id: string; token: string } | null;
  pending: PendingChange | null;
  toast: { text: string; kind: 'info' | 'error' | 'ok'; at: number } | null;
  online: boolean;
  webgl: 'ok' | 'unsupported' | 'lost';
  exploreFilter: { cats: string[]; from: string; to: string; showOsm: boolean; q: string };
  set: (p: Partial<AppState>) => void;
  setDraft: (f: (d: Draft) => Draft) => void;
  setSettings: (p: Partial<Settings>) => void;
  notify: (text: string, kind?: 'info' | 'error' | 'ok') => void;
  plan: () => Plan | null;
  startSimulation: (index: number) => void;
  addBranch: (b: Branch) => void;
}

const defaultSettings: Settings = {
  reducedMotion: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  sound: false, threeD: true, cutscenes: true, lighting: 'sim', listView: false, dialogues: true,
};

export const useApp = create<AppState>((set, get) => ({
  meta: null,
  metaError: null,
  view: 'home',
  sheet: 'half',
  eventPins: [],
  draft: LS.get<Draft | null>('lia.draft', null),
  wizardStep: 0,
  progress: [],
  planError: null,
  result: null,
  contradictions: null,
  infeasible: null,
  selected: 0,
  branches: [],
  currentBranch: null,
  compareBranch: null,
  settings: { ...defaultSettings, ...LS.get<Partial<Settings>>('lia.settings', {}) },
  placeCard: null,
  saved: LS.get<SavedRef[]>('lia.saved', []),
  savedRef: null,
  pending: null,
  toast: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  webgl: 'ok',
  exploreFilter: { cats: [], from: '', to: '', showOsm: false, q: '' },
  set: (p) => {
    set(p);
    if (p.saved) LS.set('lia.saved', p.saved);
  },
  setDraft: (f) => {
    const d = get().draft;
    if (!d) return;
    const nd = f(d);
    set({ draft: nd });
    LS.set('lia.draft', nd);
  },
  setSettings: (p) => {
    const prev = get().settings;
    const s = { ...prev, ...p };
    // statistiche aggregate anonime: solo quando un'opzione di accessibilità viene attivata
    if (s.listView && !prev.listView) track('list_view');
    if (s.reducedMotion && !prev.reducedMotion) track('reduced_motion');
    set({ settings: s });
    LS.set('lia.settings', s);
  },
  notify: (text, kind = 'info') => set({ toast: { text, kind, at: Date.now() } }),
  plan: () => {
    const { branches, currentBranch } = get();
    return branches.find((b) => b.id === currentBranch)?.plan ?? null;
  },
  startSimulation: (index) => {
    const alt = get().result?.alternatives[index];
    if (!alt) return;
    const root: Branch = { id: 'main', parentId: null, label: 'Programma scelto', decision: null, forkTime: null, plan: alt, createdAt: new Date().toISOString() };
    set({ selected: index, branches: [root], currentBranch: 'main', compareBranch: null, view: 'sim', pending: null });
    useSim.getState().reset(Date.parse(alt.totals.startsAt));
  },
  addBranch: (b) => set({ branches: [...get().branches, b], currentBranch: b.id }),
}));

interface SimState {
  t: number;
  playing: boolean;
  speed: 1 | 4 | 10;
  camera: 'follow' | 'free' | 'overview';
  cutscene: { title: string; subtitle?: string; until: number } | null;
  bubbles: { speaker: string; text: string; until: number }[];
  reset: (t: number) => void;
  set: (p: Partial<SimState>) => void;
}

export const useSim = create<SimState>((set) => ({
  t: 0,
  playing: false,
  speed: 1,
  camera: 'follow',
  cutscene: null,
  bubbles: [],
  reset: (t) => set({ t, playing: false, cutscene: null, bubbles: [] }),
  set: (p) => set(p),
}));
