import { useEffect, useMemo, useState } from 'react';
import { useApp, defaultDraft } from '../store.ts';
import { get } from '../api.ts';
import { Chip, Badge, Spinner, Empty } from './common.tsx';
import { CATEGORY } from '../i18n.ts';
import { getMap } from '../map/MapView.tsx';
import type { GeoJSONSource } from 'maplibre-gl';
import { placeIconFor, landmarkFor } from '../map/sprites.ts';
import { hhmm } from '../../shared/time.ts';
import { usePersonal } from '../personal.ts';

const GROUPS: Record<string, string[]> = {
  'Cultura': ['museum', 'culture', 'church', 'show'],
  'Natura e parchi': ['park', 'walk', 'hike', 'playground', 'lido'],
  'Panorami': ['viewpoint', 'summit', 'lift'],
  'Borghi': ['village', 'attraction'],
  'Mangiare': ['restaurant', 'cafe', 'gelato', 'market'],
  'Sera': ['bar', 'nightlife'],
};

export default function Explore() {
  const f = useApp((s) => s.exploreFilter);
  const set = useApp((s) => s.set);
  const meta = useApp((s) => s.meta);
  const [places, setPlaces] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const today = meta?.today ?? new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const setF = (p: Partial<typeof f>) => set({ exploreFilter: { ...f, ...p } });
  const { favs, visited } = usePersonal();
  const [onlyFavs, setOnlyFavs] = useState(false);
  useEffect(() => {
    const q = from && to ? `?date=${date}&from=${date}T${from}&to=${to <= from ? nextDay(date) : date}T${to}` : `?date=${date}`;
    get<{ places: any[] }>(`/api/places${q}`).then((r) => { setPlaces(r.places); setErr(null); }).catch((e) => setErr(e.message));
  }, [date, from, to]);
  const cats = f.cats.flatMap((g) => GROUPS[g] ?? []);
  const shown = useMemo(() => (places ?? []).filter((p) => (!cats.length || cats.includes(p.category)) && (!f.q || p.name.toLowerCase().includes(f.q.toLowerCase())) && (!(from && to) || p.openDuring !== 'closed') && (!onlyFavs || favs.includes(p.id))), [places, cats, f.q, from, to, onlyFavs, favs]);
  // aggiorna i luoghi mostrati sulla mappa
  useEffect(() => {
    const map = getMap();
    const src = map?.getSource('places') as GeoJSONSource | undefined;
    if (!src || !places) return;
    src.setData({ type: 'FeatureCollection', features: shown.map((p) => ({ type: 'Feature', properties: { id: p.id, name: p.name.replace(/\s*\(.*?\)\s*/g, ''), icon: placeIconFor(p.category), ...(landmarkFor(p.id, p.category) ? { landmark: landmarkFor(p.id, p.category) } : {}) }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) });
  }, [shown, places]);
  useEffect(() => () => {
    // ripristina tutti i luoghi uscendo dall'esplorazione
    const map = getMap();
    const src = map?.getSource('places') as GeoJSONSource | undefined;
    if (src) get<{ places: any[] }>('/api/places').then((r) => src.setData({ type: 'FeatureCollection', features: r.places.map((p) => ({ type: 'Feature', properties: { id: p.id, name: p.name.replace(/\s*\(.*?\)\s*/g, ''), icon: placeIconFor(p.category), ...(landmarkFor(p.id, p.category) ? { landmark: landmarkFor(p.id, p.category) } : {}) }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) })).catch(() => {});
  }, []);
  return (
    <div className="explore">
      <h2>Esplora liberamente</h2>
      <input type="search" placeholder="Cerca un luogo…" value={f.q} onChange={(e) => setF({ q: e.target.value })} aria-label="Cerca un luogo" />
      <div className="chips">{Object.keys(GROUPS).map((g) => <Chip key={g} on={f.cats.includes(g)} onClick={() => setF({ cats: f.cats.includes(g) ? f.cats.filter((x) => x !== g) : [...f.cats, g] })}>{g}</Chip>)}</div>
      <fieldset className="open-during">
        <legend>Aperto durante la mia visita</legend>
        <div className="row wrap">
          <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} aria-label="Data" />
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Dalle" />
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Alle" />
          {from || to ? <button className="link" onClick={() => { setFrom(''); setTo(''); }}>azzera</button> : null}
        </div>
        <p className="hint">Filtra sull'intervallo richiesto, non solo sull'ora attuale. I luoghi senza orari noti restano visibili come «da verificare».</p>
      </fieldset>
      <label className="check"><input type="checkbox" checked={onlyFavs} onChange={(e) => setOnlyFavs(e.target.checked)} /> Solo i miei preferiti ({favs.length})</label>
      <label className="check"><input type="checkbox" checked={f.showOsm} onChange={(e) => setF({ showOsm: e.target.checked })} /> Mostra anche i punti OpenStreetMap non curati (da verificare)</label>
      <details className="legend">
        <summary>Legenda della mappa</summary>
        <ul>
          <li><span className="sw sw-yellow" aria-hidden /> escursionistico</li>
          <li><span className="sw sw-red" aria-hidden /> di montagna (bianco-rosso-bianco)</li>
          <li><span className="sw sw-blue" aria-hidden /> alpino (bianco-blu-bianco)</li>
        </ul>
        <p className="hint">Colori ricavati dalla difficoltà indicata in OpenStreetMap (sac_scale), non dalla segnaletica ufficiale: sul posto vale quella dei cartelli. Condizioni del sentiero non verificate.</p>
        <p className="hint">Le piccole figure nelle piazze e nei parchi (visibili da vicino) sono decorative: sempre le stesse, a ogni ora. Non indicano quante persone ci sono davvero.</p>
      </details>
      {err ? <div className="notice bad">{err}</div> : !places ? <Spinner /> : !shown.length ? <Empty title="Nessun luogo con questi filtri" /> : (
        <ul className="place-list">
          {shown.map((p) => (
            <li key={p.id}>
              <button className="place-row" onClick={() => set({ placeCard: p.id })}>
                <span className="pr-name">{favs.includes(p.id) ? '★ ' : ''}{p.name}{visited.includes(p.id) ? <span className="muted"> · già visitato</span> : null}</span>
                <span className="pr-meta">{CATEGORY[p.category] ?? p.category} · {p.area ?? p.municipality?.name}</span>
                <span className="pr-hours">{p.hoursToday ?? 'orari non disponibili'} {from && to ? (p.openDuring === 'open' ? <Badge kind="ok">aperto nell'intervallo</Badge> : p.openDuring === 'unknown' ? <Badge kind="warn">da verificare</Badge> : null) : null}</span>
                <span className="pr-price muted">{p.priceHint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function nextDay(d: string) { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }

const EVENT_CAT: Record<string, string> = { concert: 'Concerti', festival: 'Feste e festival', party: 'Serate', show: 'Spettacoli', market: 'Mercati', cinema: 'Cinema', workshop: 'Laboratori', tour: 'Visite guidate', sport: 'Sport', exhibition: 'Mostre' };

export function EventsView() {
  const meta = useApp((s) => s.meta);
  const set = useApp((s) => s.set);
  const [tab, setTab] = useState<'today' | 'tomorrow' | 'week'>('today');
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [showOff, setShowOff] = useState(true);
  const today = meta?.today ?? new Date().toISOString().slice(0, 10);
  useEffect(() => {
    const from = tab === 'tomorrow' ? nextDay(today) : today;
    const days = tab === 'week' ? 7 : 1;
    setData(null);
    get<any>(`/api/events?from=${from}&days=${days - 1}`).then(setData).catch(() => setData({ occurrences: [], notice: 'Calendario non disponibile.' }));
  }, [tab, today]);
  const categories = useMemo(() => [...new Set<string>((data?.occurrences ?? []).map((o: any) => o.category).filter(Boolean))].sort(), [data]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.occurrences ?? []).filter((o: any) =>
      (showOff || o.status === 'scheduled')
      && (!cats.length || cats.includes(o.category))
      && (!needle || `${o.title} ${o.placeName ?? ''} ${o.description ?? ''}`.toLowerCase().includes(needle)));
  }, [data, q, cats, showOff]);
  // segnaposti sulla mappa per gli eventi mostrati; si tolgono uscendo dalla vista
  // un segnaposto per evento e luogo (la prima occorrenza in programma); nella settimana l'etichetta porta la data
  const pins = useMemo(() => {
    const byKey = new Map<string, any>();
    for (const o of shown) {
      if (o.lon == null) continue;
      const k = `${o.eventId}@${o.placeId}`;
      const prev = byKey.get(k);
      if (!prev || (prev.status !== 'scheduled' && o.status === 'scheduled')) byKey.set(k, o);
    }
    return [...byKey.values()].map((o: any) => ({ id: o.sessionId, lon: o.lon, lat: o.lat, title: o.title, time: `${tab === 'week' ? `${o.start.slice(8, 10)}/${o.start.slice(5, 7)} ` : ''}${o.timeCertain ? hhmm(o.start) : '?'}`, placeId: o.placeId, status: o.status }));
  }, [shown, tab]);
  useEffect(() => { set({ eventPins: pins }); }, [pins, set]);
  useEffect(() => () => set({ eventPins: [] }), [set]);
  const planWith = (o: any) => {
    const app = useApp.getState();
    const base = app.draft ?? defaultDraft(today);
    const date = o.start.slice(0, 10);
    // la finestra della giornata deve contenere l'evento, con margine per arrivare e ripartire
    const shift = (hm: string, min: number) => { const [h, m] = hm.split(':').map(Number); const t = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + min)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
    const evStart = hhmm(o.start), evEnd = o.end ? hhmm(o.end) : shift(evStart, 90);
    const startTime = base.startTime > shift(evStart, -60) ? shift(evStart, -60) : base.startTime;
    const endTime = evEnd < evStart ? '23:59' : base.endTime < shift(evEnd, 45) ? shift(evEnd, 45) : base.endTime;
    app.set({ draft: { ...base, date, startTime, endTime, mustSee: [...new Set([...base.mustSee.filter((m) => !base.mustSeeLabels?.[m]), o.eventId])], mustSeeLabels: { [o.eventId]: `${o.title} (evento)` } }, view: 'wizard', placeCard: null });
    app.notify(`«${o.title}» aggiunto come tappa obbligatoria per il ${date.split('-').reverse().join('.')}. Completate il modulo.`, 'ok');
  };
  return (
    <div className="events">
      <h2>Eventi</h2>
      <div className="seg" role="tablist">
        {([['today', 'Oggi'], ['tomorrow', 'Domani'], ['week', 'Settimana']] as const).map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v}</button>)}
      </div>
      <div className="notice demo"><Badge kind="demo">DEMO</Badge> {data?.notice ?? 'Calendario dimostrativo.'}</div>
      <input type="search" placeholder="Cerca per titolo, luogo o descrizione…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca negli eventi" />
      {categories.length > 1 ? <div className="chips">{categories.map((c) => <Chip key={c} on={cats.includes(c)} onClick={() => setCats((x) => x.includes(c) ? x.filter((y) => y !== c) : [...x, c])}>{EVENT_CAT[c] ?? c}</Chip>)}</div> : null}
      <label className="check"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Mostra anche annullati, rinviati ed esauriti</label>
      {data ? <p className="muted event-pins-status" role="status">{pins.length ? `${pins.length} ${pins.length === 1 ? 'evento segnato' : 'eventi segnati'} sulla mappa (viola; rosso se annullato, rinviato o esaurito).` : 'Nessun evento da segnare sulla mappa.'}</p> : null}
      {!data ? <Spinner /> : !shown.length ? <Empty title={data.occurrences.length ? 'Nessun evento corrisponde ai filtri' : 'Nessun evento in questo periodo'}>{data.occurrences.length ? 'Provate a togliere un filtro.' : 'Non inventiamo eventi per riempire una giornata vuota. Gli esempi del calendario dimostrativo si concentrano fra settembre e dicembre 2026.'}</Empty> : (
        <ul className="event-list">
          {shown.map((o: any) => (
            <li key={o.sessionId} className={o.status !== 'scheduled' ? 'off' : ''}>
              <div className="ev-time">{o.start.slice(8, 10)}/{o.start.slice(5, 7)} {o.timeCertain ? hhmm(o.start) : 'orario da confermare'}{o.end ? `–${hhmm(o.end)}` : ''}</div>
              <div className="ev-body">
                <strong>{o.title}</strong> {o.status !== 'scheduled' ? <Badge kind="bad">{({ cancelled: 'annullato', sold_out: 'esaurito', postponed: 'rinviato' } as any)[o.status]}</Badge> : null}
                <div className="muted">{EVENT_CAT[o.category] ?? o.category ?? ''}{o.placeName ? ` · ${o.placeName}` : ''}{o.note ? ` · ${o.note}` : ''}</div>
                <div className="row wrap">
                  <button className="link" onClick={() => set({ placeCard: o.placeId })}>Scheda del luogo</button>
                  {o.status === 'scheduled' && Date.parse(o.start) > Date.now() ? <button className="link" onClick={() => planWith(o)}>Organizza una giornata con questo evento</button> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
