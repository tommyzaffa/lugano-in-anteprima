import LanguagePicker from './ui/LanguagePicker.tsx';
import { tx, getLocale, useLocale } from './locale.ts';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useApp, useSim, type View } from './store.ts';
import { get, track } from './api.ts';
const MapView = lazy(() => import('./map/MapView.tsx'));
import Landing from './ui/Home.tsx';
import Wizard from './ui/Wizard.tsx';
import Planning from './ui/Planning.tsx';
import Results from './ui/Results.tsx';
import SimPanel from './ui/SimPanel.tsx';
import SimControls from './ui/SimControls.tsx';
import Summary from './ui/Summary.tsx';
import PlaceCard from './ui/PlaceCard.tsx';
import Explore, { EventsView } from './ui/Explore.tsx';
import { Saved, Settings, About, ShareView, openSaved } from './ui/Misc.tsx';
import Fallback from './ui/Fallback.tsx';
import { Toast, Spinner } from './ui/common.tsx';
import { useSimulation } from './sim/useSimulation.ts';
import { skipScene, play, pause } from './sim/actions.ts';

const Admin = lazy(() => import('./ui/Admin.tsx'));

/** Altezza del foglio inferiore (telefono) adatta a ciascuna vista: mappa in primo piano o modulo a tutto schermo. */
const SHEET_FOR: Partial<Record<View, 'peek' | 'half' | 'full'>> = { wizard: 'full', planning: 'half', results: 'half', sim: 'peek', summary: 'full', explore: 'half', events: 'half', about: 'full', settings: 'full', saved: 'full', share: 'half' };

export default function App() {
  const locale = useLocale();
  useEffect(() => { const skip = document.querySelector<HTMLAnchorElement>('.skip-link'); if (skip) skip.textContent = tx('Vai al pannello'); }, [locale]);
  const view = useApp((s) => s.view);
  const [mapStarted, setMapStarted] = useState(false);
  useEffect(() => { if (view !== 'home') setMapStarted(true); }, [view]);
  const meta = useApp((s) => s.meta);
  const metaError = useApp((s) => s.metaError);
  const set = useApp((s) => s.set);
  const settings = useApp((s) => s.settings);
  const webgl = useApp((s) => s.webgl);
  const sheet = useApp((s) => s.sheet);
  const online = useApp((s) => s.online);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useSimulation();
  // ogni vista si apre dall'inizio, con il foglio (telefono) all'altezza adatta
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    const s = SHEET_FOR[view];
    if (s) set({ sheet: s });
  }, [view, set]);

  // metadati e instradamento iniziale
  useEffect(() => {
    get<any>('/api/meta').then((m) => set({ meta: m })).catch((e) => set({ metaError: e.message }));
    const path = location.pathname;
    const share = path.match(/^\/s\/([\w-]+)/);
    const saved = path.match(/^\/p\/([\w-]+)/);
    if (share) { setShareToken(share[1]); set({ view: 'share' }); }
    else if (path.startsWith('/admin')) set({ view: 'admin' });
    else if (saved) { const k = new URLSearchParams(location.hash.slice(1)).get('k'); if (k) void openSaved(saved[1], k); }
    const on = () => set({ online: true }), off = () => set({ online: false });
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [set]);

  // tastiera: spazio play/pausa, Esc salta la cutscene
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useApp.getState().view !== 'sim') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape' && useSim.getState().cutscene) { useSim.getState().set({ cutscene: null }); return; }
      if (e.key === ' ') { e.preventDefault(); useSim.getState().playing ? pause() : play(); }
      if (e.key === 'ArrowRight' && e.shiftKey) skipScene();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion); }, [settings.reducedMotion]);
  useEffect(() => { if (webgl !== 'ok') track('webgl_fallback'); }, [webgl]);

  const showMap = webgl === 'ok' && !settings.listView;
  // sotto la schermata iniziale nulla è raggiungibile da tastiera o lettore di schermo
  const behind = view === 'home' ? { inert: true } : {};
  const nav = (v: View) => { set({ view: v, placeCard: null }); if (v !== 'share' && location.pathname !== '/') history.pushState(null, '', '/'); };

  return (
    <div className={`app view-${view} sheet-${sheet}`}>
      {view !== 'home' && <LanguagePicker />}
      <header className="topbar" {...behind}>
        <button className="brand" onClick={() => nav('home')} aria-label={tx("Torna all'inizio")}>
          <svg viewBox="0 0 64 64" width="32" height="32" aria-hidden><circle cx="32" cy="32" r="30" fill="#fbf8f2" stroke="#2a2622" strokeWidth="3" /><path d="M8 38 C18 30 24 30 30 24 C36 17 42 14 48 22 C52 28 56 32 58 36" fill="none" stroke="#2a2622" strokeWidth="3" strokeLinecap="round" /><path d="M10 46 h14 M30 48 h18 M18 54 h22" stroke="#2f6f7e" strokeWidth="3" strokeLinecap="round" /><circle cx="44" cy="17" r="5" fill="#c24a31" stroke="#2a2622" strokeWidth="2.5" /></svg>
          <span>{tx("Lugano in anteprima")}</span>
        </button>
        <TopNav view={view} nav={nav} />
      </header>
      {!online ? <div className="offline-banner" role="status">{tx("Siete offline")}</div> : null}
      <main className="stage" {...behind}>
        {metaError ? <div className="fatal"><h2>{tx("Servizio non raggiungibile")}</h2><p>{tx(metaError)}</p><button className="btn" onClick={() => location.reload()}>{tx("Riprova")}</button></div>
          : !meta ? <div className="loading-map"><Spinner /></div>
          : showMap ? (mapStarted && <Suspense fallback={<Spinner />}><MapView onFallback={() => { /* il componente segnala lo stato webgl */ }} /></Suspense>) : <Fallback />}
        <Cutscene />
      </main>
      <aside id="panel" className={`panel ${view === 'admin' ? 'panel-wide' : ''}`} aria-label={tx("Pannello")} {...behind}>
        <SheetHandle />
        <div className="panel-body" ref={bodyRef}>
          {tx(view === 'wizard' && <Wizard />)}
          {tx(view === 'planning' && <Planning />)}
          {tx(view === 'results' && <Results />)}
          {tx(view === 'sim' && <SimPanel />)}
          {tx(view === 'summary' && <Summary />)}
          {tx(view === 'explore' && <Explore />)}
          {tx(view === 'events' && <EventsView />)}
          {tx(view === 'saved' && <Saved />)}
          {tx(view === 'settings' && <Settings />)}
          {tx(view === 'about' && <About />)}
          {tx(view === 'share' && shareToken && <ShareView token={shareToken} />)}
          {tx(view === 'admin' && <Suspense fallback={<Spinner />}><Admin /></Suspense>)}
        </div>
      </aside>
      {view === 'sim' ? <SimControls /> : null}
      <PlaceCard />
      {view === 'home' ? <Landing /> : null}
      <Toast />
    </div>
  );
}

function TopNav({ view, nav }: { view: View; nav: (v: View) => void }) {
  const [open, setOpen] = useState(false);
  const sharing = useApp((s) => !!s.meta?.features?.sharing);
  const listView = useApp((s) => s.settings.listView);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  const pick = (fn: () => void) => { setOpen(false); fn(); };
  return (
    <div className="nav-wrap" ref={ref}>
      <nav className="topnav" aria-label={tx("Navigazione principale")}>
        <button className="nav-desktop" onClick={() => nav('explore')} aria-current={view === 'explore'}>{tx("Esplora")}</button>
        <button className="nav-desktop" onClick={() => nav('events')} aria-current={view === 'events'}>{tx("Eventi")}</button>
        <button className="more" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label={tx("Altro")}>⋯</button>
      </nav>
      {tx(open ? (
        <div className="menu-pop" role="menu">
          <button className="mobile-nav" role="menuitem" onClick={() => pick(() => nav('explore'))}>{tx("Esplora")}</button>
          <button className="mobile-nav" role="menuitem" onClick={() => pick(() => nav('events'))}>{tx("Eventi")}</button>
          <button role="menuitem" onClick={() => pick(() => nav('wizard'))}>{tx("Organizza una giornata")}</button>
          {sharing ? <button role="menuitem" onClick={() => pick(() => nav('saved'))}>{tx("Programmi salvati")}</button> : null}
          <button role="menuitem" onClick={() => pick(() => useApp.getState().setSettings({ listView: !listView }))}>{tx(listView ? 'Torna alla mappa' : 'Vista elenco (senza mappa)')}</button>
          <button role="menuitem" onClick={() => pick(() => nav('settings'))}>{tx("Impostazioni")}</button>
          <button role="menuitem" onClick={() => pick(() => nav('about'))}>{tx("Dati, fonti e limiti")}</button>
        </div>
      ) : null)}
    </div>
  );
}

/** Maniglia del foglio inferiore (telefono): trascinare in su o in giù, oppure toccare per alternare. */
function SheetHandle() {
  const sheet = useApp((s) => s.sheet);
  const set = useApp((s) => s.set);
  const start = useRef<number | null>(null);
  const dragged = useRef(false);
  const order = ['peek', 'half', 'full'] as const;
  const move = (dir: 1 | -1) => set({ sheet: order[Math.max(0, Math.min(2, order.indexOf(sheet) + dir))] });
  return (
    <div className="sheet-handle">
      <button
        aria-label={tx(sheet === 'full' ? 'Riduci il pannello' : 'Espandi il pannello')}
        onPointerDown={(e) => { start.current = e.clientY; dragged.current = false; }}
        onPointerUp={(e) => {
          const s = start.current; start.current = null;
          if (s == null) return;
          const dy = e.clientY - s;
          if (Math.abs(dy) > 24) { dragged.current = true; move(dy < 0 ? 1 : -1); }
        }}
        onClick={() => {
          if (dragged.current) { dragged.current = false; return; }
          set({ sheet: sheet === 'full' ? 'half' : 'full' });
        }}
      ><span /></button>
    </div>
  );
}

function Cutscene() {
  const c = useSim((s) => s.cutscene);
  if (!c) return null;
  return (
    <button className="cutscene" onClick={() => useSim.getState().set({ cutscene: null })} aria-label={tx("Salta la scena (Esc)")}>
      <span className="cs-time">{tx(c.subtitle)}</span>
      <span className="cs-title">{tx(c.title)}</span>
      <span className="cs-skip">{tx("tocca per saltare")}</span>
    </button>
  );
}
