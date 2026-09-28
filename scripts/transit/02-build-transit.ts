/**
 * Costruisce la rete dei trasporti pronta per il pianificatore:
 *  - fermate agganciate al grafo pedonale (accesso a piedi);
 *  - percorsi pedonali di interscambio fra fermate vicine;
 *  - schemi di corsa (pattern) e orari compatti;
 *  - geometria reale delle tratte: bus sulla rete stradale, treni e funicolari
 *    sui binari OSM, battelli su una griglia d'acqua derivata dal poligono del lago
 *    (mai attraverso la terraferma). Se una geometria non si ricostruisce, la tratta
 *    è marcata «approx» e disegnata come tale.
 *
 * Output: data/build/transit.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import TinyQueue from 'tinyqueue';
import { Graph, haversine, type EdgeView } from '../../src/server/routing/graph.ts';
import { walkCost, type WalkProfile } from '../../src/server/routing/walk.ts';
import { EdgeFlag } from '../../src/shared/graph-format.ts';

const raw = JSON.parse(readFileSync('data/build/transit-raw.json', 'utf8'));
const walk = new Graph(JSON.parse(readFileSync('data/build/graph-walk.json', 'utf8')));
const road = new Graph(JSON.parse(readFileSync('data/build/graph-road.json', 'utf8')));
const rail = new Graph(JSON.parse(readFileSync('data/build/graph-rail.json', 'utf8')));
const lake = JSON.parse(readFileSync('data/build/osm/lake.json', 'utf8'));
const perimeter = JSON.parse(readFileSync('data/geo/perimeter.json', 'utf8'));

type Mode = 'bus' | 'train' | 'funicular' | 'boat' | 'cable_car';
const modeOf = (t: number): Mode => (t >= 1400 && t < 1500 ? 'funicular' : t >= 1000 && t < 1100 ? 'boat' : t >= 100 && t < 200 ? 'train' : t >= 1300 && t < 1400 ? 'cable_car' : 'bus');

// ------------------------------------------------------------ fermate → rete pedonale
const stdWalk: WalkProfile = { id: 'std', speed: 1.25, ascentRate: 350, descentRate: 550, steps: 'ok', maxSac: 2, trailPenalty: 3, unpaved: 'ok', night: false, climbPenalty: 1, wheelchair: false };
const wcost = walkCost(stdWalk);
const stepFree: WalkProfile = { ...stdWalk, id: 'stepfree', steps: 'forbidden', maxSac: 0, unpaved: 'avoid' };
const wcostSF = walkCost(stepFree);

const stopModes: Set<Mode>[] = raw.stops.map(() => new Set<Mode>());
const routeById = new Map(raw.routes.map((r: any) => [r.id, r]));
for (const t of raw.trips) for (const s of t.stops) stopModes[s].add(modeOf((routeById.get(t.route) as any).type));

const stops = raw.stops.map((s: any, i: number) => {
  const near = walk.nearest(s.lon, s.lat, 8, 250).filter((n) => walk.usable(n.node, wcost));
  const nearSF = walk.nearest(s.lon, s.lat, 8, 250).filter((n) => walk.usable(n.node, wcostSF));
  return {
    id: s.id, name: s.name, lat: s.lat, lon: s.lon, parent: s.parent, platform: s.platform,
    modes: [...stopModes[i]],
    walkNode: near[0]?.node ?? -1, walkDistM: near[0] ? Math.round(near[0].distM) : -1,
    walkNodeSF: nearSF[0]?.node ?? -1, walkDistSFM: nearSF[0] ? Math.round(nearSF[0].distM) : -1,
  };
});
console.log(`Fermate agganciate alla rete pedonale: ${stops.filter((s: any) => s.walkNode >= 0).length}/${stops.length}`);

// ------------------------------------------------------------ interscambi a piedi
function computeFootpaths(nodeKey: 'walkNode' | 'walkNodeSF', distKey: 'walkDistM' | 'walkDistSFM', cost: typeof wcost) {
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < stops.length; i++) {
    const a = stops[i];
    if (a[nodeKey] < 0) continue;
    const reach = walk.dijkstra([{ node: a[nodeKey], cost: a[distKey] / 1.25 }], cost, 420);
    for (let j = 0; j < stops.length; j++) {
      if (i === j) continue;
      const b = stops[j];
      if (b[nodeKey] < 0 || haversine(a.lon, a.lat, b.lon, b.lat) > 450) continue;
      const t = reach.get(b[nodeKey]);
      if (t == null) continue;
      const sec = Math.round(t + b[distKey] / 1.25);
      if (sec <= 480) out.push([i, j, sec, Math.round(sec * 1.25)]);
    }
  }
  return out;
}
const footpaths = computeFootpaths('walkNode', 'walkDistM', wcost);
const footpathsSF = computeFootpaths('walkNodeSF', 'walkDistSFM', wcostSF);
console.log(`Interscambi a piedi: ${footpaths.length} (senza gradini: ${footpathsSF.length})`);

// ------------------------------------------------------------ griglia d'acqua per i battelli
const CELL = 30; // metri
const midLat = (perimeter.buffer.south + perimeter.buffer.north) / 2;
const mLat = 111320, mLon = 111320 * Math.cos((midLat * Math.PI) / 180);
const W = Math.ceil(((perimeter.buffer.east - perimeter.buffer.west) * mLon) / CELL);
const H = Math.ceil(((perimeter.buffer.north - perimeter.buffer.south) * mLat) / CELL);
const water = new Uint8Array(W * H);
const cx = (lon: number) => Math.floor(((lon - perimeter.buffer.west) * mLon) / CELL);
const cy = (lat: number) => Math.floor(((perimeter.buffer.north - lat) * mLat) / CELL);
const cellLon = (x: number) => perimeter.buffer.west + ((x + 0.5) * CELL) / mLon;
const cellLat = (y: number) => perimeter.buffer.north - ((y + 0.5) * CELL) / mLat;
{
  const rings: number[][][] = [];
  for (const f of lake.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const p of polys) for (const r of p) if (r.length >= 4) rings.push(r);
  }
  for (let y = 0; y < H; y++) {
    const lat = cellLat(y);
    const xs: number[] = [];
    for (const r of rings) {
      for (let k = 0; k < r.length - 1; k++) {
        const [x1, y1] = r[k], [x2, y2] = r[k + 1];
        if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(((xs[k] - perimeter.buffer.west) * mLon) / CELL - 0.5));
      const b = Math.min(W - 1, Math.floor(((xs[k + 1] - perimeter.buffer.west) * mLon) / CELL - 0.5));
      for (let x = a; x <= b; x++) water[y * W + x] = 1;
    }
  }
}
// I ponti sul lago (es. diga di Melide) lasciano passare i battelli: apri le celle sotto i ponti stradali/ferroviari
{
  let opened = 0;
  for (const G of [road, rail]) {
    for (let e = 0; e < G.g.edgeA.length; e++) {
      if (!(G.g.edgeFlags[e] & EdgeFlag.BRIDGE)) continue;
      const c = G.edgeCoords(e, true);
      for (let i = 1; i < c.length; i++) {
        const steps = Math.ceil(haversine(c[i - 1][0], c[i - 1][1], c[i][0], c[i][1]) / (CELL / 2));
        for (let s = 0; s <= steps; s++) {
          const lon = c[i - 1][0] + ((c[i][0] - c[i - 1][0]) * s) / steps, lat = c[i - 1][1] + ((c[i][1] - c[i - 1][1]) * s) / steps;
          const x = cx(lon), y = cy(lat);
          if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
          // apre solo se la cella ha acqua su due lati opposti (ponte sopra l'acqua)
          const wN = water[(y - 1) * W + x], wS = water[(y + 1) * W + x], wE = water[y * W + x + 1], wW = water[y * W + x - 1];
          if (!water[y * W + x] && ((wN && wS) || (wE && wW))) { water[y * W + x] = 2; opened++; }
        }
      }
    }
  }
  console.log(`Griglia d'acqua ${W}×${H} (${CELL} m), celle d'acqua ${water.reduce((a, b) => a + (b ? 1 : 0), 0)}, aperte sotto i ponti ${opened}`);
}
function nearestWater(lon: number, lat: number): [number, number] | null {
  const x0 = cx(lon), y0 = cy(lat);
  for (let r = 0; r < 12; r++) {
    let best: [number, number] | null = null, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= W || y >= H || !water[y * W + x]) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) return best;
  }
  return null;
}
function lineOfWater(a: [number, number], b: [number, number]): boolean {
  const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2;
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(a[0] + ((b[0] - a[0]) * s) / steps), y = Math.round(a[1] + ((b[1] - a[1]) * s) / steps);
    if (!water[y * W + x]) return false;
  }
  return true;
}
function boatPath(from: { lon: number; lat: number }, to: { lon: number; lat: number }): [number, number][] | null {
  const s = nearestWater(from.lon, from.lat), t = nearestWater(to.lon, to.lat);
  if (!s || !t) return null;
  const start = s[1] * W + s[0], goal = t[1] * W + t[0];
  const dist = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  // costo extra vicino a riva: i battelli stanno al largo
  const shorePenalty = (i: number) => {
    const x = i % W, y = (i / W) | 0;
    let land = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || !water[yy * W + xx]) land++; }
    return 1 + land * 0.08;
  };
  const q = new TinyQueue<[number, number]>([], (a, b) => a[0] - b[0]);
  dist[start] = 0; q.push([0, start]);
  const h = (i: number) => Math.hypot((i % W) - t[0], ((i / W) | 0) - t[1]);
  while (q.length) {
    const [, u] = q.pop()!;
    if (u === goal) break;
    const ux = u % W, uy = (u / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = ux + dx, y = uy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const v = y * W + x;
      if (!water[v]) continue;
      const nd = dist[u] + Math.hypot(dx, dy) * shorePenalty(v);
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; q.push([nd + h(v), v]); }
    }
  }
  if (!Number.isFinite(dist[goal])) return null;
  const cells: [number, number][] = [];
  for (let c = goal; c !== -1; c = prev[c]) cells.push([c % W, (c / W) | 0]);
  cells.reverse();
  // string pulling: tiene i punti necessari a restare sull'acqua
  const simp: [number, number][] = [cells[0]];
  let anchor = 0;
  for (let i = 2; i < cells.length; i++) {
    if (!lineOfWater(cells[anchor], cells[i])) { simp.push(cells[i - 1]); anchor = i - 1; }
  }
  simp.push(cells[cells.length - 1]);
  const coords = simp.map(([x, y]) => [cellLon(x), cellLat(y)] as [number, number]);
  return [[from.lon, from.lat], ...coords, [to.lon, to.lat]];
}

// ------------------------------------------------------------ rotte dei battelli da OpenStreetMap (route=ferry)
// Grafo delle rotte disegnate in OSM: nodi alle coordinate (estremi coincidenti o entro 40 m uniti),
// archi lungo le linee. Una tratta GTFS lo usa se entrambe le fermate sono a meno di 350 m dalla rete
// e il percorso non è molto più lungo di quello calcolato sulla griglia d'acqua.
const ferries: { coords: [number, number][] }[] = JSON.parse(readFileSync('data/build/osm/ferries.json', 'utf8'));
const fNodes: [number, number][] = [];
const fKey = new Map<string, number>();
const fAdj: [number, number][][] = [];
const fNode = (c: [number, number]) => {
  const k = `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
  let i = fKey.get(k);
  if (i == null) { i = fNodes.length; fNodes.push(c); fAdj.push([]); fKey.set(k, i); }
  return i;
};
const fLink = (u: number, v: number) => { if (u === v) return; const d = haversine(fNodes[u][0], fNodes[u][1], fNodes[v][0], fNodes[v][1]); fAdj[u].push([v, d]); fAdj[v].push([u, d]); };
const fEnds: number[] = [];
for (const f of ferries) {
  let prevN = -1;
  for (const c of f.coords) { const n = fNode(c); if (prevN >= 0) fLink(prevN, n); prevN = n; }
  fEnds.push(fNode(f.coords[0]), fNode(f.coords[f.coords.length - 1]));
}
for (let i = 0; i < fEnds.length; i++) for (let j = i + 1; j < fEnds.length; j++) {
  const u = fEnds[i], v = fEnds[j];
  if (u !== v && haversine(fNodes[u][0], fNodes[u][1], fNodes[v][0], fNodes[v][1]) < 40) fLink(u, v);
}
function ferryPath(from: { lon: number; lat: number }, to: { lon: number; lat: number }): { coords: [number, number][]; lengthM: number } | null {
  const near = (p: { lon: number; lat: number }) => fNodes.map((c, i) => [i, haversine(p.lon, p.lat, c[0], c[1])] as [number, number]).filter(([, d]) => d < 350).sort((x, y) => x[1] - y[1]).slice(0, 6);
  const sa = near(from), sb = near(to);
  if (!sa.length || !sb.length) return null;
  const dist = new Float64Array(fNodes.length).fill(Infinity);
  const prev = new Int32Array(fNodes.length).fill(-1);
  const q = new TinyQueue<[number, number]>([], (x, y) => x[0] - y[0]);
  for (const [i, d] of sa) { const c = d * 3; if (c < dist[i]) { dist[i] = c; q.push([c, i]); } } // i raccordi costano di più delle rotte
  const goal = new Map(sb.map(([i, d]) => [i, d * 3]));
  let best = -1, bestCost = Infinity;
  while (q.length) {
    const [du, u] = q.pop()!;
    if (du > dist[u] || du >= bestCost) continue;
    const g = goal.get(u);
    if (g != null && du + g < bestCost) { bestCost = du + g; best = u; }
    for (const [v, w] of fAdj[u]) if (du + w < dist[v]) { dist[v] = du + w; prev[v] = u; q.push([du + w, v]); }
  }
  if (best < 0) return null;
  const path: [number, number][] = [];
  for (let c = best; c !== -1; c = prev[c]) path.push(fNodes[c]);
  path.reverse();
  const coords: [number, number][] = [[from.lon, from.lat], ...path, [to.lon, to.lat]];
  return { coords, lengthM: coords.slice(1).reduce((acc, p, i) => acc + haversine(coords[i][0], coords[i][1], p[0], p[1]), 0) };
}
let ferryUsed = 0, gridUsed = 0;

// ------------------------------------------------------------ geometrie delle tratte
const BUS_SPEED: Record<string, number> = { motorway: 22, trunk: 18, primary: 12, secondary: 11, tertiary: 10, unclassified: 8, residential: 7, living_street: 4, service: 5, busway: 10, road: 7 };
const busCost = (e: EdgeView) => e.lengthM / (BUS_SPEED[e.cls] ?? 7);
const busCostAnyDir = busCost;
const railCost = (e: EdgeView) => e.lengthM / 20;

const roadIgnoringDir = new Graph({ ...road.g, edgeDir: road.g.edgeDir.map(() => 0) });

function routeOn(G: Graph, a: any, b: any, cost: (e: EdgeView) => number, snapM: number, speed: number): { coords: [number, number][]; lengthM: number } | null {
  const na = G.nearest(a.lon, a.lat, 4, snapM).filter((n) => G.usable(n.node, cost));
  const nb = G.nearest(b.lon, b.lat, 4, snapM).filter((n) => G.usable(n.node, cost));
  if (!na.length || !nb.length) return null;
  const direct = haversine(a.lon, a.lat, b.lon, b.lat);
  const p = G.astar(na.map((n) => ({ node: n.node, cost: n.distM / speed })), nb.map((n) => ({ node: n.node, cost: n.distM / speed })), cost, 25, (direct * 6 + 800) / 5);
  if (!p) return null;
  if (p.lengthM > direct * 4 + 1500) return null; // percorso implausibile
  return { coords: [[a.lon, a.lat], ...p.coords, [b.lon, b.lat]], lengthM: p.lengthM };
}

const segIndex = new Map<string, number>();
const segments: { mode: Mode; coords: number[]; lengthM: number; approx: boolean }[] = [];
let approxCount = 0;
function segment(mode: Mode, ai: number, bi: number): number {
  const key = `${mode}:${ai}:${bi}`;
  const k = segIndex.get(key);
  if (k != null) return k;
  const a = raw.stops[ai], b = raw.stops[bi];
  let res: { coords: [number, number][]; lengthM: number } | null = null;
  if (mode === 'bus') res = routeOn(road, a, b, busCost, 80, 8) ?? routeOn(roadIgnoringDir, a, b, busCostAnyDir, 120, 8);
  else if (mode === 'train' || mode === 'funicular') res = routeOn(rail, a, b, railCost, 250, 10);
  else if (mode === 'boat') {
    const c = boatPath(a, b);
    const grid = c ? { coords: c, lengthM: c.slice(1).reduce((s, p, i) => s + haversine(c[i][0], c[i][1], p[0], p[1]), 0) } : null;
    const fp = ferryPath(a, b);
    if (fp && (!grid || fp.lengthM <= grid.lengthM * 1.35)) { res = fp; ferryUsed++; } else { res = grid; if (grid) gridUsed++; }
  }
  let approx = false;
  if (!res) {
    approx = true; approxCount++;
    res = { coords: [[a.lon, a.lat], [b.lon, b.lat]], lengthM: haversine(a.lon, a.lat, b.lon, b.lat) };
  }
  const flat: number[] = [];
  for (const [lon, lat] of res.coords) flat.push(Math.round(lon * 1e6), Math.round(lat * 1e6));
  segments.push({ mode, coords: flat, lengthM: Math.round(res.lengthM), approx });
  segIndex.set(key, segments.length - 1);
  return segments.length - 1;
}

// ------------------------------------------------------------ pattern e corse
const patterns: { route: string; mode: Mode; stops: number[]; segs: number[] }[] = [];
const patternIndex = new Map<string, number>();
const trips: any[] = [];
let t0 = Date.now();
for (const t of raw.trips) {
  const r = routeById.get(t.route) as any;
  const mode = modeOf(r.type);
  const key = `${t.route}|${t.stops.join(',')}`;
  let p = patternIndex.get(key);
  if (p == null) {
    const segs: number[] = [];
    for (let i = 0; i + 1 < t.stops.length; i++) segs.push(segment(mode, t.stops[i], t.stops[i + 1]));
    patterns.push({ route: t.route, mode, stops: t.stops, segs });
    p = patterns.length - 1;
    patternIndex.set(key, p);
  }
  const times: number[] = [];
  for (let i = 0; i < t.stops.length; i++) times.push(t.arr[i], t.dep[i]);
  trips.push({ p, s: t.service, h: t.headsign, n: t.shortName, id: t.id, t: times, pk: t.pickup, dr: t.dropoff, f: t.freq });
}
console.log(`Pattern ${patterns.length}, segmenti ${segments.length} (approssimati ${approxCount}), corse ${trips.length}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`Battelli: ${ferryUsed} tratte sulle rotte OSM (${fNodes.length} nodi da ${ferries.length} linee), ${gridUsed} sulla griglia d'acqua`);
const approxByMode: Record<string, number> = {};
for (const s of segments) if (s.approx) approxByMode[s.mode] = (approxByMode[s.mode] ?? 0) + 1;
console.log('Segmenti approssimati per modo:', approxByMode);

const out = {
  source: raw.source,
  builtAt: new Date().toISOString(),
  agencies: raw.agencies,
  routes: raw.routes.map((r: any) => ({ ...r, mode: modeOf(r.type) })),
  stops,
  services: raw.services,
  patterns,
  trips,
  segments,
  footpaths,
  footpathsSF,
  transfers: raw.transfers,
};
writeFileSync('data/build/transit.json', JSON.stringify(out));
console.log('Scritto data/build/transit.json');
