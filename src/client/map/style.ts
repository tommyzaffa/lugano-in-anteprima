/**
 * Stile cartografico «atlante illustrato»: carta chiara, contorni a inchiostro,
 * lago turchese, vegetazione salvia, facciate calde e tetti in terracotta.
 * I colori dipendono dalla luce (giorno → tramonto → sera → notte), collegata
 * all'ora simulata come scelta artistica, non come calcolo astronomico.
 */
import type { StyleSpecification, LayerSpecification, ExpressionSpecification } from 'maplibre-gl';

export interface Palette {
  paper: string; paper2: string; ink: string; inkSoft: string; water: string; waterDeep: string; shore: string; ripple: string;
  forest: string; grass: string; park: string; farm: string; residential: string; commercial: string; industrial: string; vineyard: string; rock: string; sand: string;
  roadFill: string; roadMajor: string; casing: string; path: string; trail: string; rail: string;
  facade: string[]; roof: string; buildingFlat: string; label: string; halo: string; placeLabel: string;
  shadow: string; highlight: string; accent: string; contour: string; boundary: string; windowGlow: number; reflection: number;
}

export const PALETTES: Record<'day' | 'golden' | 'dusk' | 'night', Palette> = {
  day: {
    paper: '#f3ede0', paper2: '#ebe2cf', ink: '#2b2a27', inkSoft: '#5d574c', water: '#a3d3d8', waterDeep: '#86c3cc', shore: '#4d8795', ripple: '#6fa8b4',
    forest: '#b3c496', grass: '#cfdcae', park: '#c3d5a0', farm: '#ece3c6', residential: '#efe4d0', commercial: '#ecdcc8', industrial: '#e2d9cc', vineyard: '#d8dca6', rock: '#ddd5c6', sand: '#eee0bd',
    roadFill: '#fffaf0', roadMajor: '#fbeecf', casing: '#6f5f4c', path: '#7b6a55', trail: '#b8452e', rail: '#3b352e',
    facade: ['#ecdcc3', '#e8d2b4', '#f1e3cc', '#e3cdb0'], roof: '#c6653f', buildingFlat: '#dcbfa2', label: '#2b2a27', halo: '#f8f3e8', placeLabel: '#2b2a27',
    shadow: '#5b4a36', highlight: '#fffdf5', accent: '#c8643c', contour: '#b39e7f', boundary: '#7c5e7a', windowGlow: 0, reflection: 0,
  },
  golden: {
    paper: '#f3e6cc', paper2: '#eadab8', ink: '#2e2822', inkSoft: '#62553f', water: '#a6cdcc', waterDeep: '#8fbcc0', shore: '#557f86', ripple: '#78a3a6',
    forest: '#b4be8a', grass: '#d2d8a2', park: '#c8d296', farm: '#efdfb7', residential: '#f1dfc1', commercial: '#efd6b8', industrial: '#e5d5bd', vineyard: '#dcd897', rock: '#e0d1b8', sand: '#f0dcaf',
    roadFill: '#fff4dc', roadMajor: '#fde6bd', casing: '#735c43', path: '#7e6649', trail: '#b5432a', rail: '#3e352b',
    facade: ['#f2d6ae', '#eecb9d', '#f5dcb8', '#e9c596'], roof: '#c35833', buildingFlat: '#e0b88f', label: '#2e2822', halo: '#f8eedb', placeLabel: '#2e2822',
    shadow: '#6a4a2c', highlight: '#fff6e0', accent: '#c65a32', contour: '#b8986f', boundary: '#7f5b6f', windowGlow: 0.15, reflection: 0.1,
  },
  dusk: {
    paper: '#d6cabd', paper2: '#cabdb0', ink: '#2a2833', inkSoft: '#56505e', water: '#7fa4b8', waterDeep: '#6a90a8', shore: '#384f66', ripple: '#5a7890',
    forest: '#8f9c86', grass: '#aab496', park: '#a2af8c', farm: '#cfc3ab', residential: '#d3c4b3', commercial: '#d0bfae', industrial: '#c7bcb0', vineyard: '#b8b88e', rock: '#c4b9ac', sand: '#d2c2a4',
    roadFill: '#ece3d8', roadMajor: '#eadbc6', casing: '#4b4046', path: '#5a4d4c', trail: '#99402f', rail: '#2c2830',
    facade: ['#c2ac98', '#bca48e', '#c8b39f', '#b59d88'], roof: '#8f4b36', buildingFlat: '#b89c86', label: '#27242e', halo: '#e6ddd3', placeLabel: '#27242e',
    shadow: '#2d3246', highlight: '#e9e0d9', accent: '#b8573a', contour: '#8a7a70', boundary: '#6b536b', windowGlow: 0.55, reflection: 0.35,
  },
  night: {
    paper: '#3a3f4d', paper2: '#343947', ink: '#dcd4c2', inkSoft: '#aba392', water: '#243b52', waterDeep: '#1e3349', shore: '#6a88a4', ripple: '#35516b',
    forest: '#39463f', grass: '#404d45', park: '#3f4c44', farm: '#474a4c', residential: '#444855', commercial: '#474a56', industrial: '#44464f', vineyard: '#474c43', rock: '#4a4b52', sand: '#4d4b4b',
    roadFill: '#6f7280', roadMajor: '#857f79', casing: '#1f222a', path: '#8d8676', trail: '#b3654f', rail: '#1b1d23',
    facade: ['#5a5663', '#57525f', '#5e5a67', '#534f5c'], roof: '#4c3b3d', buildingFlat: '#56515d', label: '#f2ead8', halo: '#2a2e39', placeLabel: '#f5ecd6',
    shadow: '#0e1018', highlight: '#5e6788', accent: '#e0a458', contour: '#5f6270', boundary: '#8c7690', windowGlow: 1, reflection: 0.7,
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
    if (typeof va === 'number') out[k] = va + (vb - va) * t;
    else if (Array.isArray(va)) out[k] = va.map((c: string, j: number) => mix(c, vb[j], t));
    else out[k] = mix(va, vb, t);
  }
  return out as Palette;
}

const FONT = { regular: ['Open Sans Regular'], italic: ['Open Sans Italic'], semibold: ['Open Sans Semibold'], bold: ['PT Sans Bold'], narrow: ['PT Sans Narrow Regular'], serifLike: ['PT Sans Italic'] };

const z = (stops: [number, number][]): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], ...stops.flat()] as any;

export interface StyleOptions { threeD: boolean; contoursUrl?: string; bounds: [number, number, number, number]; origin: string }

export function buildStyle(p: Palette, opts: StyleOptions): StyleSpecification {
  // larghezza per classe: interpolazione sullo zoom al livello superiore, match per classe dentro ogni fermata
  const byClass = (w: Record<string, number>, dflt: number, f: number): ExpressionSpecification => (Object.keys(w).length ? ['match', ['get', 'cls'], ...Object.entries(w).flatMap(([k, v]) => [k, v * f]), dflt * f] : dflt * f) as any;
  const roadWidth = (w: Record<string, number>, dflt: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 10, byClass(w, dflt, 0.25), 13, byClass(w, dflt, 0.7), 15, byClass(w, dflt, 1.6), 17, byClass(w, dflt, 4.2), 19, byClass(w, dflt, 11)] as any;
  const casingW = { motorway: 2.4, trunk: 2.2, primary: 2, secondary: 1.8, tertiary: 1.6, pedestrian: 1.1, service: 0.8 };
  const fillW = { motorway: 1.8, trunk: 1.6, primary: 1.45, secondary: 1.3, tertiary: 1.15, pedestrian: 0.8, service: 0.5 };
  const layers: LayerSpecification[] = [
    { id: 'bg', type: 'background', paint: { 'background-color': p.paper } },
    { id: 'bg-texture', type: 'background', paint: { 'background-pattern': 'paper-grain', 'background-opacity': 0.55 } },
    // ------------------------------------------------ copertura del suolo
    { id: 'lc-farm', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['in', ['get', 'kind'], ['literal', ['farm', 'orchard']]], paint: { 'fill-color': p.farm, 'fill-opacity': 0.85 } },
    { id: 'lc-residential', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['in', ['get', 'kind'], ['literal', ['residential', 'institution', 'parking', 'plaza']]], paint: { 'fill-color': p.residential, 'fill-opacity': z([[10, 0.6], [15, 0.9]]) } },
    { id: 'lc-commercial', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['in', ['get', 'kind'], ['literal', ['commercial', 'industrial']]], paint: { 'fill-color': p.commercial, 'fill-opacity': 0.8 } },
    { id: 'lc-grass', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['in', ['get', 'kind'], ['literal', ['grass', 'sport', 'playground', 'cemetery', 'wetland', 'scrub']]], paint: { 'fill-color': p.grass, 'fill-opacity': 0.9 } },
    { id: 'lc-vineyard', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['==', ['get', 'kind'], 'vineyard'], paint: { 'fill-color': p.vineyard } },
    { id: 'lc-vineyard-pattern', type: 'fill', source: 'lugano', 'source-layer': 'landcover', minzoom: 13, filter: ['==', ['get', 'kind'], 'vineyard'], paint: { 'fill-pattern': 'vineyard-rows', 'fill-opacity': 0.6 } },
    { id: 'lc-forest', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['==', ['get', 'kind'], 'forest'], paint: { 'fill-color': p.forest, 'fill-opacity': 0.95 } },
    { id: 'lc-forest-pattern', type: 'fill', source: 'lugano', 'source-layer': 'landcover', minzoom: 12.5, filter: ['==', ['get', 'kind'], 'forest'], paint: { 'fill-pattern': 'tree-stipple', 'fill-opacity': z([[12.5, 0], [13.5, 0.55], [17, 0.75]]) } },
    { id: 'lc-park', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['in', ['get', 'kind'], ['literal', ['park', 'garden']]], paint: { 'fill-color': p.park } },
    { id: 'lc-park-outline', type: 'line', source: 'lugano', 'source-layer': 'landcover', minzoom: 14, filter: ['in', ['get', 'kind'], ['literal', ['park', 'garden']]], paint: { 'line-color': mix(p.park, p.ink, 0.35), 'line-width': 0.6, 'line-dasharray': [2, 2] } },
    { id: 'lc-rock', type: 'fill', source: 'lugano', 'source-layer': 'landcover', filter: ['in', ['get', 'kind'], ['literal', ['rock', 'beach', 'lido', 'pier', 'marina']]], paint: { 'fill-color': p.sand } },
    // ------------------------------------------------ rilievo
    { id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-shadow-color': p.shadow, 'hillshade-highlight-color': p.highlight, 'hillshade-accent-color': p.shadow, 'hillshade-exaggeration': z([[9, 0.55], [13, 0.42], [16, 0.25]]), 'hillshade-illumination-direction': 315 } as any },
    ...(opts.contoursUrl ? [
      { id: 'contours', type: 'line', source: 'contours', 'source-layer': 'contours', minzoom: 11.5, paint: { 'line-color': p.contour, 'line-opacity': z([[11.5, 0], [12.5, 0.45], [16, 0.35]]), 'line-width': ['case', ['>', ['get', 'level'], 0], 1.1, 0.5] } } as LayerSpecification,
      { id: 'contour-labels', type: 'symbol', source: 'contours', 'source-layer': 'contours', minzoom: 13.5, filter: ['>', ['get', 'level'], 0], layout: { 'symbol-placement': 'line', 'text-field': ['concat', ['number-format', ['get', 'ele'], {}], ' m'], 'text-font': FONT.italic, 'text-size': 10, 'text-max-angle': 25, 'symbol-spacing': 420 }, paint: { 'text-color': mix(p.contour, p.ink, 0.35), 'text-halo-color': p.paper, 'text-halo-width': 1.2 } } as LayerSpecification,
    ] : []),
    // ------------------------------------------------ acqua
    { id: 'water', type: 'fill', source: 'lugano', 'source-layer': 'water', filter: ['!=', ['get', 'kind'], 'pool'], paint: { 'fill-color': p.water } },
    { id: 'water-ripple-3', type: 'line', source: 'lugano', 'source-layer': 'water', filter: ['==', ['get', 'kind'], 'lake'], paint: { 'line-color': p.ripple, 'line-width': 0.6, 'line-offset': z([[10, 3], [14, 12], [17, 28]]), 'line-opacity': 0.25 } },
    { id: 'water-ripple-2', type: 'line', source: 'lugano', 'source-layer': 'water', filter: ['==', ['get', 'kind'], 'lake'], paint: { 'line-color': p.ripple, 'line-width': 0.7, 'line-offset': z([[10, 2], [14, 7], [17, 16]]), 'line-opacity': 0.4 } },
    { id: 'water-ripple-1', type: 'line', source: 'lugano', 'source-layer': 'water', filter: ['==', ['get', 'kind'], 'lake'], paint: { 'line-color': p.ripple, 'line-width': 0.8, 'line-offset': z([[10, 1], [14, 3], [17, 7]]), 'line-opacity': 0.55 } },
    { id: 'water-reflection', type: 'line', source: 'lugano', 'source-layer': 'water', filter: ['==', ['get', 'kind'], 'lake'], paint: { 'line-color': '#f0c27a', 'line-width': z([[11, 2], [16, 10]]), 'line-blur': z([[11, 2], [16, 10]]), 'line-offset': z([[11, 2], [16, 8]]), 'line-opacity': p.reflection * 0.5 } },
    { id: 'water-shore', type: 'line', source: 'lugano', 'source-layer': 'water', filter: ['!=', ['get', 'kind'], 'pool'], paint: { 'line-color': p.shore, 'line-width': z([[9, 0.6], [14, 1.2], [17, 2]]) } },
    { id: 'pools', type: 'fill', source: 'lugano', 'source-layer': 'water', filter: ['==', ['get', 'kind'], 'pool'], paint: { 'fill-color': p.waterDeep, 'fill-outline-color': p.shore } },
    { id: 'waterway', type: 'line', source: 'lugano', 'source-layer': 'waterway', filter: ['!=', ['get', 'tn'], 1], paint: { 'line-color': p.shore, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, ['match', ['get', 'kind'], 'river', 1.2, 0.4], 16, ['match', ['get', 'kind'], 'river', 4, 1.6]] as any, 'line-opacity': 0.8 } },
    // ------------------------------------------------ confini
    { id: 'boundary-municipal', type: 'line', source: 'lugano', 'source-layer': 'boundary', minzoom: 11, filter: ['==', ['get', 'lvl'], 8], paint: { 'line-color': p.boundary, 'line-width': z([[11, 0.5], [15, 1.2]]), 'line-dasharray': [4, 3], 'line-opacity': 0.45 } },
    { id: 'boundary-national', type: 'line', source: 'lugano', 'source-layer': 'boundary', filter: ['==', ['get', 'lvl'], 2], paint: { 'line-color': p.boundary, 'line-width': z([[8, 1.2], [14, 2.6]]), 'line-dasharray': [6, 2, 1, 2], 'line-opacity': 0.8 } },
    // ------------------------------------------------ strade e sentieri
    { id: 'road-tunnel', type: 'line', source: 'lugano', 'source-layer': 'roads', filter: ['all', ['==', ['get', 'tn'], 1], ['in', ['get', 'cls'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]]], layout: { 'line-cap': 'butt' }, paint: { 'line-color': p.casing, 'line-width': roadWidth({}, 1.2), 'line-dasharray': [1, 1.5], 'line-opacity': 0.35 } },
    { id: 'path', type: 'line', source: 'lugano', 'source-layer': 'roads', filter: ['all', ['in', ['get', 'cls'], ['literal', ['path', 'footway', 'track', 'cycleway', 'sidewalk']]], ['!=', ['get', 'tn'], 1]], layout: { 'line-cap': 'round' }, paint: { 'line-color': p.path, 'line-width': z([[13, 0.5], [16, 1.3], [18, 2.5]]), 'line-dasharray': [2.5, 1.8], 'line-opacity': z([[13, 0.5], [15, 0.85]]) } },
    { id: 'trail', type: 'line', source: 'lugano', 'source-layer': 'roads', filter: ['==', ['get', 'cls'], 'trail'], layout: { 'line-cap': 'butt' }, paint: { 'line-color': p.trail, 'line-width': z([[12, 0.8], [16, 1.8]]), 'line-dasharray': [3, 2] } },
    { id: 'steps', type: 'line', source: 'lugano', 'source-layer': 'roads', filter: ['==', ['get', 'cls'], 'steps'], paint: { 'line-color': p.ink, 'line-width': z([[14, 1.5], [17, 4], [19, 8]]), 'line-dasharray': [0.3, 0.45], 'line-opacity': 0.7 } },
    { id: 'pier', type: 'line', source: 'lugano', 'source-layer': 'roads', filter: ['==', ['get', 'cls'], 'pier'], paint: { 'line-color': '#8a6d4c', 'line-width': z([[14, 1.5], [17, 5]]) } },
    { id: 'road-casing', type: 'line', source: 'lugano', 'source-layer': 'roads', filter: ['all', ['in', ['get', 'cls'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'pedestrian']]], ['!=', ['get', 'tn'], 1]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': p.casing,
      'line-width': roadWidth(casingW, 1.25),
      'line-opacity': z([[10, 0.55], [14, 0.9]]),
    } },
    { id: 'road-fill', type: 'line', source: 'lugano', 'source-layer': 'roads', minzoom: 12.5, filter: ['all', ['in', ['get', 'cls'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'pedestrian']]], ['!=', ['get', 'tn'], 1]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': ['match', ['get', 'cls'], ['motorway', 'trunk', 'primary', 'secondary'], p.roadMajor, p.roadFill],
      'line-width': roadWidth(fillW, 0.9),
    } },
    // ------------------------------------------------ ferrovie, funicolari, battelli
    { id: 'rail-base', type: 'line', source: 'lugano', 'source-layer': 'rail', filter: ['all', ['!=', ['get', 'cls'], 'disused'], ['!=', ['get', 'tn'], 1]], paint: { 'line-color': ['match', ['get', 'cls'], 'funicular', '#8d3a28', p.rail], 'line-width': z([[10, 1], [15, 3], [18, 5]]) } },
    { id: 'rail-dash', type: 'line', source: 'lugano', 'source-layer': 'rail', minzoom: 12, filter: ['all', ['!=', ['get', 'cls'], 'disused'], ['!=', ['get', 'tn'], 1], ['!=', ['get', 'cls'], 'funicular']], paint: { 'line-color': p.paper, 'line-width': z([[12, 0.6], [15, 1.6], [18, 3]]), 'line-dasharray': [3, 3] } },
    { id: 'rail-tunnel', type: 'line', source: 'lugano', 'source-layer': 'rail', filter: ['==', ['get', 'tn'], 1], paint: { 'line-color': p.rail, 'line-width': z([[10, 0.8], [15, 2]]), 'line-dasharray': [1, 2], 'line-opacity': 0.4 } },
    { id: 'funicular-ticks', type: 'line', source: 'lugano', 'source-layer': 'rail', minzoom: 13, filter: ['==', ['get', 'cls'], 'funicular'], paint: { 'line-color': '#8d3a28', 'line-width': z([[13, 5], [17, 11]]), 'line-dasharray': [0.2, 2.2] } },
    { id: 'aerialway', type: 'line', source: 'lugano', 'source-layer': 'aerialway', paint: { 'line-color': p.ink, 'line-width': 1, 'line-dasharray': [4, 1, 1, 1] } },
    { id: 'ferry', type: 'line', source: 'lugano', 'source-layer': 'ferry', paint: { 'line-color': p.shore, 'line-width': z([[10, 0.8], [15, 1.6]]), 'line-dasharray': [1, 2.5], 'line-opacity': 0.8 } },
    // ------------------------------------------------ edifici
    { id: 'building-flat', type: 'fill', source: 'lugano', 'source-layer': 'buildings', maxzoom: opts.threeD ? 15 : 24, paint: { 'fill-color': ['case', ['==', ['get', 'lm'], 1], p.roof, p.buildingFlat], 'fill-outline-color': mix(p.buildingFlat, p.ink, 0.45), 'fill-opacity': z([[13, 0.6], [15, 0.95]]) } },
    ...(opts.threeD ? [
      { id: 'building-3d', type: 'fill-extrusion', source: 'lugano', 'source-layer': 'buildings', minzoom: 14.5, paint: {
        'fill-extrusion-color': ['match', ['get', 'tone'], 0, p.facade[0], 1, p.facade[1], 2, p.facade[2], p.facade[3]],
        'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'mh'],
        'fill-extrusion-opacity': z([[14.5, 0], [15.2, 0.92]]), 'fill-extrusion-vertical-gradient': true,
      } } as LayerSpecification,
      { id: 'building-roof', type: 'fill-extrusion', source: 'lugano', 'source-layer': 'buildings', minzoom: 14.5, paint: {
        'fill-extrusion-color': roofColor(p),
        'fill-extrusion-height': ['+', ['get', 'h'], 1.4], 'fill-extrusion-base': ['get', 'h'],
        'fill-extrusion-opacity': z([[14.5, 0], [15.2, 0.95]]),
      } } as LayerSpecification,
      { id: 'building-windows', type: 'fill-extrusion', source: 'lugano', 'source-layer': 'buildings', minzoom: 15, filter: ['>', ['get', 'h'], 6], paint: {
        'fill-extrusion-color': '#ffc86e', 'fill-extrusion-height': ['*', ['get', 'h'], 0.66], 'fill-extrusion-base': ['*', ['get', 'h'], 0.52],
        'fill-extrusion-opacity': p.windowGlow * 0.85,
      } } as LayerSpecification,
    ] : []),
    // ------------------------------------------------ cornice: fuori dall'area coperta dai dati la carta resta bianca,
    // come il margine di una tavola d'atlante (evita che lago e boschi finiscano con un taglio netto)
    { id: 'frame-mask', type: 'fill', source: 'frame', filter: ['==', ['get', 'k'], 'mask'], paint: { 'fill-color': p.paper, 'fill-antialias': false } },
    { id: 'frame-grain', type: 'fill', source: 'frame', filter: ['==', ['get', 'k'], 'mask'], paint: { 'fill-pattern': 'paper-grain', 'fill-opacity': 0.55 } },
    { id: 'frame-line', type: 'line', source: 'frame', filter: ['==', ['get', 'k'], 'edge'], paint: { 'line-color': p.ink, 'line-width': 1.6, 'line-opacity': 0.55 } },
    { id: 'frame-line-outer', type: 'line', source: 'frame', filter: ['==', ['get', 'k'], 'edge'], paint: { 'line-color': p.ink, 'line-width': 0.8, 'line-opacity': 0.4, 'line-offset': -6 } },
    // ------------------------------------------------ etichette
    { id: 'label-water', type: 'symbol', source: 'lugano', 'source-layer': 'labels', filter: ['==', ['get', 'kind'], 'lake'], layout: { 'text-field': ['get', 'name'], 'text-font': FONT.italic, 'text-size': z([[9, 12], [13, 18], [16, 26]]), 'text-letter-spacing': 0.3, 'text-max-width': 20 }, paint: { 'text-color': mix(p.shore, p.ink, 0.2), 'text-halo-color': p.water, 'text-halo-width': 1 } },
    { id: 'label-waterway', type: 'symbol', source: 'lugano', 'source-layer': 'waterway', minzoom: 14, filter: ['all', ['has', 'name'], ['!=', ['get', 'name'], '']], layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': FONT.italic, 'text-size': 11, 'symbol-spacing': 350 }, paint: { 'text-color': p.shore, 'text-halo-color': p.paper, 'text-halo-width': 1.4 } },
    { id: 'label-area', type: 'symbol', source: 'lugano', 'source-layer': 'labels', filter: ['!=', ['get', 'kind'], 'lake'], layout: { 'text-field': ['get', 'name'], 'text-font': FONT.italic, 'text-size': z([[12, 10], [16, 13]]), 'text-max-width': 8, 'text-padding': 4 }, paint: { 'text-color': mix(p.forest, p.ink, 0.6), 'text-halo-color': p.halo, 'text-halo-width': 1.3 } },
    { id: 'label-road', type: 'symbol', source: 'lugano', 'source-layer': 'roads', minzoom: 14.5, filter: ['all', ['has', 'name'], ['in', ['get', 'cls'], ['literal', ['primary', 'secondary', 'tertiary', 'minor', 'pedestrian', 'service', 'steps', 'footway', 'path', 'trail']]]], layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': FONT.narrow, 'text-size': z([[14.5, 10], [17, 13], [19, 15]]), 'symbol-spacing': 300, 'text-max-angle': 30, 'text-padding': 2 }, paint: { 'text-color': p.inkSoft, 'text-halo-color': p.halo, 'text-halo-width': 1.6 } },
    { id: 'label-poi', type: 'symbol', source: 'lugano', 'source-layer': 'pois', minzoom: 16, filter: ['all', ['has', 'name'], ['!=', ['get', 'name'], '']], layout: { 'text-field': ['get', 'name'], 'text-font': FONT.regular, 'text-size': 10.5, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'icon-image': ['concat', 'poi-', ['get', 'cls']], 'icon-size': 0.8, 'text-optional': true, 'text-max-width': 9 }, paint: { 'text-color': p.inkSoft, 'text-halo-color': p.halo, 'text-halo-width': 1.3, 'icon-opacity': 0.9 } },
    { id: 'label-peak', type: 'symbol', source: 'lugano', 'source-layer': 'peaks', minzoom: 10.5, filter: ['all', ['has', 'name'], ['!=', ['get', 'name'], '']], layout: { 'text-field': ['concat', '▲ ', ['get', 'name'], ['case', ['>', ['get', 'ele'], 0], ['concat', '\n', ['to-string', ['get', 'ele']], ' m'], '']], 'text-font': FONT.italic, 'text-size': z([[10.5, 10], [14, 13]]), 'text-anchor': 'top', 'text-line-height': 1.1 }, paint: { 'text-color': '#5b4531', 'text-halo-color': p.halo, 'text-halo-width': 1.5 } },
    { id: 'label-place-minor', type: 'symbol', source: 'lugano', 'source-layer': 'places', minzoom: 12, filter: ['>=', ['get', 'rank'], 4], layout: { 'text-field': ['get', 'name'], 'text-font': FONT.semibold, 'text-size': z([[12, 10], [16, 13]]), 'text-transform': 'none', 'text-max-width': 8, 'text-padding': 6, 'symbol-sort-key': ['get', 'rank'] }, paint: { 'text-color': p.inkSoft, 'text-halo-color': p.halo, 'text-halo-width': 1.6 } },
    { id: 'label-place', type: 'symbol', source: 'lugano', 'source-layer': 'places', filter: ['<=', ['get', 'rank'], 3], layout: { 'text-field': ['get', 'name'], 'text-font': FONT.bold, 'text-size': ['interpolate', ['linear'], ['zoom'], 9, ['match', ['get', 'rank'], 1, 16, 2, 13, 11], 14, ['match', ['get', 'rank'], 1, 26, 2, 19, 16]], 'text-transform': 'uppercase', 'text-letter-spacing': 0.18, 'text-max-width': 10, 'text-padding': 8, 'symbol-sort-key': ['-', ['get', 'rank'], ['/', ['get', 'pop'], 1000000]] }, paint: { 'text-color': p.placeLabel, 'text-halo-color': p.halo, 'text-halo-width': 2 } },
  ];
  const sources: StyleSpecification['sources'] = {
    lugano: { type: 'vector', tiles: [`${opts.origin}/tiles/lugano/{z}/{x}/{y}.pbf`], minzoom: 8, maxzoom: 16, bounds: opts.bounds, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' },
    dem: { type: 'raster-dem', tiles: [`${opts.origin}/terrain/{z}/{x}/{y}.png`], encoding: 'terrarium', tileSize: 256, minzoom: 8, maxzoom: 14, bounds: opts.bounds, attribution: 'Rilievo: swissALTI3D © swisstopo; Terrain Tiles (AWS Open Data, SRTM e altre fonti)' },
  };
  sources.frame = { type: 'geojson', data: frameGeoJSON(opts.bounds) };
  if (opts.contoursUrl) sources.contours = { type: 'vector', tiles: [opts.contoursUrl], minzoom: 11, maxzoom: 15, bounds: opts.bounds };
  return {
    version: 8,
    name: 'Lugano in anteprima — atlante',
    glyphs: `${opts.origin}/glyphs/{fontstack}/{range}.pbf`,
    sources,
    layers,
    light: { anchor: 'viewport', color: '#fff6e8', intensity: 0.32, position: [1.3, 210, 40] },
  } as StyleSpecification;
}

/** Maschera esterna (mondo meno l'area dei dati, leggermente rientrata) e bordo della tavola. */
export function frameGeoJSON(b: [number, number, number, number]): GeoJSON.FeatureCollection {
  const inset = 0.002;
  const [w, s, e, n] = [b[0] + inset * 1.4, b[1] + inset, b[2] - inset * 1.4, b[3] - inset];
  const inner: [number, number][] = [[w, s], [e, s], [e, n], [w, n], [w, s]];
  const outer: [number, number][] = [[b[0] - 3, b[1] - 3], [b[0] - 3, b[3] + 3], [b[2] + 3, b[3] + 3], [b[2] + 3, b[1] - 3], [b[0] - 3, b[1] - 3]];
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { k: 'mask' }, geometry: { type: 'Polygon', coordinates: [outer, inner.slice().reverse()] } },
      { type: 'Feature', properties: { k: 'edge' }, geometry: { type: 'LineString', coordinates: inner } },
    ],
  };
}

/** Aggiorna i colori della palette sui layer già presenti, senza ricaricare lo stile. */
export function applyPalette(map: import('maplibre-gl').Map, p: Palette) {
  const set = (id: string, prop: string, v: unknown) => { if (map.getLayer(id)) map.setPaintProperty(id, prop as any, v as any); };
  set('bg', 'background-color', p.paper);
  set('frame-mask', 'fill-color', p.paper);
  set('frame-grain', 'fill-opacity', 0.55 * (1 - p.windowGlow * 0.5));
  set('frame-line', 'line-color', p.ink);
  set('frame-line-outer', 'line-color', p.ink);
  set('bg-texture', 'background-opacity', 0.55 * (1 - p.windowGlow * 0.5));
  set('lc-farm', 'fill-color', p.farm);
  set('lc-residential', 'fill-color', p.residential);
  set('lc-commercial', 'fill-color', p.commercial);
  set('lc-grass', 'fill-color', p.grass);
  set('lc-vineyard', 'fill-color', p.vineyard);
  set('lc-forest', 'fill-color', p.forest);
  set('lc-park', 'fill-color', p.park);
  set('lc-rock', 'fill-color', p.sand);
  set('hillshade', 'hillshade-shadow-color', p.shadow);
  set('hillshade', 'hillshade-highlight-color', p.highlight);
  set('hillshade', 'hillshade-accent-color', p.shadow);
  set('contours', 'line-color', p.contour);
  set('water', 'fill-color', p.water);
  for (const r of ['water-ripple-1', 'water-ripple-2', 'water-ripple-3']) set(r, 'line-color', p.ripple);
  set('water-shore', 'line-color', p.shore);
  set('water-reflection', 'line-opacity', p.reflection * 0.5);
  set('waterway', 'line-color', p.shore);
  set('path', 'line-color', p.path);
  set('trail', 'line-color', p.trail);
  set('road-casing', 'line-color', p.casing);
  set('road-fill', 'line-color', ['match', ['get', 'cls'], ['motorway', 'trunk', 'primary', 'secondary'], p.roadMajor, p.roadFill]);
  set('rail-dash', 'line-color', p.paper);
  set('building-flat', 'fill-color', ['case', ['==', ['get', 'lm'], 1], p.roof, p.buildingFlat]);
  set('building-3d', 'fill-extrusion-color', ['match', ['get', 'tone'], 0, p.facade[0], 1, p.facade[1], 2, p.facade[2], p.facade[3]]);
  set('building-roof', 'fill-extrusion-color', roofColor(p));
  set('building-windows', 'fill-extrusion-opacity', p.windowGlow * 0.85);
  for (const id of ['label-place', 'label-place-minor', 'label-road', 'label-poi', 'label-peak', 'label-area']) set(id, 'text-halo-color', p.halo);
  set('label-place', 'text-color', p.placeLabel);
  set('label-place-minor', 'text-color', p.inkSoft);
  set('label-road', 'text-color', p.inkSoft);
  set('label-poi', 'text-color', p.inkSoft);
  set('label-water', 'text-halo-color', p.water);
}

/** Tetti variati: coppi in terracotta di toni diversi, qualche tetto in piode/lamiera grigia, landmark più scuri. */
function roofColor(p: Palette): ExpressionSpecification {
  return ['case', ['==', ['get', 'lm'], 1], mix(p.roof, '#7a3420', 0.3),
    ['match', ['get', 'tone'], 0, p.roof, 1, mix(p.roof, '#e3a27a', 0.35), 2, mix(p.roof, '#8e8a84', 0.55), mix(p.roof, '#a4502f', 0.4)]] as any;
}
