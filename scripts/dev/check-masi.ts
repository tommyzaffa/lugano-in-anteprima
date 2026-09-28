import { DataStore } from '../../src/server/data.ts';
import { planAlternatives } from '../../src/server/planner/index.ts';
import { GroupRequest } from '../../src/shared/types.ts';
const data = new DataStore(); data.load();
const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short' };
const people = [{ id: 'a', name: 'A', kind: 'adult', avatar: av, interests: [] }, { id: 'b', name: 'B', kind: 'adult', avatar: av, interests: [] }];
for (const date of ['2026-10-02', '2026-10-20']) {
  const r: any = await planAlternatives(GroupRequest.parse({ date, start: { kind: 'stop', label: 'Stazione FFS di Lugano', lon: 8.946849, lat: 46.005499 }, end: { mode: 'same' }, occasion: 'friends', budget: { amount: 500, per: 'person', strict: false }, people, startTime: '10:00', endTime: '18:00', moods: ['cultural'], mustSee: ['masi-palazzo-reali'] }), { data });
  console.log(date, r.status, r.status === 'infeasible' ? JSON.stringify(r.infeasible.reasons).slice(0, 400) : r.alternatives[0].stops.map((s: any) => s.name).join(' → '));
}
