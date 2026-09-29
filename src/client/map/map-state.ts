import { useSyncExternalStore } from 'react';
import type { Map as MLMap, LngLatBoundsLike } from 'maplibre-gl';
import type { Plan } from '../../shared/types.ts';
export let mapInstance: MLMap | null = null;
const listeners = new Set<() => void>();
export function setMapInstance(map: MLMap | null) { mapInstance = map; for (const fn of listeners) fn(); }
export function getMap() { return mapInstance; }
export function useMap() { return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, getMap, () => null); }
// percorso a «matita colorata»: rosso per il cammino, toni distinti ma armonici per i mezzi
const MODE_COLOR: Record<string, string> = { walk: '#d2553a', hike: '#a3402b', bus: '#d99a2b', train: '#8e3b2e', funicular: '#b04a35', boat: '#2f6f7e', cable_car: '#6c5a8e', wait: '#999' };

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

export function fitPadding() {
  const mobile = window.innerWidth < 760;
  return mobile ? { top: 70, bottom: Math.round(window.innerHeight * 0.45), left: 30, right: 30 } : { top: 80, bottom: 150, left: 440, right: 60 };
}

