import { useState } from 'react';
import { useApp, defaultDraft, makePerson, type Draft } from '../store.ts';
import { track } from '../api.ts';
import { runPlanning } from './planning-actions.ts';
import { PAWN_COLORS } from '../map/avatars.ts';

/** Idee pronte: un tocco e partono le proposte. */
const IDEAS: { id: string; icon: string; title: string; apply: (d: Draft) => Draft }[] = [
  {
    id: 'friends', icon: '🍹', title: 'Serata fra amici',
    apply: (d) => ({ ...d, people: Array.from({ length: 4 }, (_, i) => makePerson(i)), startTime: '18:30', endTime: '23:59', occasion: 'friends', moods: ['chill', 'lively'], avoid: ['nightclub'], budget: { amount: 60, per: 'person', strict: false } }),
  },
  {
    id: 'couple', icon: '⛰', title: 'Panorami e cultura',
    apply: (d) => ({ ...d, people: [makePerson(0), makePerson(1)], startTime: '09:30', endTime: '18:00', occasion: 'date', moods: ['views', 'cultural'], budget: { amount: 120, per: 'person', strict: false } }),
  },
  {
    id: 'family', icon: '🧸', title: 'Famiglia con passeggino',
    apply: (d) => ({ ...d, people: [makePerson(0), makePerson(1), { ...makePerson(2, 'child'), ageBand: '0-5' }, { ...makePerson(3, 'child'), ageBand: '6-11' }], startTime: '10:00', endTime: '17:00', occasion: 'family', moods: ['nature'], mobility: { stroller: true, wheelchair: false, avoidStairs: true, frequentBreaks: true }, pace: 'relaxed' }),
  },
  {
    id: 'mountain', icon: '🥾', title: 'Monte e rientro',
    apply: (d) => ({ ...d, people: [makePerson(0), makePerson(1)], startTime: '09:00', endTime: '18:30', occasion: 'leisure', moods: ['views', 'nature', 'adventure'], pace: 'intense' }),
  },
];

/** Schermata d'ingresso: fa anche da schermata di caricamento mentre la mappa si prepara dietro. */
export default function Landing() {
  const set = useApp((s) => s.set);
  const meta = useApp((s) => s.meta);
  const metaError = useApp((s) => s.metaError);
  const reduced = useApp((s) => s.settings.reducedMotion);
  const [leaving, setLeaving] = useState(false);
  const go = (fn: () => void) => {
    if (reduced) { fn(); return; }
    setLeaving(true);
    setTimeout(fn, 280);
  };
  const today = meta?.today ?? new Date().toISOString().slice(0, 10);

  const plan = () => go(() => {
    const base = useApp.getState().draft ?? defaultDraft(today);
    useApp.getState().set({ draft: { ...base, date: base.date < today ? today : base.date }, view: 'wizard', wizardStep: 0 });
    useApp.getState().setDraft((d) => d);
  });
  const explore = () => go(() => { set({ view: 'explore' }); track('explore_opened'); });
  const idea = (apply: (d: Draft) => Draft) => go(() => {
    const prev = useApp.getState().draft;
    const p = apply(defaultDraft(today));
    // una data futura scelta in precedenza resta; altrimenti oggi, o domani se l'idea sarebbe già iniziata
    const date = prev && prev.date > today ? prev.date : zurichNow() > p.startTime ? nextDay(today) : today;
    useApp.setState({ draft: { ...p, date } });
    useApp.getState().setDraft((d) => d);
    void runPlanning(false);
  });
  /** «Siamo già in giro»: partenza da adesso (arrotondato) e dalla posizione, se concessa. */
  const here = () => go(() => {
    const now = Date.now();
    const fmt = new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const start = Math.ceil(now / 300_000) * 300_000;
    const base = useApp.getState().draft ?? defaultDraft(today);
    useApp.setState({ draft: { ...base, date: today, startTime: fmt.format(new Date(start)), endTime: fmt.format(new Date(start + 3 * 3600_000)), end: { mode: 'free' }, resolutions: {} } });
    useApp.getState().setDraft((d) => d);
    set({ view: 'wizard', wizardStep: 1 });
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(
      (pos) => useApp.getState().setDraft((d) => ({ ...d, start: { kind: 'geolocation', label: 'La mia posizione', lon: pos.coords.longitude, lat: pos.coords.latitude, sensitive: true } })),
      () => useApp.getState().notify('Posizione non concessa: scegliete da dove partite.', 'info'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });

  return (
    <div className={`landing ${leaving ? 'leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="landing-title">
      <div className="landing-inner">
        <LandingArt />
        <h1 id="landing-title">Lugano in anteprima</h1>
        <p className="tagline">Prova la giornata sulla mappa. Poi vivila davvero.</p>
        {metaError ? (
          <div className="notice bad" role="alert">Il servizio non risponde ({metaError}). <button className="link" onClick={() => location.reload()}>Riprova</button></div>
        ) : !meta ? (
          <div className="landing-loading" role="status"><span className="pencil" aria-hidden>✎</span> Disegno la mappa…</div>
        ) : (
          <>
            <div className="landing-cta">
              <button className="btn primary big block" onClick={plan}>Organizza una giornata</button>
              <button className="btn-ghost big block" onClick={explore}>Esplora la mappa</button>
            </div>
            <div className="landing-ideas">
              <p className="label">oppure parti da un'idea</p>
              <div className="idea-chips">
                {IDEAS.map((i) => <button key={i.id} className="idea-chip" onClick={() => idea(i.apply)}><span aria-hidden>{i.icon}</span>{i.title}</button>)}
                <button className="idea-chip here" onClick={here}><span aria-hidden>📍</span>Siamo già in giro</button>
              </div>
            </div>
          </>
        )}
        <div className="landing-foot">
          <span>Prototipo indipendente, non ufficiale</span>
          {meta ? <button className="link" onClick={() => go(() => set({ view: 'about' }))}>Dati e fonti</button> : null}
        </div>
      </div>
    </div>
  );
}

/** Schizzo del golfo: Monte Brè, San Salvatore, il lago e un percorso con tre pedine. */
function LandingArt() {
  return (
    <svg className="landing-art" viewBox="0 0 440 190" aria-hidden="true" fill="none" stroke="#2a2622" strokeLinecap="round" strokeLinejoin="round">
      <path className="draw" strokeWidth="1.2" opacity=".45" d="M4 104 C40 92 70 88 96 94 C120 99 140 84 170 86" />
      <path className="draw" strokeWidth="2.2" d="M14 118 C48 92 86 70 124 70 C160 70 186 92 214 116" />
      <path className="draw d2" strokeWidth="2.2" d="M238 118 C262 96 280 52 300 36 C312 28 322 30 332 44 C350 70 372 100 408 118" />
      <path className="draw d2" strokeWidth="1.1" opacity=".5" d="M300 48 l-6 18 M312 44 l-3 22 M322 52 l2 20 M288 64 l-6 16 M334 64 l6 16" />
      <path className="draw" strokeWidth="1.8" d="M6 124 C90 118 180 128 250 122 C320 116 380 126 434 121" />
      <path className="draw d2" stroke="#2f6f7e" strokeWidth="1.4" opacity=".7" d="M40 136 h40 M110 140 h56 M200 134 h30 M262 142 h60 M350 136 h44 M70 150 h36 M150 154 h62 M250 156 h40 M330 152 h52 M110 166 h40 M210 168 h56" />
      <path className="route-fade" stroke="#c24a31" strokeWidth="2.6" strokeDasharray="7 7" d="M52 178 C110 170 150 184 206 168 C244 158 262 132 276 104 C288 82 296 62 306 42" />
      <g className="pop p1"><Pawn x={92} y={176} color={PAWN_COLORS[1]} /></g>
      <g className="pop p2"><Pawn x={196} y={170} color={PAWN_COLORS[2]} /></g>
      <g className="pop p3"><Pawn x={306} y={42} color={PAWN_COLORS[0]} /></g>
    </svg>
  );
}

function Pawn({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x - 11} ${y - 30}) scale(.7)`} stroke="#2a2622" strokeWidth="2">
      <ellipse cx="16" cy="41.6" rx="10" ry="2.4" fill="#000" opacity=".15" stroke="none" />
      <path d="M6 39.5 Q16 43 26 39.5 L25 35.5 Q16 38 7 35.5 Z" fill={color} />
      <path d="M9 35.5 Q10.5 24 13 19.5 L19 19.5 Q21.5 24 23 35.5 Q16 37.5 9 35.5 Z" fill={color} />
      <circle cx="16" cy="11.5" r="7" fill={color} />
    </g>
  );
}

/** Ora corrente a Zurigo (HH:MM), indipendente dal fuso del dispositivo. */
export function zurichNow(): string {
  return new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
}
export function nextDay(date: string, n = 1): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
