// Prova del Piano B meteo su uno scenario: npx tsx scripts/dev/try-planb.ts B
import { DataStore } from '../../src/server/data.ts';
import { planAlternatives } from '../../src/server/planner/index.ts';
import { planB } from '../../src/server/planner/planb.ts';
import { GroupRequest } from '../../src/shared/types.ts';

const data = new DataStore();
data.load();
const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short' };
const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Persona ${i + 1}`, kind: 'adult', avatar: av, interests: [] }));
const base = { date: '2026-10-03', start: { kind: 'stop', label: 'Stazione FFS di Lugano', lon: 8.946849, lat: 46.005499 }, end: { mode: 'same' }, occasion: 'date', budget: { per: 'person', strict: false } };
const reqs: Record<string, any> = {
  B: { ...base, people: mk(2), startTime: '09:30', endTime: '18:00', moods: ['views', 'cultural'] },
  C: { ...base, people: [...mk(2), { id: 'k1', name: 'Bimbo', kind: 'child', ageBand: '0-5', avatar: av, interests: [] }], startTime: '10:00', endTime: '17:00', occasion: 'family', moods: ['nature'], mobility: { stroller: true, wheelchair: false, avoidStairs: true, frequentBreaks: true } },
  N: { ...base, people: mk(3), startTime: '14:00', endTime: '22:00', moods: ['nature', 'views', 'food'] },
};
const res = await planAlternatives(GroupRequest.parse(reqs[process.argv[2] ?? 'B']), { data });
if (res.status !== 'ok') { console.log(res.status); process.exit(0); }
for (const p of res.alternatives) {
  const t0 = Date.now();
  const b = planB(p, data);
  console.log(`\n== ${p.title} (${Date.now() - t0} ms) — tappe: ${p.stops.map((s) => s.name).join(' → ')}`);
  for (const it of b.items) {
    console.log(`  ☂ ${it.stopName} ${it.start.slice(11, 16)} ${it.near ?? ""}: ${it.options.map((o) => `${o.name} [${o.walkMin}′, ${o.hours}, ${o.costUnknown ? '?' : `${o.costMin}-${o.costMax}`}]`).join(' | ') || it.none}`);
  }
}
