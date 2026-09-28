import { lazy, Suspense, useEffect, useState } from 'react';
import { useApp, useSim } from './store.ts';
import { get } from './api.ts';
import MapView from './map/MapView.tsx';
import Home from './ui/Home.tsx';
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
import { Toast, Badge, Spinner } from './ui/common.tsx';
import { useSimulation } from './sim/useSimulation.ts';
import { t } from './i18n.ts';
import { skipScene, play, pause } from './sim/actions.ts';

const Admin = lazy(() => import('./ui/Admin.tsx'));

export default function App() {
  const view = useApp((s) => s.view);
  const meta = useApp((s) => s.meta);
  const metaError = useApp((s) => s.metaError);
  const set = useApp((s) => s.set);
  const settings = useApp((s) => s.settings);
  const webgl = useApp((s) => s.webgl);
  const sheet = useApp((s) => s.sheet);
  const online = useApp((s) => s.online);
  const [shareToken, setShareToken] = useState<string | null>(null);
  useSimulation();

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

  const showMap = webgl === 'ok' && !settings.listView;
  const nav = (v: typeof view) => { set({ view: v, placeCard: null }); if (v !== 'share' && location.pathname !== '/') history.pushState(null, '', '/'); };

  return (
    <div className={`app view-${view} sheet-${sheet}`}>
      <header className="topbar">
        <button className="brand" onClick={() => nav('home')} aria-label="Torna all'inizio">
          <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden><path d="M6 44 C18 30 26 34 32 24 C38 14 46 22 58 12 L58 58 L6 58Z" fill="#a9b98f" stroke="#2b2a27" strokeWidth="3" /><path d="M6 50 C20 46 34 52 58 46 L58 58 L6 58Z" fill="#7fb7c9" stroke="#2b2a27" strokeWidth="3" /><circle cx="46" cy="18" r="5" fill="#c8643c" stroke="#2b2a27" strokeWidth="2.5" /></svg>
          <span>{t('app.name')}</span>
        </button>
        <button className="demo-pill" onClick={() => nav('about')} title={t('demo.text')}><Badge kind="demo">{t('demo.badge')}</Badge><span className="demo-text">{meta?.ai.configured ? 'AI live · dati parziali' : 'dati dimostrativi e stime'}</span></button>
        <nav className="topnav" aria-label="Navigazione principale">
          <button onClick={() => nav('explore')} aria-current={view === 'explore'}>Esplora</button>
          <button onClick={() => nav('events')} aria-current={view === 'events'}>Eventi</button>
          <button onClick={() => nav('saved')} aria-current={view === 'saved'}>Salvati</button>
          <button onClick={() => nav('settings')} aria-current={view === 'settings'} aria-label="Impostazioni">⚙︎</button>
        </nav>
      </header>
      {!online ? <div className="offline-banner" role="status">Siete offline: potete consultare i programmi salvati su questo dispositivo, ma senza verifiche aggiornate.</div> : null}
      <main className="stage">
        {metaError ? <div className="fatal"><h2>Servizio non raggiungibile</h2><p>{metaError}</p><button className="btn" onClick={() => location.reload()}>Riprova</button></div>
          : !meta ? <div className="loading-map"><Spinner /> Carico la piccola Lugano…</div>
          : showMap ? <MapView onFallback={() => { /* il componente segnala lo stato webgl */ }} /> : <Fallback />}
        <Cutscene />
      </main>
      <aside id="panel" className={`panel ${view === 'admin' ? 'panel-wide' : ''}`} aria-label="Pannello">
        <div className="sheet-handle">
          <button aria-label="Riduci il pannello" onClick={() => set({ sheet: sheet === 'full' ? 'half' : 'peek' })}>▾</button>
          <span />
          <button aria-label="Espandi il pannello" onClick={() => set({ sheet: sheet === 'peek' ? 'half' : 'full' })}>▴</button>
        </div>
        <div className="panel-body">
          {view === 'home' && <Home />}
          {view === 'wizard' && <Wizard />}
          {view === 'planning' && <Planning />}
          {view === 'results' && <Results />}
          {view === 'sim' && <SimPanel />}
          {view === 'summary' && <Summary />}
          {view === 'explore' && <Explore />}
          {view === 'events' && <EventsView />}
          {view === 'saved' && <Saved />}
          {view === 'settings' && <Settings />}
          {view === 'about' && <About />}
          {view === 'share' && shareToken && <ShareView token={shareToken} />}
          {view === 'admin' && <Suspense fallback={<Spinner />}><Admin /></Suspense>}
        </div>
      </aside>
      {view === 'sim' ? <SimControls /> : null}
      <PlaceCard />
      <Toast />
    </div>
  );
}

function Cutscene() {
  const c = useSim((s) => s.cutscene);
  if (!c) return null;
  return (
    <button className="cutscene" onClick={() => useSim.getState().set({ cutscene: null })} aria-label="Salta la scena (Esc)">
      <span className="cs-time">{c.subtitle}</span>
      <span className="cs-title">{c.title}</span>
      <span className="cs-skip">Tocca o premi Esc per saltare</span>
    </button>
  );
}
