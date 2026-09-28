/**
 * Piano B per meteo (§12): alternative al coperto per le tappe all'aperto,
 * aperte nella stessa fascia secondo il catalogo, raggiungibili a piedi,
 * compatibili con le esigenze del gruppo; niente orari o costi inventati.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { DateTime } from 'luxon';
import { DataStore } from '../src/server/data.ts';
import { planAlternatives } from '../src/server/planner/index.ts';
import { planB, weatherExposed } from '../src/server/planner/planb.ts';
import { checkVisit } from '../src/shared/calendar.ts';
import { GroupRequest, TZ, type Plan } from '../src/shared/types.ts';

const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short', tone: '#f0cfa8' };
const adults = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `Adulto ${i + 1}`, kind: 'adult', avatar: av, interests: [] }));
const station = { kind: 'stop', label: 'Stazione FFS di Lugano', lon: 8.946849, lat: 46.005499 };
let data: DataStore;
beforeAll(() => { data = new DataStore(); data.load(); });

async function plans(p: Record<string, unknown>): Promise<Plan[]> {
  const r = await planAlternatives(GroupRequest.parse({ date: '2026-10-03', start: station, end: { mode: 'same' }, occasion: 'leisure', budget: { per: 'person', strict: false }, people: adults(2), startTime: '10:00', endTime: '18:00', ...p }), { data });
  if (r.status !== 'ok') throw new Error(r.status);
  return r.alternatives;
}

describe('Piano B se piove', () => {
  it('ogni tappa all\'aperto ha una voce; le alternative sono al coperto, fuori dal programma, aperte e vicine', async () => {
    const alts = await plans({ moods: ['nature', 'views'], mustSee: ['parco-ciani'] });
    let checked = 0;
    for (const p of alts) {
      const b = planB(p, data);
      const exposed = p.stops.filter((s) => weatherExposed(s, data.place(s.placeId)));
      expect(b.items.map((i) => i.stopId)).toEqual(exposed.map((s) => s.id));
      for (const it of b.items) {
        const stop = p.stops.find((s) => s.id === it.stopId)!;
        if (!it.options.length) expect(it.none).toBeTruthy();
        for (const o of it.options) {
          const q = data.place(o.placeId)!;
          expect(q.suitability.indoor).toBe(true);
          expect(p.stops.some((s) => s.placeId === o.placeId)).toBe(false);
          expect(o.walkMin).toBeLessThanOrEqual(25);
          const sched = q.schedules.find((x) => x.kind === 'public');
          if (o.hours === 'open') {
            expect(checkVisit(sched!, DateTime.fromISO(stop.start, { zone: TZ }), Math.min(stop.stayMin, q.visit.typical)).ok).toBe(true);
          } else {
            expect(sched).toBeUndefined();
          }
          // costo sconosciuto resta sconosciuto, mai zero
          if (o.costUnknown) { expect(o.costMin).toBeNull(); expect(o.costMax).toBeNull(); }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('in montagna le alternative sono cercate in basso e il motivo è spiegato', async () => {
    const alts = await plans({ moods: ['views'], mustSee: ['monte-bre'], startTime: '09:30' });
    const withMountain = alts.map((p) => planB(p, data)).flatMap((b) => b.items).filter((i) => /montagna/.test(i.reason));
    expect(withMountain.length).toBeGreaterThan(0);
    for (const it of withMountain) if (it.options.length) expect(it.near).toMatch(/vicino/);
  });

  it('con il passeggino non propone luoghi dichiarati non adatti', async () => {
    const alts = await plans({ moods: ['nature'], mobility: { stroller: true, wheelchair: false, avoidStairs: true, frequentBreaks: false } });
    for (const p of alts) for (const it of planB(p, data).items) for (const o of it.options) expect(data.place(o.placeId)!.accessibility.stroller).not.toBe('no');
  });
});
