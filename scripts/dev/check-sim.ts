import { DataStore } from '../../src/server/data.ts';
import { planAlternatives } from '../../src/server/planner/index.ts';
import { GroupRequest } from '../../src/shared/types.ts';
import { buildTimeline, stateAt } from '../../src/shared/simulation.ts';
const data = new DataStore(); data.load();
const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short' };
const req = GroupRequest.parse({ people: [0, 1].map((i) => ({ id: 'p' + i, name: 'P' + i, kind: 'adult', avatar: av, interests: [] })), date: '2026-09-28', startTime: '09:30', endTime: '18:00', start: { kind: 'stop', label: 'Stazione', lon: 8.946849, lat: 46.005499 }, end: { mode: 'same' }, occasion: 'date', moods: ['views', 'cultural'], budget: { amount: 120, per: 'person', strict: false } });
const r = await planAlternatives(req, { data });
if (r.status !== 'ok') throw new Error(r.status);
const p = r.alternatives[0];
const tl = buildTimeline(p);
let prev = 0, unsorted = 0;
for (const s of tl.segments) { if (s.start < prev) unsorted++; prev = s.start; }
console.log('segmenti', tl.segments.length, 'non ordinati', unsorted);
for (const d of p.decisions) {
  const st = stateAt(tl, Date.parse(d.at));
  const stop = p.stops[d.afterStop];
  console.log('decisione', d.at, 'dopo', stop.name, 'pos', st.position, 'tappa', [stop.lon, stop.lat], 'scene', st.scene, st.label);
}
for (const s of tl.segments.slice(0, 40)) console.log(s.kind.padEnd(8), new Date(s.start).toISOString().slice(11, 16), new Date(s.end).toISOString().slice(11, 16), s.label.slice(0, 50), s.at ?? (s.coords ? `${s.coords[0]}→${s.coords[s.coords.length - 1]}` : ''));
