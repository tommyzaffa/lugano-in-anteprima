import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap, GeoJSONSource, LngLatBoundsLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mlcontour from 'maplibre-contour';
import { buildStyle, paletteForHour, applyPalette, PALETTES } from './style.ts';
import { installImages, landmarkFor, placeIconFor } from './sprites.ts';
import { avatarSvg, vehicleSvg } from './avatars.ts';
import { useApp, useSim } from '../store.ts';
import { buildTimeline, stateAt, type Timeline } from '../../shared/simulation.ts';
import type { Plan } from '../../shared/types.ts';
import { get } from '../api.ts';

maplibregl.setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs');

let mapInstance: MLMap | null = null;
export function getMap() { return mapInstance; }

let contourSource: any = null;
function contourUrl(origin: string) {
  if (!contourSource) {
    contourSource = new mlcontour.DemSource({ url: `${origin}/terrain/{z}/{x}/{y}.png`, encoding: 'terrarium', maxzoom: 14, worker: true });
    contourSource.setupMaplibre(maplibregl);
  }
  return contourSource.contourProtocolUrl({ multiplier: 1, thresholds: { 11: [100, 500], 12: [50, 250], 14: [25, 100], 15: [10, 50] }, elevationKey: 'ele', levelKey: 'level', contourLayer: 'contours' });
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const MODE_COLOR: Record<string, string> = { walk: '#2b2a27', hike: '#b8452e', bus: '#d9a441', train: '#c0392b', funicular: '#b0442c', boat: '#2f7f95', cable_car: '#7c5e9a', wait: '#999' };

export function planRouteGeoJSON(plan: Plan | null, t: number | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (!plan) return { type: 'FeatureCollection', features };
  plan.trips.forEach((trip, ti) => trip.legs.forEach((l, li) => {
    if (l.mode === 'wait' || l.geometry.length < 2) return;
    const done = t != null && Date.parse(l.arrival) <= t;
    features.push({ type: 'Feature', properties: { mode: l.mode, color: MODE_COLOR[l.mode] ?? '#333', done: done ? 1 : 0, trip: ti, leg: li, ride: l.transit ? 1 : 0 }, geometry: { type: 'LineString', coordinates: l.geometry } });
  }));
  plan.stops.forEach((s) => {
    if (s.activityPath && s.activityPath.coords.length > 1) {
      const done = t != null && Date.parse(s.end) <= t;
      features.push({ type: 'Feature', properties: { mode: s.activityPath.mode, color: MODE_COLOR[s.activityPath.mode], done: done ? 1 : 0, activity: 1 }, geometry: { type: 'LineString', coordinates: s.activityPath.coords } });
    }
  });
  return { type: 'FeatureCollection', features };
}

export function planStopsGeoJSON(plan: Plan | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (!plan) return { type: 'FeatureCollection', features };
  plan.stops.forEach((s, i) => features.push({ type: 'Feature', properties: { kind: 'stop', n: i + 1, icon: `stop-${Math.min(12, i + 1)}`, name: s.name, id: s.placeId, time: s.start.slice(11, 16) }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } }));
  const first = plan.trips[0];
  if (first && first.from.lon) features.push({ type: 'Feature', properties: { kind: 'start', icon: 'flag-start', name: first.from.label }, geometry: { type: 'Point', coordinates: [first.from.lon, first.from.lat] } });
  if (plan.trips.length > plan.stops.length && plan.end.lon) features.push({ type: 'Feature', properties: { kind: 'end', icon: 'flag-end', name: plan.end.label }, geometry: { type: 'Point', coordinates: [plan.end.lon, plan.end.lat] } });
  for (const d of plan.decisions) {
    if (d.chosen) continue;
    const s = plan.stops[d.afterStop];
    if (s) features.push({ type: 'Feature', properties: { kind: 'decision', icon: 'decision', name: d.prompt }, geometry: { type: 'Point', coordinates: [(s.exit ?? s).lon + 0.00025, (s.exit ?? s).lat + 0.00018] } });
  }
  return { type: 'FeatureCollection', features };
}

export function boundsOf(coords: [number, number][]): LngLatBoundsLike | null {
  if (!coords.length) return null;
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of coords) { if (!x && !y) continue; w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return w > e ? null : [[w, s], [e, n]];
}
export function planCoords(plan: Plan): [number, number][] {
  return [...plan.trips.flatMap((t) => t.legs.flatMap((l) => l.geometry)), ...plan.stops.map((s) => [s.lon, s.lat] as [number, number])];
}

interface Props { onFallback: () => void }

export default function MapView({ onFallback }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const meta = useApp((s) => s.meta);
  const settings = useApp((s) => s.settings);
  const view = useApp((s) => s.view);
  const branches = useApp((s) => s.branches);
  const currentBranch = useApp((s) => s.currentBranch);
  const compareBranch = useApp((s) => s.compareBranch);
  const result = useApp((s) => s.result);
  const selected = useApp((s) => s.selected);
  const plan = branches.find((b) => b.id === currentBranch)?.plan ?? null;
  const tlRef = useRef<Timeline | null>(null);
  const planRef = useRef<Plan | null>(null);
  const markersRef = useRef<{ group: maplibregl.Marker; people: maplibregl.Marker[]; vehicle: maplibregl.Marker; els: HTMLElement[]; groupEl: HTMLElement; vehicleEl: HTMLElement } | null>(null);
  const lastPaletteRef = useRef<number>(-1);

  // ------------------------------------------------------------ creazione mappa
  useEffect(() => {
    if (!ref.current || !meta) return;
    if (!hasWebGL()) { useApp.getState().set({ webgl: 'unsupported' }); onFallback(); return; }
    const origin = window.location.origin;
    const b = meta.perimeter.buffer;
    const bounds: [number, number, number, number] = [b.west, b.south, b.east, b.north];
    let map: MLMap;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: buildStyle(PALETTES.day, { threeD: settings.threeD, contoursUrl: contourUrl(origin), bounds, origin }),
        // su telefono il nucleo cittadino, nella parte di mappa lasciata libera dal foglio inferiore
        ...(window.innerWidth < 760
          ? { bounds: [[meta.perimeter.core.west, meta.perimeter.core.south], [meta.perimeter.core.east, meta.perimeter.core.north]], fitBoundsOptions: { padding: fitPadding() } }
          : { bounds: [[meta.perimeter.perimeter.west, meta.perimeter.perimeter.south], [meta.perimeter.perimeter.east, meta.perimeter.perimeter.north]], fitBoundsOptions: { padding: fitPadding() } }),
        // margini larghi a ovest e a sud: pannello laterale e foglio inferiore coprono quella parte
        // dello schermo, e con limiti stretti la camera non riuscirebbe a centrare la zona visibile
        maxBounds: [[b.west - 0.12, b.south - 0.22], [b.east + 0.05, b.north + 0.04]],
        minZoom: 10, maxZoom: 19,
        pitch: settings.threeD ? 38 : 0, maxPitch: 70,
        attributionControl: { compact: true, customAttribution: 'Orari: opentransportdata.swiss (GTFS)' },
        cooperativeGestures: false,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      } as any);
    } catch (e) {
      console.error(e);
      useApp.getState().set({ webgl: 'unsupported' });
      onFallback();
      return;
    }
    mapInstance = map;
    // fitBounds con margini asimmetrici sposta davvero il centro nella parte visibile
    // (le opzioni del costruttore non lo fanno): su telefono il foglio copre la metà bassa
    if (window.innerWidth < 760) {
      const c = meta.perimeter.core;
      map.fitBounds([[c.west, c.south], [c.east, c.north]], { padding: fitPadding(), duration: 0 });
    }
    if (import.meta.env.DEV) (window as any).__map = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-right');
    map.on('styleimagemissing', (e) => {
      if (map.hasImage(e.id)) return;
      map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
    map.once('idle', () => { try { performance.mark('map-idle'); } catch { /* */ } });
    map.on('load', async () => {
      try { performance.mark('map-load'); } catch { /* */ }
      installImages(map);
      map.addSource('dem-terrain', { type: 'raster-dem', tiles: [`${origin}/terrain/{z}/{x}/{y}.png`], encoding: 'terrarium', tileSize: 256, minzoom: 8, maxzoom: 14, bounds });
      if (settings.threeD) map.setTerrain({ source: 'dem-terrain', exaggeration: 1.35 });
      // perimetro di prodotto
      map.addSource('perimeter', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: meta.perimeter.polygon } });
      map.addLayer({ id: 'perimeter-line', type: 'line', source: 'perimeter', paint: { 'line-color': '#c8643c', 'line-width': 1.4, 'line-dasharray': [6, 4], 'line-opacity': 0.55 } });
      // luoghi del catalogo
      map.addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'places-landmark', type: 'symbol', source: 'places', minzoom: 11.5, filter: ['has', 'landmark'], layout: { 'icon-image': ['concat', 'lm-', ['get', 'landmark']], 'icon-size': ['interpolate', ['linear'], ['zoom'], 11.5, 0.35, 14, 0.6, 17, 0.9], 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': 1 } });
      map.addLayer({ id: 'places-dot', type: 'symbol', source: 'places', minzoom: 12.5, filter: ['!', ['has', 'landmark']], layout: { 'icon-image': ['get', 'icon'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 12.5, 0.55, 16, 0.9], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      map.addLayer({ id: 'places-label', type: 'symbol', source: 'places', minzoom: 13, layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Semibold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10.5, 17, 13.5], 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true }, paint: { 'text-color': '#3b2a1f', 'text-halo-color': '#fbf6ea', 'text-halo-width': 1.8 } });
      // POI OSM non curati (esplorazione)
      map.addSource('osm-pois', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'osm-pois', type: 'symbol', source: 'osm-pois', minzoom: 14, layout: { 'icon-image': ['concat', 'poi-', ['get', 'cls']], 'icon-size': 0.7, 'text-field': ['get', 'name'], 'text-font': ['Open Sans Italic'], 'text-size': 10, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#5d574c', 'text-halo-color': '#fbf6ea', 'text-halo-width': 1.2 } });
      // alternativa confrontata (in trasparenza)
      map.addSource('alt-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'alt-route', type: 'line', source: 'alt-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7c5e9a', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 6], 'line-opacity': 0.45, 'line-dasharray': [1.5, 1.2] } });
      // percorso del piano
      map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, lineMetrics: false });
      map.addLayer({ id: 'route-halo', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fbf6ea', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5, 16, 12], 'line-opacity': 0.9 } });
      map.addLayer({ id: 'route-ride', type: 'line', source: 'route', filter: ['==', ['get', 'ride'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 7], 'line-opacity': ['case', ['==', ['get', 'done'], 1], 0.45, 1] } });
      map.addLayer({ id: 'route-walk', type: 'line', source: 'route', filter: ['!=', ['get', 'ride'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.2, 16, 5], 'line-dasharray': [1.2, 1.1], 'line-opacity': ['case', ['==', ['get', 'done'], 1], 0.4, 1] } });
      map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'stops', type: 'symbol', source: 'stops', layout: { 'icon-image': ['get', 'icon'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.45, 15, 0.75], 'icon-anchor': ['case', ['==', ['get', 'kind'], 'stop'], 'bottom', ['==', ['get', 'kind'], 'start'], 'bottom-left', 'center'], 'icon-allow-overlap': true, 'text-field': ['case', ['==', ['get', 'kind'], 'stop'], ['concat', ['get', 'time'], ' · ', ['get', 'name']], ['==', ['get', 'kind'], 'decision'], '', ['get', 'name']], 'text-font': ['Open Sans Semibold'], 'text-size': 11.5, 'text-offset': [0, 0.6], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 10, 'symbol-sort-key': ['coalesce', ['get', 'n'], 0] }, paint: { 'text-color': '#2b2a27', 'text-halo-color': '#fbf6ea', 'text-halo-width': 2 } });
      map.on('click', 'places-dot', (e) => { const id = e.features?.[0]?.properties?.id; if (id) useApp.getState().set({ placeCard: id }); });
      map.on('click', 'places-landmark', (e) => { const id = e.features?.[0]?.properties?.id; if (id) useApp.getState().set({ placeCard: id }); });
      map.on('click', 'stops', (e) => { const id = e.features?.[0]?.properties?.id; if (id) useApp.getState().set({ placeCard: id }); });
      for (const l of ['places-dot', 'places-landmark', 'stops']) {
        map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
      }
      map.on('dragstart', () => { if (useSim.getState().camera === 'follow' && useSim.getState().playing) useSim.getState().set({ camera: 'free' }); });
      try {
        const res = await get<{ places: any[] }>(`/api/places`);
        (map.getSource('places') as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: res.places.map((p) => ({ type: 'Feature', properties: { id: p.id, name: p.name.replace(/\s*\(.*?\)\s*/g, ''), icon: placeIconFor(p.category), ...(landmarkFor(p.id, p.category) ? { landmark: landmarkFor(p.id, p.category) } : {}) }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
        });
      } catch (e) { useApp.getState().notify('Luoghi del catalogo non disponibili: la mappa resta esplorabile.', 'error'); }
      setReady(true);
    });
    const canvas = map.getCanvas();
    let disposing = false;
    const onLost = (ev: Event) => { ev.preventDefault(); if (!disposing) useApp.getState().set({ webgl: 'lost' }); };
    const onRestored = () => { useApp.getState().set({ webgl: 'ok' }); map.triggerRepaint(); };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    map.on('error', (e: any) => {
      // i tile fuori dall'area coperta mancano per scelta: non sono errori da segnalare
      if (e.sourceId || e.tile || /decoded|404|Failed to fetch|AJAXError/i.test(String(e.error?.message ?? ''))) return;
      console.warn('[mappa]', e.error?.message ?? e);
    });
    return () => {
      // la rimozione della mappa rilascia volutamente il contesto WebGL: non è un guasto
      disposing = true;
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      map.remove(); mapInstance = null; markersRef.current = null; setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, settings.threeD]);

  // ------------------------------------------------------------ piano corrente sulla mappa
  useEffect(() => {
    const map = mapInstance;
    if (!map || !ready) return;
    planRef.current = plan;
    tlRef.current = plan ? buildTimeline(plan) : null;
    const showPlan = plan && (view === 'sim' || view === 'summary');
    const preview = !showPlan && (view === 'results') ? result?.alternatives[selected] ?? null : null;
    const p = showPlan ? plan : preview;
    (map.getSource('route') as GeoJSONSource)?.setData(planRouteGeoJSON(p, showPlan ? useSim.getState().t : null));
    (map.getSource('stops') as GeoJSONSource)?.setData(planStopsGeoJSON(p));
    const cmp = compareBranch ? branches.find((b) => b.id === compareBranch)?.plan : null;
    (map.getSource('alt-route') as GeoJSONSource)?.setData(planRouteGeoJSON(cmp ?? null, null));
    if (p && (view === 'results' || (view === 'sim' && useSim.getState().t <= Date.parse(p.totals.startsAt)))) {
      const bb = boundsOf(planCoords(p));
      if (bb) map.fitBounds(bb, { padding: fitPadding(), duration: settings.reducedMotion ? 0 : 900, pitch: settings.threeD ? 40 : 0 });
    }
    ensureCharacters(map, p && showPlan ? p : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, view, ready, result, selected, compareBranch]);

  // ------------------------------------------------------------ personaggi e luce, a ogni fotogramma simulato
  useEffect(() => {
    if (!ready) return;
    let lastRouteUpdate = 0;
    const unsub = useSim.subscribe((s) => {
      const map = mapInstance;
      const tl = tlRef.current;
      if (!map || !tl || useApp.getState().view !== 'sim') return;
      const st = stateAt(tl, s.t);
      placeCharacters(map, st, s.bubbles);
      // luce collegata all'ora simulata (scelta artistica)
      if (useApp.getState().settings.lighting === 'sim') {
        const d = new Date(st.t);
        const h = Number(new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', hour: 'numeric', hourCycle: 'h23' }).format(d)) + d.getMinutes() / 60;
        const key = Math.round(h * 6);
        if (key !== lastPaletteRef.current) { lastPaletteRef.current = key; applyPalette(map, paletteForHour(h)); }
      }
      if (Math.abs(s.t - lastRouteUpdate) > 60_000) {
        lastRouteUpdate = s.t;
        (map.getSource('route') as GeoJSONSource)?.setData(planRouteGeoJSON(planRef.current, s.t));
      }
      if (s.camera === 'follow' && s.playing && !s.cutscene) {
        // il gruppo resta nella parte visibile (a destra del pannello su desktop, sopra il foglio su telefono)
        const desktop = window.innerWidth >= 760;
        const target = map.project(st.position);
        const cx = map.getCanvas().clientWidth / 2 + (desktop ? 210 : 0);
        const cy = map.getCanvas().clientHeight / 2 - (desktop ? 40 : Math.round(window.innerHeight * 0.18));
        const dx = target.x - cx, dy = target.y - cy;
        if (Math.abs(dx) + Math.abs(dy) > 1.5) map.panBy([dx * 0.18, dy * 0.18], { duration: 0 });
      }
    });
    return unsub;
  }, [ready]);

  // dettaglio adattivo: se i fotogrammi scendono sotto ~24 fps si riduce il carico grafico
  useEffect(() => {
    if (!ready) return;
    let frames = 0, raf = 0, lowStreak = 0, level = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      frames++;
      if (now - last < 2000) return;
      const fps = (frames * 1000) / (now - last);
      frames = 0; last = now;
      const map = mapInstance;
      const busy = useSim.getState().playing || map?.isMoving();
      if (!map || !busy || document.hidden) return;
      if (fps < 24) lowStreak++; else lowStreak = 0;
      if (lowStreak >= 2 && level < 2) {
        level++;
        lowStreak = 0;
        applyDetail(map, level);
        useApp.getState().notify(level === 1 ? 'Dettaglio ridotto (rilievo e curve di livello) per mantenere la fluidità.' : 'Dettaglio minimo: edifici in pianta e risoluzione ridotta.', 'info');
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  // luce di giorno fuori dalla simulazione
  useEffect(() => {
    const map = mapInstance;
    if (!map || !ready) return;
    if (view !== 'sim' || settings.lighting === 'day') { applyPalette(map, PALETTES.day); lastPaletteRef.current = -1; }
  }, [view, ready, settings.lighting]);

  // POI OSM nell'esplorazione libera
  const showOsm = useApp((s) => s.exploreFilter.showOsm);
  useEffect(() => {
    const map = mapInstance;
    if (!map || !ready) return;
    if (!showOsm) { (map.getSource('osm-pois') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [] }); return; }
    get<{ pois: any[] }>('/api/explore').then((r) => {
      (map.getSource('osm-pois') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: r.pois.map((p) => ({ type: 'Feature', properties: { name: p.name, cls: p.cls, osm: p.osm }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) });
    }).catch(() => useApp.getState().notify('POI OSM non disponibili', 'error'));
  }, [showOsm, ready]);

  return <div ref={ref} className="map" role="application" aria-label="Mappa illustrata di Lugano e dintorni. Usate il pannello o la vista elenco per le stesse informazioni in forma testuale." />;

  // ------------------------------------------------------------ gestione marker
  function ensureCharacters(map: MLMap, p: Plan | null) {
    const old = markersRef.current;
    if (old) { old.people.forEach((m) => m.remove()); old.group.remove(); old.vehicle.remove(); markersRef.current = null; }
    if (!p) return;
    const people = p.request.people;
    const els: HTMLElement[] = [];
    const markers = people.map((person, i) => {
      const el = document.createElement('div');
      el.className = 'character';
      el.innerHTML = `${avatarSvg(person, 36)}<div class="bubble" hidden></div><div class="name">${escapeHtml(person.name)}</div>`;
      el.setAttribute('aria-label', person.name);
      el.dataset.name = person.name;
      els.push(el);
      return new maplibregl.Marker({ element: el, anchor: 'bottom', offset: formation(i, people.length) }).setLngLat([p.trips[0]?.from.lon ?? p.stops[0].lon, p.trips[0]?.from.lat ?? p.stops[0].lat]).addTo(map);
    });
    const groupEl = document.createElement('div');
    groupEl.className = 'group-marker';
    groupEl.innerHTML = `${avatarSvg(people[0], 30)}<span class="count">${people.length}</span>`;
    const group = new maplibregl.Marker({ element: groupEl, anchor: 'bottom' }).setLngLat([p.stops[0]?.lon ?? 8.95, p.stops[0]?.lat ?? 46]).addTo(map);
    const vehicleEl = document.createElement('div');
    vehicleEl.className = 'vehicle-marker';
    const vehicle = new maplibregl.Marker({ element: vehicleEl, anchor: 'bottom' }).setLngLat([p.stops[0]?.lon ?? 8.95, p.stops[0]?.lat ?? 46]).addTo(map);
    markersRef.current = { group, people: markers, vehicle, els, groupEl, vehicleEl };
    if (import.meta.env.DEV) (window as any).__markers = markersRef.current;
    const tl = tlRef.current;
    if (tl) placeCharacters(map, stateAt(tl, useSim.getState().t), []);
  }

  function placeCharacters(map: MLMap, st: ReturnType<typeof stateAt>, bubbles: { speaker: string; text: string; until: number }[]) {
    const m = markersRef.current;
    if (!m) return;
    const zoom = map.getZoom();
    const riding = st.scene === 'ride' && st.mode && st.mode !== 'walk' && st.mode !== 'hike';
    const aggregated = zoom < 13.2;
    const moving = st.scene === 'walk' || (st.scene === 'activity' && !!tlRef.current?.segments[st.segIndex]?.coords);
    const reduced = useApp.getState().settings.reducedMotion;
    m.vehicleEl.style.display = riding ? '' : 'none';
    if (riding) {
      if (m.vehicleEl.dataset.mode !== st.mode) { m.vehicleEl.innerHTML = `${vehicleSvg(st.mode!)}<span class="count">${m.people.length}</span>`; m.vehicleEl.dataset.mode = st.mode!; }
      m.vehicle.setLngLat(st.position);
    }
    m.groupEl.style.display = !riding && aggregated ? '' : 'none';
    if (!riding && aggregated) m.group.setLngLat(st.position);
    const now = Date.now();
    m.people.forEach((mk, i) => {
      const el = m.els[i];
      const visible = !riding && !aggregated;
      el.style.display = visible ? '' : 'none';
      if (!visible) return;
      mk.setLngLat(st.position);
      el.classList.toggle('walking', moving && !reduced && useSim.getState().playing);
      el.classList.toggle('flip', Math.cos(((st.bearing - 90) * Math.PI) / 180) < 0);
      const b = bubbles.find((x) => x.speaker === el.dataset.name && x.until > now);
      const bub = el.querySelector('.bubble') as HTMLElement;
      if (b && useApp.getState().settings.dialogues) { bub.hidden = false; if (bub.textContent !== b.text) bub.textContent = b.text; } else bub.hidden = true;
    });
  }
}

function formation(i: number, n: number): [number, number] {
  if (n === 1) return [0, 0];
  const ring = i < 6 ? 0 : 1;
  const k = ring === 0 ? i : i - 6;
  const count = ring === 0 ? Math.min(n, 6) : n - 6;
  const r = ring === 0 ? 17 : 33;
  const a = (k / count) * Math.PI * 2 + (ring ? Math.PI / count : 0);
  return [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r * 0.55)];
}

function escapeHtml(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }

export function fitPadding() {
  const mobile = window.innerWidth < 760;
  return mobile ? { top: 70, bottom: Math.round(window.innerHeight * 0.45), left: 30, right: 30 } : { top: 80, bottom: 150, left: 440, right: 60 };
}

/** Livelli di dettaglio: 0 pieno, 1 senza rilievo 3D e curve di livello, 2 anche senza edifici 3D e a risoluzione 1×. */
export function applyDetail(map: MLMap, level: number) {
  if (level >= 1) {
    try { map.setTerrain(null); } catch { /* */ }
    for (const id of ['contours', 'contour-labels']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  }
  if (level >= 2) {
    for (const id of ['building-3d', 'building-roof', 'building-windows', 'hillshade', 'bg-texture', 'lc-forest-pattern']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    if (map.getLayer('building-flat')) map.setLayerZoomRange('building-flat', 13, 24);
    try { (map as any).setPixelRatio?.(1); } catch { /* */ }
  }
  (window as any).__detailLevel = level;
}
