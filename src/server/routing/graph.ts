/**
 * Grafo di percorrenza in memoria (CSR) con A* e Dijkstra limitato.
 * Le coordinate restano in WGS84; le distanze sono metri geodetici (haversine).
 */
import KDBush from 'kdbush';
import { around } from 'geokdbush';
import TinyQueue from 'tinyqueue';
import type { SerializedGraph } from '../../shared/graph-format.ts';

export function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371008.8;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface EdgeView {
  index: number;
  forward: boolean; // percorso da A a B
  from: number;
  to: number;
  lengthM: number;
  upM: number;   // salita nel verso di percorrenza
  downM: number; // discesa nel verso di percorrenza
  cls: string;
  flags: number;
  sac: number;
  name: string | null;
}

/** Funzione di costo: secondi per percorrere l'arco, oppure Infinity se vietato. */
export type CostFn = (e: EdgeView) => number;

export interface PathResult {
  nodes: number[];
  edges: { index: number; forward: boolean }[];
  cost: number;
  lengthM: number;
  upM: number;
  downM: number;
  coords: [number, number][];
}

export class Graph {
  readonly g: SerializedGraph;
  readonly n: number;
  readonly lon: Float64Array;
  readonly lat: Float64Array;
  readonly ele: Float32Array;
  private adjStart: Int32Array;
  private adjEdge: Int32Array; // indice arco
  private adjDir: Int8Array;   // 1 = A->B, 0 = B->A
  private kd: KDBush;

  constructor(g: SerializedGraph) {
    this.g = g;
    this.n = g.nodeLon.length;
    this.lon = new Float64Array(this.n);
    this.lat = new Float64Array(this.n);
    this.ele = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.lon[i] = g.nodeLon[i] / 1e6;
      this.lat[i] = g.nodeLat[i] / 1e6;
      this.ele[i] = g.nodeEle[i] / 10;
    }
    const deg = new Int32Array(this.n);
    const m = g.edgeA.length;
    for (let e = 0; e < m; e++) {
      const dir = g.edgeDir[e];
      if (dir !== 2) deg[g.edgeA[e]]++;
      if (dir !== 1) deg[g.edgeB[e]]++;
    }
    this.adjStart = new Int32Array(this.n + 1);
    for (let i = 0; i < this.n; i++) this.adjStart[i + 1] = this.adjStart[i] + deg[i];
    const fill = this.adjStart.slice(0, this.n);
    this.adjEdge = new Int32Array(this.adjStart[this.n]);
    this.adjDir = new Int8Array(this.adjStart[this.n]);
    for (let e = 0; e < m; e++) {
      const dir = g.edgeDir[e];
      if (dir !== 2) { const k = fill[g.edgeA[e]]++; this.adjEdge[k] = e; this.adjDir[k] = 1; }
      if (dir !== 1) { const k = fill[g.edgeB[e]]++; this.adjEdge[k] = e; this.adjDir[k] = 0; }
    }
    this.kd = new KDBush(this.n);
    for (let i = 0; i < this.n; i++) this.kd.add(this.lon[i], this.lat[i]);
    this.kd.finish();
  }

  edgeView(e: number, forward: boolean): EdgeView {
    const g = this.g;
    const up = g.edgeUp[e] / 10, down = g.edgeDown[e] / 10;
    return {
      index: e, forward,
      from: forward ? g.edgeA[e] : g.edgeB[e],
      to: forward ? g.edgeB[e] : g.edgeA[e],
      lengthM: g.edgeLen[e] / 10,
      upM: forward ? up : down,
      downM: forward ? down : up,
      cls: g.classes[g.edgeCls[e]],
      flags: g.edgeFlags[e],
      sac: g.edgeSac[e],
      name: g.edgeName[e] >= 0 ? g.names[g.edgeName[e]] : null,
    };
  }

  /** Coordinate dell'arco nel verso di percorrenza (estremi inclusi). */
  edgeCoords(e: number, forward: boolean): [number, number][] {
    const g = this.g;
    const a = g.edgeA[e], b = g.edgeB[e];
    const out: [number, number][] = [[this.lon[a], this.lat[a]]];
    for (let k = g.edgeGeomOff[e]; k < g.edgeGeomOff[e + 1]; k++) out.push([g.geomLon[k] / 1e6, g.geomLat[k] / 1e6]);
    out.push([this.lon[b], this.lat[b]]);
    return forward ? out : out.reverse();
  }

  /** Nodi più vicini a un punto (entro maxM metri), ordinati per distanza. */
  nearest(lon: number, lat: number, count = 5, maxM = 300, filter?: (node: number) => boolean): { node: number; distM: number }[] {
    const ids = around(this.kd, lon, lat, count, maxM / 1000, filter) as number[];
    return ids.map((i) => ({ node: i, distM: haversine(lon, lat, this.lon[i], this.lat[i]) }));
  }

  /** Il nodo ha almeno un arco percorribile secondo la funzione di costo? */
  usable(node: number, cost: CostFn): boolean {
    for (let k = this.adjStart[node]; k < this.adjStart[node + 1]; k++) {
      if (Number.isFinite(cost(this.edgeView(this.adjEdge[k], this.adjDir[k] === 1)))) return true;
    }
    return false;
  }

  /**
   * A* multi-sorgente/multi-destinazione. Le sorgenti e destinazioni portano un costo
   * di accesso (secondi) per l'avvicinamento dal punto reale al nodo.
   * `heuristicSpeed`: velocità massima plausibile (m/s) per un'euristica ammissibile.
   */
  astar(sources: { node: number; cost: number }[], targets: { node: number; cost: number }[], cost: CostFn, heuristicSpeed: number, maxCost = Infinity): PathResult | null {
    if (!sources.length || !targets.length) return null;
    const targetCost = new Map<number, number>();
    for (const t of targets) targetCost.set(t.node, Math.min(targetCost.get(t.node) ?? Infinity, t.cost));
    const tLon = targets.reduce((s, t) => s + this.lon[t.node], 0) / targets.length;
    const tLat = targets.reduce((s, t) => s + this.lat[t.node], 0) / targets.length;
    const tRadius = Math.max(...targets.map((t) => haversine(tLon, tLat, this.lon[t.node], this.lat[t.node])));
    const minTargetCost = Math.min(...targets.map((t) => t.cost));
    const h = (i: number) => Math.max(0, haversine(this.lon[i], this.lat[i], tLon, tLat) - tRadius) / heuristicSpeed + minTargetCost;

    const dist = new Map<number, number>();
    const prevEdge = new Map<number, number>(); // node -> edge index * 2 + forward
    const queue = new TinyQueue<[number, number]>([], (a, b) => a[0] - b[0]);
    for (const s of sources) {
      if ((dist.get(s.node) ?? Infinity) > s.cost) {
        dist.set(s.node, s.cost);
        queue.push([s.cost + h(s.node), s.node]);
      }
    }
    let best = Infinity, bestNode = -1;
    const closed = new Set<number>();
    while (queue.length) {
      const [f, u] = queue.pop()!;
      if (f >= best) break;
      if (closed.has(u)) continue;
      closed.add(u);
      const du = dist.get(u)!;
      if (du > maxCost) continue;
      const tc = targetCost.get(u);
      if (tc != null && du + tc < best) { best = du + tc; bestNode = u; }
      for (let k = this.adjStart[u]; k < this.adjStart[u + 1]; k++) {
        const e = this.adjEdge[k];
        const fwd = this.adjDir[k] === 1;
        const ev = this.edgeView(e, fwd);
        const c = cost(ev);
        if (!Number.isFinite(c)) continue;
        const nd = du + c;
        const v = ev.to;
        if (nd < (dist.get(v) ?? Infinity)) {
          dist.set(v, nd);
          prevEdge.set(v, e * 2 + (fwd ? 1 : 0));
          queue.push([nd + h(v), v]);
        }
      }
    }
    if (bestNode < 0) return null;
    return this.reconstruct(bestNode, prevEdge, best);
  }

  private reconstruct(end: number, prevEdge: Map<number, number>, cost: number): PathResult {
    const edges: { index: number; forward: boolean }[] = [];
    const nodes = [end];
    let cur = end;
    const seen = new Set<number>();
    while (prevEdge.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      const code = prevEdge.get(cur)!;
      const e = code >> 1, fwd = (code & 1) === 1;
      edges.push({ index: e, forward: fwd });
      cur = fwd ? this.g.edgeA[e] : this.g.edgeB[e];
      nodes.push(cur);
    }
    edges.reverse(); nodes.reverse();
    let lengthM = 0, upM = 0, downM = 0;
    const coords: [number, number][] = [[this.lon[nodes[0]], this.lat[nodes[0]]]];
    for (const { index, forward } of edges) {
      const v = this.edgeView(index, forward);
      lengthM += v.lengthM; upM += v.upM; downM += v.downM;
      const c = this.edgeCoords(index, forward);
      for (let i = 1; i < c.length; i++) coords.push(c[i]);
    }
    return { nodes, edges, cost, lengthM, upM, downM, coords };
  }

  /** Dijkstra da più sorgenti fino a maxCost: restituisce costo per nodo raggiunto. */
  dijkstra(sources: { node: number; cost: number }[], cost: CostFn, maxCost: number): Map<number, number> {
    const dist = new Map<number, number>();
    const queue = new TinyQueue<[number, number]>([], (a, b) => a[0] - b[0]);
    for (const s of sources) if ((dist.get(s.node) ?? Infinity) > s.cost) { dist.set(s.node, s.cost); queue.push([s.cost, s.node]); }
    const closed = new Set<number>();
    while (queue.length) {
      const [du, u] = queue.pop()!;
      if (closed.has(u)) continue;
      closed.add(u);
      if (du > maxCost) break;
      for (let k = this.adjStart[u]; k < this.adjStart[u + 1]; k++) {
        const ev = this.edgeView(this.adjEdge[k], this.adjDir[k] === 1);
        const c = cost(ev);
        if (!Number.isFinite(c)) continue;
        const nd = du + c;
        if (nd <= maxCost && nd < (dist.get(ev.to) ?? Infinity)) { dist.set(ev.to, nd); queue.push([nd, ev.to]); }
      }
    }
    return dist;
  }
}
