// Swissminiatur da Lugano: con la sedia a rotelle niente treno fino a Melide (stazione non accessibile).
import { DataStore } from '../../src/server/data.ts';
import { planAlternatives } from '../../src/server/planner/index.ts';
import { GroupRequest } from '../../src/shared/types.ts';
const data = new DataStore(); data.load();
console.log('fermate bloccate:', [...data.router.wheelchairBlocked].map((i) => data.transit.d.stops[i].name));
const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short' };
for (const wheelchair of [false, true]) {
  const r: any = await planAlternatives(GroupRequest.parse({ date: '2026-10-03', start: { kind: 'stop', label: 'Stazione FFS di Lugano', lon: 8.946849, lat: 46.005499 }, end: { mode: 'same' }, occasion: 'family', budget: { per: 'person', strict: false }, people: [{ id: 'a', name: 'A', kind: 'adult', avatar: av, interests: [] }, { id: 'b', name: 'B', kind: 'adult', avatar: av, interests: [] }], startTime: '10:00', endTime: '16:00', moods: ['cultural'], mustSee: ['swissminiatur'], mobility: { stroller: false, wheelchair, avoidStairs: wheelchair, frequentBreaks: false } }), { data });
  if (r.status !== 'ok') { console.log(wheelchair, r.status, JSON.stringify(r.infeasible?.reasons)); continue; }
  const p = r.alternatives[0];
  const i = p.stops.findIndex((s: any) => s.placeId === 'swissminiatur');
  console.log(wheelchair ? 'sedia a rotelle:' : 'standard:', p.trips[i].legs.filter((l: any) => l.transit).map((l: any) => `${l.mode} ${l.from.label}→${l.to.label}`).join(' | ') || 'a piedi');
}
