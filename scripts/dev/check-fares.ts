// Controllo: costi delle funicolari in un programma reale con salita e discesa.
import { DataStore } from '../../src/server/data.ts';
import { planAlternatives } from '../../src/server/planner/index.ts';
import { GroupRequest } from '../../src/shared/types.ts';
const data = new DataStore(); data.load();
const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short' };
const people = [{ id: 'a', name: 'A', kind: 'adult', avatar: av, interests: [] }, { id: 'b', name: 'B', kind: 'adult', avatar: av, interests: [] }, { id: 'k', name: 'K', kind: 'child', ageBand: '6-11', avatar: av, interests: [] }];
for (const must of ['san-salvatore', 'monte-bre']) {
  const r = await planAlternatives(GroupRequest.parse({ date: '2026-10-03', start: { kind: 'stop', label: 'Stazione FFS di Lugano', lon: 8.946849, lat: 46.005499 }, end: { mode: 'same' }, occasion: 'family', budget: { per: 'person', strict: false }, people, startTime: '10:00', endTime: '17:00', moods: ['views'], mustSee: [must] }), { data });
  if (r.status !== 'ok') { console.log(must, r.status); continue; }
  const p = r.alternatives[0];
  console.log(`\n${must}: ${p.stops.map((s) => s.name).join(' → ')}`);
  p.trips.forEach((t, i) => {
    for (const l of t.legs) if (l.mode === 'funicular') console.log(`   viaggio ${i}: ${l.from.label} → ${l.to.label} ${l.departure.slice(11, 16)}`);
    for (const c of t.cost) if (/Funicolare/.test(c.label)) console.log(`   viaggio ${i} costo ${c.label}: CHF ${c.min} [${c.evidenceStatus}]`);
  });
  console.log('   totale gruppo', p.totals.cost.min, '-', p.totals.cost.max);
}
