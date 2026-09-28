import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store.ts';
import { get } from '../api.ts';
import { Chip, Badge, Spinner, Empty } from './common.tsx';
import { CATEGORY } from '../i18n.ts';
import { getMap } from '../map/MapView.tsx';
import type { GeoJSONSource } from 'maplibre-gl';
import { placeIconFor, landmarkFor } from '../map/sprites.ts';
import { hhmm } from '../../shared/time.ts';

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
  useEffect(() => {
    const q = from && to ? `?date=${date}&from=${date}T${from}&to=${to <= from ? nextDay(date) : date}T${to}` : `?date=${date}`;
    get<{ places: any[] }>(`/api/places${q}`).then((r) => { setPlaces(r.places); setErr(null); }).catch((e) => setErr(e.message));
  }, [date, from, to]);
  const cats = f.cats.flatMap((g) => GROUPS[g] ?? []);
  const shown = useMemo(() => (places ?? []).filter((p) => (!cats.length || cats.includes(p.category)) && (!f.q || p.name.toLowerCase().includes(f.q.toLowerCase())) && (!(from && to) || p.openDuring !== 'closed')), [places, cats, f.q, from, to]);
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
      <label className="check"><input type="checkbox" checked={f.showOsm} onChange={(e) => setF({ showOsm: e.target.checked })} /> Mostra anche i punti OpenStreetMap non curati (da verificare)</label>
      {err ? <div className="notice bad">{err}</div> : !places ? <Spinner /> : !shown.length ? <Empty title="Nessun luogo con questi filtri" /> : (
        <ul className="place-list">
          {shown.map((p) => (
            <li key={p.id}>
              <button className="place-row" onClick={() => set({ placeCard: p.id })}>
                <span className="pr-name">{p.name}</span>
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

export function EventsView() {
  const meta = useApp((s) => s.meta);
  const set = useApp((s) => s.set);
  const [tab, setTab] = useState<'today' | 'tomorrow' | 'week'>('today');
  const [data, setData] = useState<any>(null);
  const today = meta?.today ?? new Date().toISOString().slice(0, 10);
  useEffect(() => {
    const from = tab === 'tomorrow' ? nextDay(today) : today;
    const days = tab === 'week' ? 7 : 1;
    setData(null);
    get<any>(`/api/events?from=${from}&days=${days - 1}`).then(setData).catch(() => setData({ occurrences: [], notice: 'Calendario non disponibile.' }));
  }, [tab, today]);
  return (
    <div className="events">
      <h2>Eventi</h2>
      <div className="seg" role="tablist">
        {([['today', 'Oggi'], ['tomorrow', 'Domani'], ['week', 'Settimana']] as const).map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v}</button>)}
      </div>
      <div className="notice demo"><Badge kind="demo">DEMO</Badge> {data?.notice ?? 'Calendario dimostrativo.'}</div>
      {!data ? <Spinner /> : !data.occurrences.length ? <Empty title="Nessun evento in questo periodo">Non inventiamo eventi per riempire una giornata vuota.</Empty> : (
        <ul className="event-list">
          {data.occurrences.map((o: any) => (
            <li key={o.sessionId} className={o.status !== 'scheduled' ? 'off' : ''}>
              <div className="ev-time">{o.start.slice(8, 10)}/{o.start.slice(5, 7)} {o.timeCertain ? hhmm(o.start) : 'orario da confermare'}{o.end ? `–${hhmm(o.end)}` : ''}</div>
              <div className="ev-body">
                <strong>{o.title}</strong> {o.status !== 'scheduled' ? <Badge kind="bad">{({ cancelled: 'annullato', sold_out: 'esaurito', postponed: 'rinviato' } as any)[o.status]}</Badge> : null}
                <div className="muted">{o.placeName} {o.note ? `· ${o.note}` : ''}</div>
                <button className="link" onClick={() => set({ placeCard: o.placeId })}>Scheda del luogo</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
