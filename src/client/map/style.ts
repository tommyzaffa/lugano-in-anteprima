/**
 * Stile cartografico «schizzo d'architetto»: carta avorio, tratti a inchiostro, rilievo a
 * matita, lago a tratteggio, bosco a cerchietti, edifici come un plastico bianco e scritte
 * a mano (Architects Daughter). Di notte la tavola diventa una cianografia.
 * Fuori dall'area dei dati il disegno continua a grandi linee (rilievo, laghi, confine,
 * città) e sfuma verso i bordi: è contesto, non contenuto pianificabile.
 * La luce segue l'ora simulata come scelta artistica, non come calcolo astronomico.
 */
import type { StyleSpecification, LayerSpecification, ExpressionSpecification } from 'maplibre-gl';

export interface Palette {
  paper: string; paper2: string; ink: string; inkSoft: string; graphite: string;
  water: string; waterLine: string; forest: string; grass: string; park: string; farm: string; urban: string; vineyard: string; rock: string;
  road: string; casing: string; path: string; trail: string; rail: string;
  building: string; model: string; landmark: string; label: string; halo: string;
  shadow: string; highlight: string; contour: string; boundary: string; accent: string;
  windowGlow: number; texture: number;
}

export const PALETTES: Record<'day' | 'golden' | 'dusk' | 'night', Palette> = {
  day: {
    paper: '#f3eee4', paper2: '#e9e2d4', ink: '#2a2622', inkSoft: '#6b645a', graphite: '#8f887c',
    water: '#d5e4e3', waterLine: '#6f97a0', forest: '#dfe4cd', grass: '#e7ead8', park: '#dde6c8', farm: '#efe9da', urban: '#ece5d7', vineyard: '#e4e6c9', rock: '#e8e0d0',
    road: '#fbf8f1', casing: '#4a443c', path: '#6b645a', trail: '#b4533d', rail: '#3a342e',
    building: '#e3dccd', model: '#f6f2ea', landmark: '#efd9cc', label: '#2a2622', halo: '#f3eee4',
    shadow: '#6e675c', highlight: '#fffcf5', contour: '#b3a792', boundary: '#8a6f8a', accent: '#d2553a',
    windowGlow: 0, texture: 0.7,
  },
  golden: {
    paper: '#f4e9d4', paper2: '#eadcc2', ink: '#2d2620', inkSoft: '#6e5f4d', graphite: '#927f68',
    water: '#d6ddd4', waterLine: '#7b949a', forest: '#e0dcbd', grass: '#e9e2c6', park: '#dfdcbc', farm: '#f0e2c8', urban: '#efdfc6', vineyard: '#e6ddb8', rock: '#eadbc0',
    road: '#fcf4e4', casing: '#50443a', path: '#6e5f4d', trail: '#b44f36', rail: '#3d342b',
    building: '#e8d8c0', model: '#f7ecdc', landmark: '#f0d2bb', label: '#2d2620', halo: '#f4e9d4',
    shadow: '#76624a', highlight: '#fff6e6', contour: '#b8a283', boundary: '#8a6c7c', accent: '#d2553a',
    windowGlow: 0.15, texture: 0.7,
  },
  dusk: {
    paper: '#cfd3d6', paper2: '#c3c8cc', ink: '#23262e', inkSoft: '#4f5663', graphite: '#6e7581',
    water: '#a9bcc6', waterLine: '#4f6c7c', forest: '#b9c1b8', grass: '#c2c9c0', park: '#bcc6b8', farm: '#cccdc8', urban: '#c9cbcc', vineyard: '#c3c6b8', rock: '#c8c8c4',
    road: '#e5e7e8', casing: '#39404c', path: '#4f5663', trail: '#9c4a3a', rail: '#2b2f37',
    building: '#bec3c8', model: '#dcdfe2', landmark: '#d6c4bf', label: '#1f232b', halo: '#cfd3d6',
    shadow: '#3c4552', highlight: '#e8ecef', contour: '#8d95a0', boundary: '#6c5a70', accent: '#d2553a',
    windowGlow: 0.55, texture: 0.5,
  },
  // cianografia: carta blu, tratti chiari
  night: {
    paper: '#1f3752', paper2: '#1b314a', ink: '#e7eef4', inkSoft: '#a9bccd', graphite: '#8aa2b8',
    water: '#18304a', waterLine: '#7fa6c4', forest: '#243f58', grass: '#243f5a', park: '#24405a', farm: '#223a55', urban: '#233b56', vineyard: '#243f56', rock: '#233b55',
    road: '#2a4664', casing: '#c8d8e6', path: '#a9bccd', trail: '#e39a7f', rail: '#c8d8e6',
    building: '#2c4a69', model: '#3b5b7c', landmark: '#6a5a6e', label: '#f2f6fa', halo: '#1f3752',
    shadow: '#0c1a2a', highlight: '#4c6f93', contour: '#5d7fa0', boundary: '#b79bc0', accent: '#f08a5d',
    windowGlow: 1, texture: 0.35,
  },
};

function hex(c: string): [number, number, number] { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function toHex([r, g, b]: number[]) { return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join(''); }
export function mix(a: string, b: string, t: number) { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); }

/** Palette interpolata per l'ora del giorno (ore decimali, 0–24). */
export function paletteForHour(h: number): Palette {
  const keys: [number, keyof typeof PALETTES][] = [[0, 'night'], [5.5, 'night'], [7, 'day'], [17, 'day'], [18.6, 'golden'], [19.8, 'dusk'], [21, 'night'], [24, 'night']];
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] <= h) i++;
  const [h0, k0] = keys[i], [h1, k1] = keys[i + 1];
  const t = h1 > h0 ? Math.max(0, Math.min(1, (h - h0) / (h1 - h0))) : 0;
  const a = PALETTES[k0], b = PALETTES[k1];
  const out: any = {};
  for (const k of Object.keys(a) as (keyof Palette)[]) {
    const va = a[k] as any, vb = b[k] as any;
    out[k] = typeof va === 'number' ? va + (vb - va) * t : mix(va, vb, t);
  }
  return out as Palette;
}

/** Carattere a mano per luoghi e titoli; sans stretto per i nomi delle vie (leggibilità). */
export const HAND = ['Architects Daughter Regular'];
const NARROW = ['PT Sans Narrow Regular'];
const SANS = ['Open Sans Regular'];

const z = (stops: [number, number][]): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], ...stops.flat()] as any;

/** Riquadro del contesto regionale (rilievo a bassa risoluzione, laghi, città): vedi scripts/geo/07-context.ts. */
export const WIDE: [number, number, number, number] = [8.35, 45.55, 9.6, 46.45];

export interface StyleOptions { threeD: boolean; contoursUrl?: string; bounds: [number, number, number, number]; origin: string }

export function buildStyle(p: Palette, opts: StyleOptions): StyleSpecification {
  const byClass = (w: Record<string, number>, dflt: number, f: number): ExpressionSpecification => (Object.keys(w).length ? ['match', ['get', 'cls'], ...Object.entries(w).flatMap(([k, v]) => [k, v * f]), dflt * f] : dflt * f) as any;
  const roadWidth = (w: Record<string, number>, dflt: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 10, byClass(w, dflt, 0.22), 13, byClass(w, dflt, 0.65), 15, byClass(w, dflt, 1.6), 17, byClass(w, dflt, 4.4), 19, byClass(w, dflt, 11.5)] as any;
  const casingW = { motorway: 2.3, trunk: 2.1, primary: 1.9, secondary: 1.75, tertiary: 1.55, pedestrian: 1.1, service: 0.8 };
  const fillW = { motorway: 1.95, trunk: 1.75, primary: 1.6, secondary: 1.45, tertiary: 1.28, pedestrian: 0.85, service: 0.55 };
  const roads = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'pedestrian'];
  const layers: LayerSpecification[] = [
    { id: 'bg', type: 'background', paint: { 'background-color': p.paper } },
    { id: 'bg-texture', type: 'background', paint: { 'background-pattern': 'paper-grain', 'background-opacity': p.texture } },
    // ------------------------------------------------ contesto regionale (fuori dall'area dei dati)
    { id: 'ctx-hillshade', type: 'hillshade', source: 'dem-wide', paint: { 'hillshade-shadow-color': p.shadow, 'hillshade-highlight-color': p.highlight, 'hillshade-accent-color': p.shadow, 'hillshade-exaggeration': 0.45, 'hillshade-illumination-direction': 315 } as any },
    { id: 'ctx-lake', type: 'fill', source: 'context', filter: ['==', ['get', 'k'], 'lake'], paint: { 'fill-color': p.water } },
    { id: 'ctx-lake-hatch', type: 'fill', source: 'context', filter: ['==', ['get', 'k'], 'lake'], paint: { 'fill-pattern': 'water-hatch', 'fill-opacity': 0.7 } },
    { id: 'ctx-lake-shore', type: 'line', source: 'context', filter: ['==', ['get', 'k'], 'lake'], paint: { 'line-color': p.waterLine, 'line-width': 1 } },
    { id: 'ctx-river', type: 'line', source: 'context', filter: ['==', ['get', 'k'], 'river'], paint: { 'line-color': p.waterLine, 'line-width': 1.2, 'line-opacity': 0.8 } },
    { id: 'ctx-border', type: 'line', source: 'context', filter: ['==', ['get', 'k'], 'border'], paint: { 'line-color': p.boundary, 'line-width': 1.4, 'line-dasharray': [6, 2, 1, 2], 'line-opacity': 0.7 } },
    // l'area dei dati è disegnata su carta pulita: il contesto non si sovrappone
    { id: 'inner-paper', type: 'fill', source: 'frame', filter: ['==', ['get', 'k'], 'inner'], paint: { 'fill-color': p.paper, 'fill-antialias': false } },
    { id: 'inner-texture', type: 'fill', source: 'frame', filter: ['==', ['get', 'k'], 'inner'], paint: { 'fill-pattern': 'paper-grain', 'fill-opacity': p.texture } },
    // ------------------------------------------------ copertura del suolo: acquerelli tenui e simboli a mano
    { id: 'lc-farm', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['in', ['get', 'kind'], ['literal', ['farm', 'orchard']]], paint: { 'fill-color': p.farm } },
    { id: 'lc-residential', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['in', ['get', 'kind'], ['literal', ['residential', 'institution', 'parking', 'plaza', 'commercial', 'industrial']]], paint: { 'fill-color': p.urban, 'fill-opacity': z([[10, 0.5], [15, 0.85]]) } },
    { id: 'lc-grass', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['in', ['get', 'kind'], ['literal', ['grass', 'sport', 'playground', 'cemetery', 'wetland', 'scrub']]], paint: { 'fill-color': p.grass } },
    { id: 'lc-vineyard', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['==', ['get', 'kind'], 'vineyard'], paint: { 'fill-color': p.vineyard } },
    { id: 'lc-vineyard-pattern', type: 'fill', source: 'lugano', 'source-layer': 'landcover', minzoom: 13, filter: ['==', ['get', 'kind'], 'vineyard'], paint: { 'fill-pattern': 'vineyard-rows', 'fill-opacity': 0.8 } },
    { id: 'lc-forest', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['==', ['get', 'kind'], 'forest'], paint: { 'fill-color': p.forest } },
    { id: 'lc-forest-pattern', type: 'fill', source: 'lugano', 'source-layer': 'landcover', minzoom: 12, filter: ['==', ['get', 'kind'], 'forest'], paint: { 'fill-pattern': 'tree-scribble', 'fill-opacity': z([[12, 0], [13, 0.7], [17, 0.9]]) } },
    { id: 'lc-park', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['in', ['get', 'kind'], ['literal', ['park', 'garden']]], paint: { 'fill-color': p.park } },
    { id: 'lc-park-trees', type: 'fill', source: 'lugano', 'source-layer': 'landcover', minzoom: 14, filter: ['in', ['get', 'kind'], ['literal', ['park', 'garden']]], paint: { 'fill-pattern': 'tree-scribble', 'fill-opacity': 0.45 } },
    { id: 'lc-park-outline', type: 'line', source: 'lugano', 'source-layer': 'landcover', minzoom: 14, filter: ['in', ['get', 'kind'], ['literal', ['park', 'garden']]], paint: { 'line-color': p.inkSoft, 'line-width': 0.7, 'line-dasharray': [1, 2], 'line-opacity': 0.8 } },
    { id: 'lc-rock', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['in', ['get', 'kind'], ['literal', ['rock', 'beach', 'lido', 'pier', 'marina']]], paint: { 'fill-color': p.rock } },
    // ------------------------------------------------ rilievo a matita
    { id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-shadow-color': p.shadow, 'hillshade-highlight-color': p.highlight, 'hillshade-accent-color': p.shadow, 'hillshade-exaggeration': z([[9, 0.5], [13, 0.38], [16, 0.22]]), 'hillshade-illumination-direction': 315 } as any },
    ...(opts.contoursUrl ? [
      { id: 'contours', type: 'line', source: 'contours', 'source-layer': 'contours', minzoom: 11, paint: { 'line-color': p.contour, 'line-opacity': z([[11, 0], [12, 0.75], [16, 0.55]]), 'line-width': ['case', ['>', ['get', 'level'], 0], 1, 0.45] } } as LayerSpecification,
      { id: 'contour-labels', type: 'symbol', source: 'contours', 'source-layer': 'contours', minzoom: 13.5, filter: ['>', ['get', 'level'], 0], layout: { 'symbol-placement': 'line', 'text-field': ['number-format', ['get', 'ele'], {}], 'text-font': HAND, 'text-size': 11, 'text-max-angle': 25, 'symbol-spacing': 420 }, paint: { 'text-color': p.graphite, 'text-halo-color': p.paper, 'text-halo-width': 1.4 } } as LayerSpecification,
    ] : []),
    // ------------------------------------------------ acqua: velatura e tratteggio orizzontale
    { id: 'water', type: 'fill', source: 'lugano', 'source-layer': 'water', filter: ['!=', ['get', 'kind'], 'pool'], paint: { 'fill-color': p.water } },
    { id: 'water-hatch', type: 'fill', source: 'lugano', 'source-layer': 'water', filter: ['==', ['get', 'kind'], 'lake'], paint: { 'fill-pattern': 'water-hatch', 'fill-opacity': z([[10, 0.55], [15, 0.8]]) } },
    { id: 'water-ripple-2', type: 'line', source: 'lugano', 'source-layer': 'water', filter: ['==', ['get', 'kind'], 'lake'], paint: { 'line-color': p.waterLine, 'line-width': 0.6, 'line-offset': z([[10, 2.5], [14, 8], [17, 18]]), 'line-opacity': 0.35 } },
    { id: 'water-ripple-1', type: 'line', source: 'lugano', 'source-layer': 'water', filter: ['==', ['get', 'kind'], 'lake'], paint: { 'line-color': p.waterLine, 'line-width': 0.7, 'line-offset': z([[10, 1], [14, 3.5], [17, 8]]), 'line-opacity': 0.55 } },
    { id: 'water-shore', type: 'line', source: 'lugano', 'source-layer': 'water', filter: ['!=', ['get', 'kind'], 'pool'], paint: { 'line-color': p.ink, 'line-width': z([[9, 0.6], [14, 1.1], [17, 1.8]]), 'line-opacity': 0.8 } },
    { id: 'pools', type: 'fill', source: 'lugano', 'source-layer': 'water', filter: ['==', ['get', 'kind'], 'pool'], paint: { 'fill-color': p.water, 'fill-outline-color': p.ink } },
    { id: 'waterway', type: 'line', source: 'lugano', 'source-layer': 'waterway', filter: ['!=', ['get', 'tn'], 1], paint: { 'line-color': p.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, ['match', ['get', 'kind'], 'river', 1.2, 0.4], 16, ['match', ['get', 'kind'], 'river', 4, 1.4]] as any } },
    // ------------------------------------------------ confini
    { id: 'boundary-municipal', type: 'line', source: 'lugano', 'source-layer': 'boundary', minzoom: 11, filter: ['==', ['get', 'lvl'], 8], paint: { 'line-color': p.boundary, 'line-width': z([[11, 0.5], [15, 1]]), 'line-dasharray': [3, 3], 'line-opacity': 0.4 } },
    { id: 'boundary-national', type: 'line', source: 'lugano', 'source-layer': 'boundary', filter: ['==', ['get', 'lvl'], 2], paint: { 'line-color': p.boundary, 'line-width': z([[8, 1.2], [14, 2.4]]), 'line-dasharray': [6, 2, 1, 2], 'line-opacity': 0.75 } },
    // ------------------------------------------------ strade a doppio tratto, sentieri tratteggiati
    { id: 'road-tunnel', type: 'line', source: 'lugano', 'source-layer': 'roads', filter: ['all', ['==', ['get', 'tn'], 1], ['in', ['get', 'cls'], ['literal', roads]]], paint: { 'line-color': p.casing, 'line-width': roadWidth({}, 1), 'line-dasharray': [1, 1.6], 'line-opacity': 0.3 } },
    { id: 'path', type: 'line', source: 'lugano', 'source-layer': 'roads', filter: ['all', ['in', ['get', 'cls'], ['literal', ['path', 'footway', 'track', 'cycleway', 'sidewalk']]], ['!=', ['get', 'tn'], 1]], layout: { 'line-cap': 'round' }, paint: { 'line-color': p.path, 'line-width': z([[13, 0.5], [16, 1.1], [18, 2]]), 'line-dasharray': [2, 2], 'line-opacity': z([[13, 0.45], [15, 0.85]]) } },
    { id: 'trail', type: 'line', source: 'lugano', 'source-layer': 'roads', filter: ['==', ['get', 'cls'], 'trail'], paint: { 'line-color': p.trail, 'line-width': z([[12, 0.8], [16, 1.6]]), 'line-dasharray': [3, 2] } },
    // sentieri con i colori della segnaletica svizzera (sac_scale OSM): giallo, bianco-rosso-bianco, bianco-blu-bianco
    { id: 'trail-sign', type: 'line', source: 'lugano', 'source-layer': 'roads', minzoom: 12.5, filter: ['>=', ['coalesce', ['get', 'sac'], 0], 1], paint: { 'line-color': ['step', ['get', 'sac'], '#d9a400', 2, '#c8322b', 4, '#2f5fb3'], 'line-width': z([[12.5, 1], [16, 1.8]]), 'line-dasharray': [3, 1.6], 'line-opacity': z([[12.5, 0.45], [14, 0.85]]) } },
    { id: 'steps', type: 'line', source: 'lugano', 'source-layer': 'roads', filter: ['==', ['get', 'cls'], 'steps'], paint: { 'line-color': p.ink, 'line-width': z([[14, 1.5], [17, 4], [19, 8]]), 'line-dasharray': [0.25, 0.45], 'line-opacity': 0.75 } },
    { id: 'pier', type: 'line', source: 'lugano', 'source-layer': 'roads', filter: ['==', ['get', 'cls'], 'pier'], paint: { 'line-color': p.inkSoft, 'line-width': z([[14, 1.5], [17, 5]]) } },
    { id: 'road-casing', type: 'line', source: 'lugano', 'source-layer': 'roads', filter: ['all', ['in', ['get', 'cls'], ['literal', roads]], ['!=', ['get', 'tn'], 1]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.casing, 'line-width': roadWidth(casingW, 1.2), 'line-opacity': z([[10, 0.45], [13, 0.7], [15, 0.85]]) } },
    { id: 'road-fill', type: 'line', source: 'lugano', 'source-layer': 'roads', minzoom: 12.5, filter: ['all', ['in', ['get', 'cls'], ['literal', roads]], ['!=', ['get', 'tn'], 1]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.road, 'line-width': roadWidth(fillW, 0.9) } },
    // ------------------------------------------------ ferrovie, funicolari, battelli
    { id: 'rail-base', type: 'line', source: 'lugano', 'source-layer': 'rail', filter: ['all', ['!=', ['get', 'cls'], 'disused'], ['!=', ['get', 'tn'], 1]], paint: { 'line-color': p.rail, 'line-width': z([[10, 0.9], [15, 2.6], [18, 4.5]]) } },
    { id: 'rail-dash', type: 'line', source: 'lugano', 'source-layer': 'rail', minzoom: 12, filter: ['all', ['!=', ['get', 'cls'], 'disused'], ['!=', ['get', 'tn'], 1], ['!=', ['get', 'cls'], 'funicular']], paint: { 'line-color': p.paper, 'line-width': z([[12, 0.5], [15, 1.4], [18, 2.6]]), 'line-dasharray': [3, 3] } },
    { id: 'rail-tunnel', type: 'line', source: 'lugano', 'source-layer': 'rail', filter: ['==', ['get', 'tn'], 1], paint: { 'line-color': p.rail, 'line-width': z([[10, 0.8], [15, 1.8]]), 'line-dasharray': [1, 2], 'line-opacity': 0.35 } },
    { id: 'funicular-ticks', type: 'line', source: 'lugano', 'source-layer': 'rail', minzoom: 13, filter: ['==', ['get', 'cls'], 'funicular'], paint: { 'line-color': p.rail, 'line-width': z([[13, 5], [17, 10]]), 'line-dasharray': [0.18, 2.2] } },
    { id: 'aerialway', type: 'line', source: 'lugano', 'source-layer': 'aerialway', paint: { 'line-color': p.ink, 'line-width': 1, 'line-dasharray': [4, 1, 1, 1] } },
    { id: 'ferry', type: 'line', source: 'lugano', 'source-layer': 'ferry', paint: { 'line-color': p.waterLine, 'line-width': z([[10, 0.9], [15, 1.6]]), 'line-dasharray': [1, 2.5] } },
    // ------------------------------------------------ edifici: pianta a inchiostro, poi plastico bianco
    { id: 'building-flat', type: 'fill', source: 'lugano', 'source-layer': 'buildings', maxzoom: opts.threeD ? 15.2 : 24, paint: { 'fill-color': ['case', ['==', ['get', 'lm'], 1], p.landmark, p.building], 'fill-outline-color': p.ink, 'fill-opacity': z([[13, 0.55], [15, 0.95]]) } },
    { id: 'building-footprint', type: 'line', source: 'lugano', 'source-layer': 'buildings', minzoom: 15, paint: { 'line-color': p.ink, 'line-width': 0.8, 'line-opacity': 0.55 } },
    ...(opts.threeD ? [
      { id: 'building-3d', type: 'fill-extrusion', source: 'lugano', 'source-layer': 'buildings', minzoom: 14.6, paint: {
        'fill-extrusion-color': ['case', ['==', ['get', 'lm'], 1], p.landmark, ['match', ['get', 'tone'], 0, p.model, 1, mix(p.model, p.building, 0.25), 2, mix(p.model, p.paper2, 0.35), p.model]],
        'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'mh'],
        'fill-extrusion-opacity': z([[14.6, 0], [15.3, 0.95]]), 'fill-extrusion-vertical-gradient': true,
      } } as LayerSpecification,
      { id: 'building-windows', type: 'fill-extrusion', source: 'lugano', 'source-layer': 'buildings', minzoom: 15, filter: ['>', ['get', 'h'], 6], paint: {
        'fill-extrusion-color': '#ffc86e', 'fill-extrusion-height': ['*', ['get', 'h'], 0.66], 'fill-extrusion-base': ['*', ['get', 'h'], 0.52],
        'fill-extrusion-opacity': p.windowGlow * 0.85,
      } } as LayerSpecification,
    ] : []),
    // ------------------------------------------------ sfumatura del contesto verso i bordi e bordo della tavola
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ id: `ctx-fade-${i}`, type: 'fill', source: 'frame', filter: ['==', ['get', 'k'], `fade-${i}`], paint: { 'fill-color': p.paper, 'fill-opacity': 0.14 + i * 0.1, 'fill-antialias': false } } as LayerSpecification)),
    { id: 'frame-line', type: 'line', source: 'frame', filter: ['==', ['get', 'k'], 'edge'], paint: { 'line-color': p.ink, 'line-width': 1, 'line-dasharray': [5, 3], 'line-opacity': 0.35 } },
    // ------------------------------------------------ etichette
    { id: 'ctx-place', type: 'symbol', source: 'context', filter: ['==', ['get', 'k'], 'place'], layout: { 'text-field': ['get', 'name'], 'text-font': HAND, 'text-size': ['match', ['get', 'rank'], 1, 17, 13], 'text-transform': 'uppercase', 'text-letter-spacing': 0.2, 'text-padding': 6 }, paint: { 'text-color': p.graphite, 'text-halo-color': p.paper, 'text-halo-width': 1.6 } },
    { id: 'ctx-lake-label', type: 'symbol', source: 'context', filter: ['all', ['==', ['get', 'k'], 'lake'], ['!=', ['get', 'name'], 'Lago di Lugano']], layout: { 'text-field': ['get', 'name'], 'text-font': HAND, 'text-size': 15, 'text-letter-spacing': 0.25 }, paint: { 'text-color': p.waterLine, 'text-halo-color': p.water, 'text-halo-width': 1 } },
    { id: 'label-water', type: 'symbol', source: 'lugano', 'source-layer': 'labels', filter: ['==', ['get', 'kind'], 'lake'], layout: { 'text-field': ['get', 'name'], 'text-font': HAND, 'text-size': z([[9, 13], [13, 19], [16, 27]]), 'text-letter-spacing': 0.3, 'text-max-width': 20 }, paint: { 'text-color': mix(p.waterLine, p.ink, 0.25), 'text-halo-color': p.water, 'text-halo-width': 1 } },
    { id: 'label-waterway', type: 'symbol', source: 'lugano', 'source-layer': 'waterway', minzoom: 14, filter: ['all', ['has', 'name'], ['!=', ['get', 'name'], '']], layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': HAND, 'text-size': 12, 'symbol-spacing': 350 }, paint: { 'text-color': p.waterLine, 'text-halo-color': p.paper, 'text-halo-width': 1.4 } },
    { id: 'label-area', type: 'symbol', source: 'lugano', 'source-layer': 'labels', filter: ['!=', ['get', 'kind'], 'lake'], layout: { 'text-field': ['get', 'name'], 'text-font': HAND, 'text-size': z([[12, 11], [16, 14]]), 'text-max-width': 8, 'text-padding': 4 }, paint: { 'text-color': mix(p.forest, p.ink, 0.65), 'text-halo-color': p.halo, 'text-halo-width': 1.4 } },
    { id: 'label-road', type: 'symbol', source: 'lugano', 'source-layer': 'roads', minzoom: 14.5, filter: ['all', ['has', 'name'], ['in', ['get', 'cls'], ['literal', ['primary', 'secondary', 'tertiary', 'minor', 'pedestrian', 'service', 'steps', 'footway', 'path', 'trail']]]], layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': NARROW, 'text-size': z([[14.5, 10], [17, 12.5], [19, 14.5]]), 'symbol-spacing': 320, 'text-max-angle': 30, 'text-padding': 2 }, paint: { 'text-color': p.inkSoft, 'text-halo-color': p.halo, 'text-halo-width': 1.6 } },
    { id: 'label-poi', type: 'symbol', source: 'lugano', 'source-layer': 'pois', minzoom: 16.5, filter: ['all', ['has', 'name'], ['!=', ['get', 'name'], '']], layout: { 'text-field': ['get', 'name'], 'text-font': SANS, 'text-size': 10.5, 'text-max-width': 9 }, paint: { 'text-color': p.graphite, 'text-halo-color': p.halo, 'text-halo-width': 1.3 } },
    { id: 'label-peak', type: 'symbol', source: 'lugano', 'source-layer': 'peaks', minzoom: 10.5, filter: ['all', ['has', 'name'], ['!=', ['get', 'name'], '']], layout: { 'text-field': ['concat', '▲ ', ['get', 'name'], ['case', ['>', ['get', 'ele'], 0], ['concat', '\n', ['to-string', ['get', 'ele']], ' m'], '']], 'text-font': HAND, 'text-size': z([[10.5, 11], [14, 14]]), 'text-anchor': 'top', 'text-line-height': 1.1 }, paint: { 'text-color': p.inkSoft, 'text-halo-color': p.halo, 'text-halo-width': 1.5 } },
    { id: 'label-place-minor', type: 'symbol', source: 'lugano', 'source-layer': 'places', minzoom: 12, filter: ['>=', ['get', 'rank'], 4], layout: { 'text-field': ['get', 'name'], 'text-font': HAND, 'text-size': z([[12, 11.5], [16, 14.5]]), 'text-max-width': 8, 'text-padding': 6, 'symbol-sort-key': ['get', 'rank'] }, paint: { 'text-color': p.inkSoft, 'text-halo-color': p.halo, 'text-halo-width': 1.6 } },
    { id: 'label-place', type: 'symbol', source: 'lugano', 'source-layer': 'places', filter: ['<=', ['get', 'rank'], 3], layout: { 'text-field': ['get', 'name'], 'text-font': HAND, 'text-size': ['interpolate', ['linear'], ['zoom'], 9, ['match', ['get', 'rank'], 1, 18, 2, 14, 12], 14, ['match', ['get', 'rank'], 1, 30, 2, 21, 17]], 'text-transform': 'uppercase', 'text-letter-spacing': 0.2, 'text-max-width': 10, 'text-padding': 8, 'symbol-sort-key': ['-', ['get', 'rank'], ['/', ['get', 'pop'], 1000000]] }, paint: { 'text-color': p.label, 'text-halo-color': p.halo, 'text-halo-width': 2 } },
  ];
  const sources: StyleSpecification['sources'] = {
    lugano: { type: 'vector', tiles: [`${opts.origin}/tiles/lugano/{z}/{x}/{y}.pbf`], minzoom: 8, maxzoom: 16, bounds: opts.bounds, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' },
    dem: { type: 'raster-dem', tiles: [`${opts.origin}/terrain/{z}/{x}/{y}.png`], encoding: 'terrarium', tileSize: 256, minzoom: 8, maxzoom: 14, bounds: opts.bounds, attribution: 'Rilievo: swissALTI3D © swisstopo; Terrain Tiles (AWS Open Data, SRTM e altre fonti)' },
    'dem-wide': { type: 'raster-dem', tiles: [`${opts.origin}/terrain/{z}/{x}/{y}.png`], encoding: 'terrarium', tileSize: 256, minzoom: 8, maxzoom: 11, bounds: WIDE },
    context: { type: 'geojson', data: `${opts.origin}/data/contesto.geojson`, attribution: 'Contesto: Natural Earth' },
    frame: { type: 'geojson', data: frameGeoJSON(opts.bounds) },
  };
  if (opts.contoursUrl) sources.contours = { type: 'vector', tiles: [opts.contoursUrl], minzoom: 11, maxzoom: 15, bounds: opts.bounds };
  return {
    version: 8,
    name: 'Lugano in anteprima — schizzo',
    glyphs: `${opts.origin}/glyphs/{fontstack}/{range}.pbf`,
    sources,
    layers,
    light: { anchor: 'viewport', color: '#fffaf0', intensity: 0.28, position: [1.3, 210, 40] },
  } as StyleSpecification;
}

/**
 * Tavola: l'area dei dati (leggermente rientrata), il suo bordo e anelli di sfumatura
 * sempre più opachi verso l'esterno, così il contesto regionale si dissolve nella carta.
 */
export function frameGeoJSON(b: [number, number, number, number]): GeoJSON.FeatureCollection {
  const inset = 0.002;
  const ring = (d: number): [number, number][] => { const dx = d * 1.4; return [[b[0] - dx, b[1] - d], [b[2] + dx, b[1] - d], [b[2] + dx, b[3] + d], [b[0] - dx, b[3] + d], [b[0] - dx, b[1] - d]]; };
  const inner = ring(-inset);
  const steps = [0.004, 0.02, 0.045, 0.08, 0.13, 0.2, 3];
  const features: GeoJSON.Feature[] = [
    { type: 'Feature', properties: { k: 'inner' }, geometry: { type: 'Polygon', coordinates: [inner] } },
    { type: 'Feature', properties: { k: 'edge' }, geometry: { type: 'LineString', coordinates: inner } },
  ];
  for (let i = 0; i < steps.length - 1; i++) {
    features.push({ type: 'Feature', properties: { k: `fade-${i}` }, geometry: { type: 'Polygon', coordinates: [ring(steps[i + 1]), ring(steps[i]).slice().reverse()] } });
  }
  return { type: 'FeatureCollection', features };
}

/** Aggiorna i colori della palette sui layer già presenti, senza ricaricare lo stile. */
export function applyPalette(map: import('maplibre-gl').Map, p: Palette) {
  const set = (id: string, prop: string, v: unknown) => { if (map.getLayer(id)) map.setPaintProperty(id, prop as any, v as any); };
  set('bg', 'background-color', p.paper);
  set('bg-texture', 'background-opacity', p.texture);
  set('inner-paper', 'fill-color', p.paper);
  set('inner-texture', 'fill-opacity', p.texture);
  for (let i = 0; i < 6; i++) set(`ctx-fade-${i}`, 'fill-color', p.paper);
  for (const id of ['ctx-hillshade', 'hillshade']) { set(id, 'hillshade-shadow-color', p.shadow); set(id, 'hillshade-highlight-color', p.highlight); set(id, 'hillshade-accent-color', p.shadow); }
  set('ctx-lake', 'fill-color', p.water);
  set('ctx-lake-shore', 'line-color', p.waterLine);
  set('ctx-river', 'line-color', p.waterLine);
  set('frame-line', 'line-color', p.ink);
  set('lc-farm', 'fill-color', p.farm);
  set('lc-residential', 'fill-color', p.urban);
  set('lc-grass', 'fill-color', p.grass);
  set('lc-vineyard', 'fill-color', p.vineyard);
  set('lc-forest', 'fill-color', p.forest);
  set('lc-park', 'fill-color', p.park);
  set('lc-rock', 'fill-color', p.rock);
  set('contours', 'line-color', p.contour);
  set('water', 'fill-color', p.water);
  for (const r of ['water-ripple-1', 'water-ripple-2']) set(r, 'line-color', p.waterLine);
  set('water-shore', 'line-color', p.ink);
  set('waterway', 'line-color', p.waterLine);
  set('path', 'line-color', p.path);
  set('road-casing', 'line-color', p.casing);
  set('road-fill', 'line-color', p.road);
  set('rail-base', 'line-color', p.rail);
  set('rail-dash', 'line-color', p.paper);
  set('steps', 'line-color', p.ink);
  set('building-flat', 'fill-color', ['case', ['==', ['get', 'lm'], 1], p.landmark, p.building]);
  set('building-flat', 'fill-outline-color', p.ink);
  set('building-footprint', 'line-color', p.ink);
  set('building-3d', 'fill-extrusion-color', ['case', ['==', ['get', 'lm'], 1], p.landmark, ['match', ['get', 'tone'], 0, p.model, 1, mix(p.model, p.building, 0.25), 2, mix(p.model, p.paper2, 0.35), p.model]]);
  set('building-windows', 'fill-extrusion-opacity', p.windowGlow * 0.85);
  for (const id of ['label-place', 'label-place-minor', 'label-road', 'label-poi', 'label-peak', 'label-area', 'ctx-place', 'contour-labels']) set(id, 'text-halo-color', p.halo);
  set('label-place', 'text-color', p.label);
  set('label-place-minor', 'text-color', p.inkSoft);
  set('label-road', 'text-color', p.inkSoft);
  set('label-peak', 'text-color', p.inkSoft);
  set('ctx-place', 'text-color', p.graphite);
  set('label-water', 'text-halo-color', p.water);
}
