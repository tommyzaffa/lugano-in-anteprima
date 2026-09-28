import { DataStore } from '../../src/server/data.ts';
import { planAlternatives } from '../../src/server/planner/index.ts';
import { GroupRequest } from '../../src/shared/types.ts';

const data = new DataStore();
data.load();
console.log('dati caricati in', data.loadMs, 'ms');
const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short' };
const mk = (n: number, kind = 'adult') => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Persona ${i + 1}`, kind, avatar: av, interests: [] }));
const scenario = process.argv[2] ?? 'A';
const base = { date: process.env.DATE ?? '2026-10-02', start: { kind: 'stop', label: 'Stazione FFS di Lugano', lon: 8.946849, lat: 46.005499 }, end: { mode: 'same' }, occasion: 'friends', budget: { per: 'person', strict: false } };
const reqs: Record<string, any> = {
  A: { ...base, people: mk(4), startTime: '18:30', endTime: '23:59', moods: ['chill', 'lively'], avoid: ['nightclub'], budget: { amount: 60, per: 'person', strict: false } },
  B: { ...base, people: mk(2), date: '2026-10-03', startTime: '09:30', endTime: '18:00', occasion: 'date', moods: ['views', 'cultural'], budget: { amount: 120, per: 'person', strict: false } },
  C: { ...base, people: [...mk(2), { id: 'k1', name: 'Bimbo', kind: 'child', ageBand: '0-5', avatar: av, interests: [] }, { id: 'k2', name: 'Bimba', kind: 'child', ageBand: '6-11', avatar: av, interests: [] }], startTime: '10:00', endTime: '17:00', occasion: 'family', moods: ['nature'], mobility: { stroller: true, wheelchair: false, avoidStairs: true, frequentBreaks: true } },
  D: { ...base, people: mk(2), startTime: '08:30', endTime: '19:00', occasion: 'leisure', moods: ['adventure', 'views', 'nature'], mustSee: ['monte-boglia'], pace: 'intense' },
  J: { ...base, people: mk(3), startTime: '19:00', endTime: '22:00', moods: ['food'], budget: { amount: 5, per: 'person', strict: true }, mustSee: ['seven-lugano'] },
  K12: { ...base, people: mk(12), startTime: '14:00', endTime: '19:00', moods: ['cultural', 'views'] },
};
const req = GroupRequest.parse(reqs[scenario]);
const t0 = Date.now();
const res = await planAlternatives(req, { data, progress: (s) => console.log(`  … ${s} (${Date.now() - t0} ms)`) });
console.log('stato', res.status, Date.now() - t0, 'ms');
if (res.status === 'ok') {
  console.log('stats', res.stats, res.notices);
  for (const p of res.alternatives) {
    console.log(`\n== ${p.title} [${p.feasibility}] ${p.summary}`);
    console.log('   perché:', p.whyThis.join(' | '));
    console.log('   compromessi:', p.tradeoffs.join(' | '));
    p.stops.forEach((s, i) => {
      const t = p.trips[i];
      console.log(`   → ${t.departure.slice(11, 16)}-${t.arrival.slice(11, 16)} ${t.summary.label} (${t.summary.durationMin} min, ${t.summary.walkM} m)`);
      console.log(`   ● ${s.start.slice(11, 16)}-${s.end.slice(11, 16)} ${s.name} [${s.category}] costo ${s.cost.map((c) => `${c.min ?? '?'}-${c.max ?? '?'}`).join('+')}`);
    });
    const r = p.trips[p.stops.length];
    if (r) console.log(`   ⌂ ${r.departure.slice(11, 16)}-${r.arrival.slice(11, 16)} ${r.summary.label}`);
    console.log('   controlli non ok:', p.checks.filter((c) => c.status !== 'ok').map((c) => `${c.status}:${c.label}`).join('; '));
    console.log('   decisione:', p.decisions.map((d) => `${d.prompt} → ${d.options.map((o) => o.label).join(' / ')}`).join(''));
  }
} else console.log(JSON.stringify(res, null, 1).slice(0, 3000));
