import { readFileSync } from 'node:fs';
import { Graph } from '../../src/server/routing/graph.ts';
const g = new Graph(JSON.parse(readFileSync('data/build/graph-walk.json', 'utf8')));
const t = JSON.parse(readFileSync('data/build/transit.json', 'utf8'));
// componenti connesse
const comp = new Int32Array(g.n).fill(-1);
const adj: number[][] = Array.from({ length: g.n }, () => []);
for (let e = 0; e < g.g.edgeA.length; e++) { adj[g.g.edgeA[e]].push(g.g.edgeB[e]); adj[g.g.edgeB[e]].push(g.g.edgeA[e]); }
const sizes: number[] = [];
for (let i = 0; i < g.n; i++) {
  if (comp[i] >= 0) continue;
  const c = sizes.length; let size = 0; const st = [i]; comp[i] = c;
  while (st.length) { const u = st.pop()!; size++; for (const v of adj[u]) if (comp[v] < 0) { comp[v] = c; st.push(v); } }
  sizes.push(size);
}
const order = sizes.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
console.log('componenti', sizes.length, 'maggiori', order.slice(0, 8).map(([s]) => s));
const main = order[0][1];
let off = 0;
for (const s of t.stops) { if (s.walkNode >= 0 && comp[s.walkNode] !== main) { off++; if (off < 40) console.log('fermata fuori componente principale:', s.name, sizes[comp[s.walkNode]]); } }
console.log('fermate fuori componente principale', off);
