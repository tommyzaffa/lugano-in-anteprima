import { useEffect, useRef, useState } from 'react';
import type { Location } from '../../shared/types.ts';
import { get, track } from '../api.ts';
import { getMap } from '../map/MapView.tsx';
import { useApp } from '../store.ts';
import * as maplibregl from 'maplibre-gl';

interface Result { kind: 'place' | 'stop' | 'address' | 'poi'; id: string; label: string; sub: string; lon: number; lat: number }


export default function LocationPicker({ value, onChange, id, allowSensitive = true }: { value: Location | undefined; onChange: (l: Location) => void; id: string; allowSensitive?: boolean }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [picking, setPicking] = useState(false);
  const notify = useApp((s) => s.notify);
  const QUICK: Location[] = (useApp((s) => s.meta?.quickStarts) ?? []) as Location[];
  const acRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    const tmo = setTimeout(() => {
      get<{ results: Result[] }>(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ac.signal }).then((r) => setResults(r.results.slice(0, 12))).catch(() => {});
    }, 180);
    return () => { clearTimeout(tmo); ac.abort(); };
  }, [q]);

  const choose = (r: Result) => {
    onChange({ kind: r.kind === 'stop' ? 'stop' : r.kind === 'place' ? 'place' : r.kind === 'address' ? 'address' : 'point', label: r.label, lon: r.lon, lat: r.lat, placeId: r.kind === 'place' ? r.id : undefined, stopId: r.kind === 'stop' ? r.id : undefined, sensitive: r.kind === 'address' });
    setQ(''); setResults([]);
  };

  const geolocate = () => {
    if (!navigator.geolocation) { notify('Posizione non disponibile su questo dispositivo.', 'error'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { onChange({ kind: 'geolocation', label: 'La mia posizione', lon: p.coords.longitude, lat: p.coords.latitude, sensitive: true }); track('geolocation_used'); },
      () => notify('Posizione non concessa: potete scegliere un luogo o una fermata.', 'error'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const pickOnMap = () => {
    const map = getMap();
    if (!map) { notify('Mappa non disponibile: usate la ricerca.', 'error'); return; }
    setPicking(true);
    map.getCanvas().style.cursor = 'crosshair';
    useApp.getState().set({ sheet: 'peek' });
    const marker = new maplibregl.Marker({ color: '#c8643c' });
    map.once('click', (e) => {
      map.getCanvas().style.cursor = '';
      setPicking(false);
      marker.setLngLat(e.lngLat).addTo(map);
      setTimeout(() => marker.remove(), 2500);
      onChange({ kind: 'point', label: `Punto sulla mappa (${e.lngLat.lat.toFixed(4)}, ${e.lngLat.lng.toFixed(4)})`, lon: e.lngLat.lng, lat: e.lngLat.lat, sensitive: true });
      useApp.getState().set({ sheet: 'half' });
    });
  };

  return (
    <div className="loc-picker">
      <div className="loc-current" aria-live="polite">{value ? <><span aria-hidden>📍</span> <strong>{value.label}</strong></> : <span className="muted">Nessun punto scelto</span>}</div>
      <div className="loc-quick">
        {QUICK.map((l) => <button type="button" key={l.label} className={`chip ${value?.label === l.label ? 'on' : ''}`} onClick={() => onChange(l)}>{l.label}</button>)}
      </div>
      <div className="loc-search">
        <input id={id} type="search" placeholder="Cerca luogo, fermata o indirizzo…" value={q} onChange={(e) => setQ(e.target.value)} aria-autocomplete="list" aria-controls={results.length ? `${id}-list` : undefined} autoComplete="off" />
        {results.length ? (
          <ul className="loc-results" id={`${id}-list`} role="listbox">
            {results.map((r) => (
              <li key={`${r.kind}-${r.id}`} role="option" aria-selected={false}><button type="button" onClick={() => choose(r)}><strong>{r.label}</strong><span>{r.sub}</span></button></li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="loc-actions">
        <button type="button" className="link" onClick={pickOnMap} aria-pressed={picking}>{picking ? 'Toccate la mappa…' : 'Scegli sulla mappa'}</button>
        {allowSensitive ? <button type="button" className="link" onClick={geolocate}>Usa la mia posizione</button> : null}
      </div>
    </div>
  );
}
