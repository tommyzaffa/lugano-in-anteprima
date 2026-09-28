import { useApp, defaultDraft, makePerson, type Draft } from '../store.ts';
import { t } from '../i18n.ts';
import { Badge } from './common.tsx';
import { track } from '../api.ts';

const PRESETS: { id: string; title: string; sub: string; apply: (d: Draft) => Draft }[] = [
  {
    id: 'friends', title: 'Serata fra amici', sub: '4 persone · dalla stazione · chill ma sociale, niente discoteca',
    apply: (d) => ({ ...d, people: Array.from({ length: 4 }, (_, i) => makePerson(i)), startTime: '18:30', endTime: '23:59', occasion: 'friends', moods: ['chill', 'lively'], avoid: ['nightclub'], budget: { amount: 60, per: 'person', strict: false } }),
  },
  {
    id: 'couple', title: 'Due persone fra paesaggio e cultura', sub: 'Panorami, musei e rientro entro le 18',
    apply: (d) => ({ ...d, people: [makePerson(0), makePerson(1)], startTime: '09:30', endTime: '18:00', occasion: 'date', moods: ['views', 'cultural'], budget: { amount: 120, per: 'person', strict: false } }),
  },
  {
    id: 'family', title: 'Famiglia con passeggino', sub: '2 adulti e 2 bambini · niente scale · pause frequenti',
    apply: (d) => ({ ...d, people: [makePerson(0), makePerson(1), { ...makePerson(2, 'child'), ageBand: '0-5' }, { ...makePerson(3, 'child'), ageBand: '6-11' }], startTime: '10:00', endTime: '17:00', occasion: 'family', moods: ['nature'], mobility: { stroller: true, wheelchair: false, avoidStairs: true, frequentBreaks: true }, pace: 'relaxed' }),
  },
  {
    id: 'mountain', title: 'Monte e rientro', sub: 'Brè, San Salvatore o Boglia, con collegamenti e ultima corsa',
    apply: (d) => ({ ...d, people: [makePerson(0), makePerson(1)], startTime: '09:00', endTime: '18:30', occasion: 'leisure', moods: ['views', 'nature', 'adventure'], pace: 'intense' }),
  },
];

export default function Home() {
  const set = useApp((s) => s.set);
  const meta = useApp((s) => s.meta);
  const setDraft = useApp((s) => s.setDraft);
  const draft = useApp((s) => s.draft);
  const saved = useApp((s) => s.saved);
  const start = (preset?: (d: Draft) => Draft) => {
    const today = meta?.today ?? new Date().toISOString().slice(0, 10);
    const base = draft ?? defaultDraft(today);
    const withDate = { ...base, date: base.date < today ? today : base.date };
    if (preset) {
      const p = preset(defaultDraft(today));
      // una data futura scelta in precedenza resta; altrimenti oggi, o domani se l'esempio sarebbe già iniziato
      const date = withDate.date > today ? withDate.date : zurichNow() > p.startTime ? nextDay(today) : today;
      useApp.setState({ draft: { ...p, date } });
    } else useApp.setState({ draft: withDate });
    setDraft((d) => d);
    set({ view: 'wizard', wizardStep: preset ? 5 : 0 });
  };
  /** «Siamo già qui»: partenza da adesso (arrotondato) e dalla posizione, se concessa. */
  const startHere = () => {
    const today = meta?.today ?? new Date().toISOString().slice(0, 10);
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const parts = fmt.format(new Date(Math.ceil(now.getTime() / 300_000) * 300_000));
    const endParts = fmt.format(new Date(Math.ceil(now.getTime() / 300_000) * 300_000 + 3 * 3600_000));
    const base = draft ?? defaultDraft(today);
    useApp.setState({ draft: { ...base, date: today, startTime: parts, endTime: endParts, end: { mode: 'free' }, resolutions: {} } });
    setDraft((d) => d);
    set({ view: 'wizard', wizardStep: 1 });
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(
      (pos) => setDraft((d) => ({ ...d, start: { kind: 'geolocation', label: 'La mia posizione', lon: pos.coords.longitude, lat: pos.coords.latitude, sensitive: true } })),
      () => useApp.getState().notify('Posizione non concessa: scegliete un punto di partenza.', 'info'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };
  return (
    <div className="home">
      <p className="lead">{t('app.promise')}</p>
      <div className="home-actions">
        <button className="big-action primary" onClick={() => start()}>
          <span className="ba-title">{t('home.plan')}</span>
          <span className="ba-sub">{t('home.plan.sub')}</span>
        </button>
        <button className="big-action" onClick={() => { set({ view: 'explore' }); track('explore_opened'); }}>
          <span className="ba-title">{t('home.explore')}</span>
          <span className="ba-sub">{t('home.explore.sub')}</span>
        </button>
      </div>
      <button className="preset here" onClick={() => startHere()}>
        <strong>Siamo già in giro</strong><span>Ricalcola da adesso e da dove siete, con il tempo che vi resta</span>
      </button>
      <h3 className="small-title">Oppure partite da un esempio</h3>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.id} className="preset" onClick={() => start(p.apply)}>
            <strong>{p.title}</strong><span>{p.sub}</span>
          </button>
        ))}
      </div>
      <div className="home-links">
        <button className="link" onClick={() => set({ view: 'events' })}>Eventi: oggi, domani, settimana</button>
        {saved.length && meta?.features?.sharing ? <button className="link" onClick={() => set({ view: 'saved' })}>Programmi salvati ({saved.length})</button> : null}
        <button className="link" onClick={() => set({ view: 'about' })}>Dati, fonti e limiti</button>
      </div>
      {meta ? (
        <p className="fineprint">
          Area coperta: {meta.perimeter.sizeKm.width}×{meta.perimeter.sizeKm.height} km, dal Monte Boglia al San Salvatore, da Canobbio a Melide. <Badge kind="demo">{t('demo.badge')}</Badge> {meta.ai.label}.
          {' '}Prototipo dimostrativo: non è un servizio ufficiale della Città di Lugano né di Lugano Region.
        </p>
      ) : null}
    </div>
  );
}

/** Ora corrente a Zurigo (HH:MM), indipendente dal fuso del dispositivo. */
function zurichNow(): string {
  return new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
}
function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
