/**
 * Fase 1 — Grafi di percorrenza reali derivati da OSM.
 *  - walk: rete pedonale (strade con marciapiede presunto, vicoli, scalinate, sentieri)
 *  - road: rete stradale per ricostruire la geometria delle corse bus fra fermate
 *  - rail: ferrovie e funicolari
 * Le quote dei nodi e i dislivelli degli archi derivano dal DEM Terrarium locale.
 * Per ponti e gallerie la quota è interpolata fra gli estremi (il DEM misura il suolo).
 *
 * Output: data/build/graph-walk.json, graph-road.json, graph-rail.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Dem, haversine } from '../lib/dem.ts';
import { EdgeFlag, type SerializedGraph } from '../../src/shared/graph-format.ts';

type Tags = Record<string, string>;
interface Way { osm: string; id: number; nodes: number[]; coords: [number, number][]; tags: Tags; area?: boolean }

const dem = new Dem();
const highways: Way[] = JSON.parse(readFileSync('data/build/osm/highways.json', 'utf8'));
const railWays: Way[] = JSON.parse(readFileSync('data/build/osm/rail.json', 'utf8'));

const WALK_OK = new Set(['footway', 'path', 'pedestrian', 'steps', 'residential', 'living_street', 'service', 'unclassified', 'tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'primary', 'primary_link', 'track', 'cycleway', 'bridleway', 'road', 'trunk', 'trunk_link', 'busway']);
const UNPAVED = new Set(['unpaved', 'gravel', 'fine_gravel', 'dirt', 'earth', 'ground', 'grass', 'mud', 'sand', 'rock', 'pebblestone', 'woodchips', 'compacted', 'grass_paver']);
const SAC: Record<string, number> = { hiking: 1, mountain_hiking: 2, demanding_mountain_hiking: 3, alpine_hiking: 4, demanding_alpine_hiking: 5, difficult_alpine_hiking: 6 };
const ROAD_OK = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'busway', 'road']);

function walkable(t: Tags): boolean {
  const h = t.highway;
  if (!WALK_OK.has(h)) return false;
  const footYes = ['yes', 'designated', 'permissive', 'destination'].includes(t.foot);
  if (t.foot === 'no' || t.foot === 'private' || t.foot === 'use_sidepath') return false;
  if (['private', 'no'].includes(t.access) && !footYes) return false;
  if ((h === 'trunk' || h === 'trunk_link') && !footYes && !hasSidewalk(t)) return false;
  if (h === 'busway' && !footYes) return false;
  if ((SAC[t.sac_scale] ?? 0) >= 4) return false; // alpinismo: escluso dal routing ordinario
  if (t.indoor === 'yes' || h === 'corridor') return false;
  return true;
}
function hasSidewalk(t: Tags): boolean {
  const s = [t.sidewalk, t['sidewalk:both'], t['sidewalk:left'], t['sidewalk:right']];
  return s.some((v) => v && !['no', 'none', 'separate'].includes(v));
}

function walkFlags(t: Tags): { flags: number; sac: number } {
  let f = 0;
  const h = t.highway;
  const sac = SAC[t.sac_scale] ?? 0;
  if (h === 'steps') f |= EdgeFlag.STEPS;
  if (sac >= 2) f |= EdgeFlag.TRAIL;
  if (UNPAVED.has(t.surface) || (!t.surface && (h === 'path' || h === 'track' || h === 'bridleway'))) f |= EdgeFlag.UNPAVED;
  if (t.lit === 'yes') f |= EdgeFlag.LIT;
  if (t.tunnel && t.tunnel !== 'no') f |= EdgeFlag.TUNNEL;
  if (t.bridge && t.bridge !== 'no') f |= EdgeFlag.BRIDGE;
  if (t.wheelchair === 'no') f |= EdgeFlag.WHEELCHAIR_NO;
  if (t.wheelchair === 'yes') f |= EdgeFlag.WHEELCHAIR_YES;
  if (t['ramp:stroller'] === 'yes' || t['ramp:wheelchair'] === 'yes') f |= EdgeFlag.STROLLER_RAMP;
  if (['path', 'track', 'bridleway'].includes(h)) f |= EdgeFlag.PATH;
  if (['footway', 'pedestrian', 'living_street', 'steps', 'residential'].includes(h) || hasSidewalk(t)) f |= EdgeFlag.PEDESTRIAN_SAFE;
  if (['primary', 'primary_link', 'secondary', 'secondary_link', 'trunk', 'trunk_link'].includes(h) && !t.sidewalk && !t['sidewalk:both'] && !t['sidewalk:left'] && !t['sidewalk:right']) f |= EdgeFlag.ROAD_NO_SIDEWALK_INFO;
  return { flags: f, sac };
}

interface BuildEdge { a: number; b: number; coords: [number, number][]; cls: string; flags: number; sac: number; name: string; dir: number; way: number; interp: boolean }

function buildGraph(kind: SerializedGraph['kind'], ways: Way[], classify: (w: Way) => { cls: string; flags: number; sac: number; dir: number } | null, maxSegM = 100): SerializedGraph {
  // 1. nodi di diramazione: usati da più vie o estremi
  const use = new Map<number, number>();
  const selected: { w: Way; c: NonNullable<ReturnType<typeof classify>> }[] = [];
  for (const w of ways) {
    if (!w.nodes || !w.coords || w.nodes.length !== w.coords.length || w.nodes.length < 2) continue;
    const c = classify(w);
    if (!c) continue;
    selected.push({ w, c });
    w.nodes.forEach((id, i) => {
      const inc = i === 0 || i === w.nodes.length - 1 ? 2 : 1;
      use.set(id, (use.get(id) ?? 0) + inc);
    });
  }
  const vIndex = new Map<number, number>();
  const nodeLon: number[] = [], nodeLat: number[] = [], nodeEle: number[] = [];
  const vertex = (id: number, lon: number, lat: number) => {
    let k = vIndex.get(id);
    if (k == null) {
      k = nodeLon.length;
      vIndex.set(id, k);
      nodeLon.push(Math.round(lon * 1e6));
      nodeLat.push(Math.round(lat * 1e6));
      const e = dem.sample(lon, lat);
      nodeEle.push(Number.isFinite(e) ? Math.round(e * 10) : 0);
    }
    return k;
  };
  // 2. spezza le vie ai nodi di diramazione
  const edges: BuildEdge[] = [];
  for (const { w, c } of selected) {
    let start = 0;
    let acc = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      acc += haversine(w.coords[i - 1][0], w.coords[i - 1][1], w.coords[i][0], w.coords[i][1]);
      // nodo di diramazione, estremo, oppure nodo intermedio per limitare la lunghezza degli archi
      const isVertex = i === w.nodes.length - 1 || (use.get(w.nodes[i]) ?? 0) > 1 || acc >= maxSegM;
      if (!isVertex) continue;
      acc = 0;
      const a = vertex(w.nodes[start], w.coords[start][0], w.coords[start][1]);
      const b = vertex(w.nodes[i], w.coords[i][0], w.coords[i][1]);
      if (a !== b || i - start > 1) {
        const interp = (c.flags & (EdgeFlag.BRIDGE | EdgeFlag.TUNNEL)) !== 0 || w.tags.bridge != null && w.tags.bridge !== 'no' || w.tags.tunnel != null && w.tags.tunnel !== 'no';
        edges.push({ a, b, coords: w.coords.slice(start, i + 1), cls: c.cls, flags: c.flags, sac: c.sac, name: w.tags.name ?? '', dir: c.dir, way: w.id, interp });
      }
      start = i;
    }
  }
  // 3. lunghezze e dislivelli (campionamento ogni ~12 m)
  const classes: string[] = [], names: string[] = [];
  const clsIdx = new Map<string, number>(), nameIdx = new Map<string, number>();
  const idx = (m: Map<string, number>, arr: string[], v: string) => { let k = m.get(v); if (k == null) { k = arr.length; arr.push(v); m.set(v, k); } return k; };
  const g: SerializedGraph = {
    kind, version: 1, builtAt: new Date().toISOString(),
    source: 'OpenStreetMap (ODbL) via estratti Geofabrik; quote: Terrain Tiles Terrarium z14',
    crs: 'EPSG:4326 microdegrees; lengths/elevations in decimetres',
    nodeLon, nodeLat, nodeEle,
    edgeA: [], edgeB: [], edgeLen: [], edgeUp: [], edgeDown: [], edgeCls: [], edgeFlags: [], edgeSac: [], edgeName: [], edgeDir: [], edgeWay: [], edgeGeomOff: [], geomLon: [], geomLat: [],
    classes, names,
  };
  for (const e of edges) {
    let len = 0;
    const samples: number[] = [];
    const eleA = nodeEle[e.a] / 10, eleB = nodeEle[e.b] / 10;
    let total = 0;
    for (let i = 1; i < e.coords.length; i++) total += haversine(e.coords[i - 1][0], e.coords[i - 1][1], e.coords[i][0], e.coords[i][1]);
    for (let i = 0; i < e.coords.length; i++) {
      if (i > 0) {
        const [x0, y0] = e.coords[i - 1], [x1, y1] = e.coords[i];
        const d = haversine(x0, y0, x1, y1);
        const steps = Math.max(1, Math.ceil(d / 12));
        for (let s = 1; s <= steps; s++) {
          const f = s / steps;
          const dist = len + d * f;
          samples.push(e.interp ? eleA + (eleB - eleA) * (total > 0 ? dist / total : 0) : dem.sample(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f));
        }
        len += d;
      } else samples.push(e.interp ? eleA : dem.sample(e.coords[0][0], e.coords[0][1]));
    }
    // leggero smoothing per ridurre il rumore del DEM
    const sm = samples.map((v, i) => {
      const a = samples[Math.max(0, i - 1)], c = samples[Math.min(samples.length - 1, i + 1)];
      return (a + 2 * v + c) / 4;
    });
    let up = 0, down = 0;
    for (let i = 1; i < sm.length; i++) {
      const d = sm[i] - sm[i - 1];
      if (!Number.isFinite(d)) continue;
      if (d > 0) up += d; else down -= d;
    }
    let flags = e.flags;
    if (len > 5 && Math.max(up, down) / len > 0.12) flags |= EdgeFlag.STEEP;
    g.edgeA.push(e.a); g.edgeB.push(e.b);
    g.edgeLen.push(Math.max(1, Math.round(len * 10)));
    g.edgeUp.push(Math.round(up * 10)); g.edgeDown.push(Math.round(down * 10));
    g.edgeCls.push(idx(clsIdx, classes, e.cls));
    g.edgeFlags.push(flags); g.edgeSac.push(e.sac);
    g.edgeName.push(e.name ? idx(nameIdx, names, e.name) : -1);
    g.edgeDir.push(e.dir); g.edgeWay.push(e.way);
    g.edgeGeomOff.push(g.geomLon.length);
    for (let i = 1; i < e.coords.length - 1; i++) {
      g.geomLon.push(Math.round(e.coords[i][0] * 1e6));
      g.geomLat.push(Math.round(e.coords[i][1] * 1e6));
    }
  }
  g.edgeGeomOff.push(g.geomLon.length);
  return g;
}

function stats(g: SerializedGraph) {
  const km = g.edgeLen.reduce((a, b) => a + b, 0) / 10000;
  return `${g.nodeLon.length} nodi, ${g.edgeA.length} archi, ${km.toFixed(0)} km`;
}

// --- walk
const walk = buildGraph('walk', highways, (w) => {
  if (w.area) {
    // piazze pedonali (area=yes): si percorre il perimetro; gli attraversamenti interni mancano
    if (w.tags.highway !== 'pedestrian') return null;
  }
  if (!walkable(w.tags)) return null;
  const { flags, sac } = walkFlags(w.tags);
  const h = w.tags.highway;
  const cls = h === 'steps' ? 'steps' : sac >= 2 ? 'trail' : ['footway', 'pedestrian', 'living_street'].includes(h) ? 'pedestrian' : ['path', 'track', 'bridleway', 'cycleway'].includes(h) ? 'path' : ['primary', 'primary_link', 'secondary', 'secondary_link', 'trunk', 'trunk_link'].includes(h) ? 'main_road' : 'street';
  return { cls, flags, sac, dir: 0 };
}, 80);
writeFileSync('data/build/graph-walk.json', JSON.stringify(walk));
console.log('walk:', stats(walk));

// --- road (bus)
const road = buildGraph('road', highways, (w) => {
  const t = w.tags;
  if (!ROAD_OK.has(t.highway) || w.area) return null;
  if (['no', 'private'].includes(t.access) && !['yes', 'designated'].includes(t.bus) && !['yes', 'designated'].includes(t.psv)) return null;
  if (t.highway === 'service' && ['parking_aisle', 'driveway', 'drive-through'].includes(t.service)) return null;
  let dir = 0;
  const ow = t['oneway:bus'] ?? t['oneway:psv'] ?? t.oneway ?? (t.junction === 'roundabout' ? 'yes' : undefined);
  if (ow === 'yes' || ow === '1' || ow === 'true') dir = 1;
  else if (ow === '-1') dir = 2;
  const f = (t.tunnel && t.tunnel !== 'no' ? EdgeFlag.TUNNEL : 0) | (t.bridge && t.bridge !== 'no' ? EdgeFlag.BRIDGE : 0);
  return { cls: t.highway.replace('_link', ''), flags: f, sac: 0, dir };
}, 100);
writeFileSync('data/build/graph-road.json', JSON.stringify(road));
console.log('road:', stats(road));

// --- rail
const rail = buildGraph('rail', railWays, (w) => {
  const r = w.tags.railway;
  if (!['rail', 'funicular', 'narrow_gauge', 'light_rail'].includes(r)) return null;
  const f = (r === 'funicular' ? EdgeFlag.FUNICULAR : 0) | (w.tags.tunnel && w.tags.tunnel !== 'no' ? EdgeFlag.TUNNEL : 0) | (w.tags.bridge && w.tags.bridge !== 'no' ? EdgeFlag.BRIDGE : 0);
  return { cls: r, flags: f, sac: 0, dir: 0 };
}, 120);
writeFileSync('data/build/graph-rail.json', JSON.stringify(rail));
console.log('rail:', stats(rail));
