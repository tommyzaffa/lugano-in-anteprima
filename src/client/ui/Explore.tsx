import { tx, getLocale } from '../locale.ts';
import { safeUrl } from '../safe-url.ts';
import { useEffect, useMemo, useState } from 'react';
import { useApp, defaultDraft } from '../store.ts';
import { get } from '../api.ts';
import { Chip, Badge, Spinner, Empty } from './common.tsx';
import { CATEGORY } from '../i18n.ts';
import { getMap, useMap } from '../map/map-state.ts';
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
  const activeMap = useMap();
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
  const cats = useMemo(() => f.cats.flatMap((g) => GROUPS[g] ?? []), [f.cats]);
  const [visibleCount, setVisibleCount] = useState(60);
  useEffect(() => setVisibleCount(60), [f.q, f.cats, onlyFavs, from, to, date]);
  const shown = useMemo(() => (places ?? []).filter((p) => (!cats.length || cats.includes(p.category)) && (!f.q || p.name.toLowerCase().includes(f.q.toLowerCase())) && (!(from && to) || p.openDuring !== 'closed') && (!onlyFavs || favs.includes(p.id))), [places, cats, f.q, from, to, onlyFavs, favs]);
  // aggiorna i luoghi mostrati sulla mappa
  useEffect(() => {
    const map = getMap();
    if (!map || !places) return;
    const update = () => {
    const src = map.getSource('places') as GeoJSONSource | undefined;
    if (!src) return;
    src.setData({ type: 'FeatureCollection', features: shown.map((p) => ({ type: 'Feature', properties: { id: p.id, name: p.name.replace(/\s*\(.*?\)\s*/g, ''), icon: placeIconFor(p.category), ...(landmarkFor(p.id, p.category) ? { landmark: landmarkFor(p.id, p.category) } : {}) }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) });
    };
    if (map.isStyleLoaded()) update(); else map.once('load', update);
    return () => { map.off('load', update); };
  }, [shown, places, activeMap]);
  useEffect(() => () => {
    // ripristina tutti i luoghi uscendo dall'esplorazione
    const map = getMap();
    const src = map?.getSource('places') as GeoJSONSource | undefined;
    if (src) get<{ places: any[] }>('/api/places').then((r) => src.setData({ type: 'FeatureCollection', features: r.places.map((p) => ({ type: 'Feature', properties: { id: p.id, name: p.name.replace(/\s*\(.*?\)\s*/g, ''), icon: placeIconFor(p.category), ...(landmarkFor(p.id, p.category) ? { landmark: landmarkFor(p.id, p.category) } : {}) }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) })).catch(() => {});
  }, []);
  return (
    <div className="explore">
      <h2>{tx("Esplora")}</h2>
      <input type="search" placeholder={tx("Cerca un luogo…")} value={f.q} onChange={(e) => setF({ q: e.target.value })} aria-label={tx("Cerca un luogo")} />
      <div className="chips">{Object.keys(GROUPS).map((g) => <Chip key={g} on={f.cats.includes(g)} onClick={() => setF({ cats: f.cats.includes(g) ? f.cats.filter((x) => x !== g) : [...f.cats, g] })}>{tx(g)}</Chip>)}</div>
      <details className="more open-during" open={!!(from || to)}>
        <summary>{tx("Aperto quando ci andate ")}<span className="muted">{tx(from && to ? `· ${from}–${to}` : '')}</span></summary>
        <div className="row">
          <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} aria-label={tx("Data")} />
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={tx("Dalle")} />
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} aria-label={tx("Alle")} />
        </div>
        {from || to ? <button className="link" onClick={() => { setFrom(''); setTo(''); }}>{tx("azzera")}</button> : null}
      </details>
      <details className="more">
        <summary>{tx("Altre opzioni")}</summary>
        <label className="check block"><input type="checkbox" checked={onlyFavs} onChange={(e) => setOnlyFavs(e.target.checked)} />{tx(" Solo i preferiti (")}{tx(favs.length)})</label>
        <label className="check block"><input type="checkbox" checked={f.showOsm} onChange={(e) => setF({ showOsm: e.target.checked })} />{tx(" Anche i punti OpenStreetMap non curati")}</label>
        <div className="legend">
          <ul>
            <li><span className="sw sw-yellow" aria-hidden />{tx(" sentiero escursionistico")}</li>
            <li><span className="sw sw-red" aria-hidden />{tx(" di montagna (bianco-rosso-bianco)")}</li>
            <li><span className="sw sw-blue" aria-hidden />{tx(" alpino (bianco-blu-bianco)")}</li>
          </ul>
          <p className="hint">{tx("Difficoltà da OpenStreetMap: sul posto vale la segnaletica. Le figurine nelle piazze sono decorative.")}</p>
        </div>
      </details>
      {err ? <div className="notice bad">{tx(err)}</div> : !places ? <Spinner /> : !shown.length ? <Empty title={tx("Nessun luogo con questi filtri")} /> : (
        <><ul className="place-list">
          {shown.slice(0, visibleCount).map((p) => (
            <li key={p.id}>
              <button className="place-row" onClick={() => set({ placeCard: p.id })}>
                <span className="pr-name">{tx(favs.includes(p.id) ? '★ ' : '')}{tx(p.name)}{visited.includes(p.id) ? <span className="muted">{tx(" · visitato")}</span> : null}</span>
                <span className="pr-meta">{tx(CATEGORY[p.category] ?? p.category)} · {tx(p.hoursToday ?? 'orari non noti')} {tx(from && to ? (p.openDuring === 'open' ? <Badge kind="ok">{tx("aperto")}</Badge> : p.openDuring === 'unknown' ? <Badge kind="warn">{tx("da verificare")}</Badge> : null) : null)}</span>
              </button>
            </li>
          ))}
        </ul>
        {shown.length > visibleCount && <button className="btn-ghost" onClick={() => setVisibleCount((n) => n + 60)}>{tx("Mostra altri luoghi")} ({shown.length - visibleCount})</button>}</>
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
      (!cats.length || cats.includes(o.category))
      && (!needle || `${o.title} ${o.placeName ?? ''} ${o.description ?? ''}`.toLowerCase().includes(needle)));
  }, [data, q, cats]);
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
  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const o of shown) { const d = o.start.slice(0, 10); if (!m.has(d)) m.set(d, []); m.get(d)!.push(o); }
    return [...m.entries()];
  }, [shown]);
  const ongoing: any[] = data?.ongoing ?? [];
  return (
    <div className="events">
      <h2>{tx("Eventi")}</h2>
      {getLocale() !== 'it' && <p className="hint">{tx("Descrizioni e titoli delle fonti restano nella lingua originale.")}</p>}
      <div className="seg" role="tablist">
        {([['today', 'Oggi'], ['tomorrow', 'Domani'], ['week', 'Settimana']] as const).map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{tx(v)}</button>)}
      </div>
      {data?.demo ? <div className="notice demo"><Badge kind="demo">{tx("DEMO")}</Badge> {tx(data.notice)}</div> : null}
      <input type="search" placeholder={tx("Cerca un evento o un luogo…")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tx("Cerca negli eventi")} />
      {categories.length > 1 ? <div className="chips">{categories.map((c) => <Chip key={c} on={cats.includes(c)} onClick={() => setCats((x) => x.includes(c) ? x.filter((y) => y !== c) : [...x, c])}>{tx(EVENT_CAT[c] ?? c)}</Chip>)}</div> : null}
      {!data ? <Spinner /> : !shown.length ? <Empty title={tx(data.occurrences.length ? 'Nessun evento con questi filtri' : 'Nessun evento in questo periodo')}>{tx(data.occurrences.length ? 'Provate a togliere un filtro.' : 'Non inventiamo eventi per riempire una giornata vuota.')}</Empty> : byDay.map(([day, list]) => (
        <div key={day}>
          {tab === 'week' ? <h3 className="day-head">{tx(new Date(`${day}T12:00:00Z`).toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }))}</h3> : null}
          <ul className="event-list">
            {list.map((o: any) => (
              <li key={o.sessionId} className={o.status !== 'scheduled' ? 'off' : ''}>
                <div className="ev-time">{tx(o.timeCertain ? hhmm(o.start) : '—')}</div>
                <div className="ev-body">
                  <strong>{tx(o.title)}</strong>
                  <div className="muted">{tx(o.placeName ?? '')}{o.status !== 'scheduled' ? <> · <Badge kind="bad">{tx(({ cancelled: 'annullato', sold_out: 'esaurito', postponed: 'rinviato' } as any)[o.status])}</Badge></> : null}</div>
                  <div className="ev-actions">
                    {o.status === 'scheduled' && Date.parse(o.start) > Date.now() ? <button className="link" onClick={() => planWith(o)}>{tx("Organizza la giornata")}</button> : null}
                    {o.url ? <a href={safeUrl(o.url)} target="_blank" rel="noopener noreferrer">{tx("Scheda ufficiale")}</a> : <button className="link" onClick={() => set({ placeCard: o.placeId })}>{tx("Il luogo")}</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {tx(ongoing.length ? (
        <details className="more">
          <summary>{tx("Mostre in corso ")}<span className="muted">· {tx(ongoing.length)}</span></summary>
          <ul className="event-list">
            {ongoing.map((o) => (
              <li key={o.eventId}>
                <div className="ev-time" aria-hidden>🖼</div>
                <div className="ev-body">
                  <strong>{tx(o.title)}</strong>
                  <div className="muted">{tx(o.placeName ?? '')}{tx(" · fino al ")}{tx(o.to.slice(8, 10))}/{tx(o.to.slice(5, 7))}</div>
                  <div className="ev-actions">{o.url ? <a href={safeUrl(o.url)} target="_blank" rel="noopener noreferrer">{tx("Scheda ufficiale")}</a> : null}{o.placeId ? <button className="link" onClick={() => set({ placeCard: o.placeId })}>{tx("Il luogo")}</button> : null}</div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null)}
      {data && !data.demo ? <p className="source-line">{tx(data.notice)}</p> : null}
    </div>
  );
}
