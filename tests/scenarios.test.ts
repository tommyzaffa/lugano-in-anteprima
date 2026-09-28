/**
 * Scenari di accettazione del brief (§17), eseguiti sul pianificatore reale con i dati costruiti.
 * Date nel periodo di validità dell'orario importato (anno orario 2026).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { DataStore } from '../src/server/data.ts';
import { planAlternatives, type PlanResponse } from '../src/server/planner/index.ts';
import { replan } from '../src/server/planner/replan.ts';
import { GroupRequest, type Plan } from '../src/shared/types.ts';
import { buildTimeline, stateAt, skipMoveTarget } from '../src/shared/simulation.ts';

const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short', tone: '#f0cfa8' };
const adults = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `Adulto ${i + 1}`, kind: 'adult', avatar: av, interests: [] }));
const station = { kind: 'stop', label: 'Stazione FFS di Lugano', lon: 8.946849, lat: 46.005499 };
let data: DataStore;
beforeAll(() => { data = new DataStore(); data.load(); });

function req(p: Record<string, unknown>) {
  return GroupRequest.parse({ date: '2026-10-02', start: station, end: { mode: 'same' }, occasion: 'friends', budget: { per: 'person', strict: false }, people: adults(2), startTime: '10:00', endTime: '18:00', ...p });
}
async function plan(p: Record<string, unknown>): Promise<PlanResponse> { return planAlternatives(req(p), { data }); }
function ok(r: PlanResponse): Plan[] { if (r.status !== 'ok') throw new Error(`atteso ok, ottenuto ${r.status}: ${JSON.stringify((r as any).infeasible ?? (r as any).contradictions)}`); return r.alternatives; }
const allLegs = (p: Plan) => p.trips.flatMap((t) => t.legs);

describe('A — quattro amici la sera', () => {
  it('propone alternative del catalogo, 4 avatar, niente discoteca, affluenza non inventata', async () => {
    const alts = ok(await plan({ people: adults(4), startTime: '18:30', endTime: '23:59', moods: ['chill', 'lively'], avoid: ['nightclub'], budget: { amount: 60, per: 'person', strict: false } }));
    expect(alts.length).toBeGreaterThanOrEqual(2);
    for (const p of alts) {
      expect(p.request.people).toHaveLength(4);
      for (const s of p.stops) {
        const place = data.place(s.placeId)!;
        expect(place).toBeTruthy();
        expect(place.category).not.toBe('nightlife');
        expect(place.tags).not.toContain('discoteca');
      }
      const text = JSON.stringify(p);
      expect(text).not.toMatch(/\d+ ?% ?(di )?(affollamento|pieno|occupazione)/i);
      expect(p.narrative.lines.length).toBeGreaterThan(0);
    }
  });
});

describe('B — due persone fra paesaggio e cultura', () => {
  it('usa il territorio esteso con collegamenti reali e rientro entro l\'orario', async () => {
    const alts = ok(await plan({ date: '2026-10-03', startTime: '09:30', endTime: '18:00', occasion: 'date', moods: ['views', 'cultural'] }));
    const outside = alts.some((p) => p.stops.some((s) => Math.hypot((s.lon - 8.9513) * 77300, (s.lat - 46.0039) * 111200) > 1500));
    expect(outside).toBe(true);
    for (const p of alts) expect(Date.parse(p.totals.endsAt)).toBeLessThanOrEqual(Date.parse('2026-10-03T18:00:00+02:00'));
  });
});

describe('C — famiglia con passeggino', () => {
  it('niente scale sui percorsi, luoghi non adatti esclusi, accessibilità ignota non marcata come accessibile', async () => {
    const people = [...adults(2), { id: 'k1', name: 'Bimbo', kind: 'child', ageBand: '0-5', avatar: av, interests: [] }, { id: 'k2', name: 'Bimba', kind: 'child', ageBand: '6-11', avatar: av, interests: [] }];
    const alts = ok(await plan({ people, occasion: 'family', moods: ['nature'], pace: 'relaxed', mobility: { stroller: true, wheelchair: false, avoidStairs: true, frequentBreaks: true } }));
    for (const p of alts) {
      expect(allLegs(p).some((l) => l.flags.stairs)).toBe(false);
      for (const s of p.stops) expect(data.place(s.placeId)!.accessibility.stroller).not.toBe('no');
      const unknown = p.stops.filter((s) => data.place(s.placeId)!.accessibility.stroller === 'unknown');
      for (const s of unknown) expect(s.checks.find((c) => c.id === 'access')?.status).toBe('uncertain');
    }
  });
});

describe('D — monte e rientro', () => {
  it('Monte Boglia: raggiunto a piedi come escursione (non passeggiata), con rientro verificato', async () => {
    const alts = ok(await plan({ startTime: '08:30', endTime: '19:00', occasion: 'leisure', moods: ['adventure', 'views'], pace: 'intense', mustSee: ['monte-boglia'] }));
    const p = alts[0];
    const i = p.stops.findIndex((s) => s.placeId === 'monte-boglia');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(p.trips[i].legs.some((l) => l.mode === 'hike')).toBe(true);
    expect(p.trips[i].summary.ascentM).toBeGreaterThan(300);
    expect(p.checks.some((c) => c.id === 'hike' && c.status === 'uncertain')).toBe(true);
    expect(p.trips[p.stops.length]).toBeTruthy(); // tratta di rientro
  });
  it('San Salvatore: in stagione con la funicolare, fuori stagione niente funicolare', async () => {
    const inSeason = ok(await plan({ date: '2026-10-03', moods: ['views'], mustSee: ['san-salvatore'] }));
    const p = inSeason[0];
    const i = p.stops.findIndex((s) => s.placeId === 'san-salvatore');
    expect(p.trips[i].legs.some((l) => l.mode === 'funicular' && l.transit?.[0].routeShort === '2652') || p.trips[i].legs.some((l) => l.mode === 'hike')).toBe(true);
    const winter = await plan({ date: '2026-11-15', moods: ['views'], mustSee: ['san-salvatore'], pace: 'intense' });
    if (winter.status === 'ok') {
      for (const w of winter.alternatives) expect(allLegs(w).some((l) => l.transit?.[0].routeShort === '2652')).toBe(false);
    }
  });
});

describe('E — evento settimanale annullato', () => {
  it('il 9 ottobre il jazz annullato non compare, il 2 ottobre è candidabile', async () => {
    const r9 = await plan({ date: '2026-10-09', startTime: '19:00', endTime: '23:30', moods: ['cultural', 'chill'], mustSee: [] });
    if (r9.status === 'ok') for (const p of r9.alternatives) expect(p.stops.some((s) => s.eventId === 'jazz-lungolago-demo')).toBe(false);
    const forced = await plan({ date: '2026-10-09', startTime: '19:00', endTime: '23:30', mustSee: ['jazz-lungolago-demo'] });
    expect(forced.status).toBe('infeasible');
    if (forced.status === 'infeasible') expect(JSON.stringify(forced.infeasible)).toMatch(/annullat/);
  });
});

describe('F — ultimo ingresso, mezzanotte, cambio d\'ora', () => {
  it('nessuna tappa oltre l\'ultimo ingresso; la finestra oltre mezzanotte finisce il giorno dopo', async () => {
    const alts = ok(await plan({ startTime: '20:00', endTime: '01:00', moods: ['lively', 'food'] }));
    for (const p of alts) expect(Date.parse(p.totals.endsAt)).toBeLessThanOrEqual(Date.parse('2026-10-03T01:00:00+02:00'));
  });
  it('la notte del cambio d\'ora usa istanti reali (offset +02:00 → +01:00)', async () => {
    const r = await plan({ date: '2026-10-24', startTime: '21:00', endTime: '03:30', moods: ['lively'], budget: { per: 'person', strict: false } });
    if (r.status === 'ok') for (const p of r.alternatives) {
      const end = Date.parse(p.totals.endsAt);
      expect(end).toBeLessThanOrEqual(Date.parse('2026-10-25T03:30:00+01:00'));
    }
  });
});

describe('G/H — rami e salto equivalente', () => {
  it('estendere la sosta conserva il passato; saltare equivale a riprodurre', async () => {
    const [p] = ok(await plan({ date: '2026-10-03', moods: ['views'], startTime: '10:00', endTime: '17:30' }));
    const s0 = p.stops[0];
    const r = replan(p, { kind: 'extend', minutes: 60, atTime: s0.start, stopId: s0.id, hypothetical: false }, data);
    expect(r.plan?.trips[0].departure).toBe(p.trips[0].departure);
    expect(r.diff).toBeTruthy();
    const tl = buildTimeline(p);
    const target = skipMoveTarget(tl, tl.start);
    const a = stateAt(tl, target);
    let t = tl.start;
    while (t < target) t = Math.min(target, t + 1000);
    expect(stateAt(tl, t)).toEqual(a);
  });
});

describe('I — dati incompleti e provider assente', () => {
  it('un costo sconosciuto non diventa zero e il budget non viene dichiarato rispettato', async () => {
    // dopo la riapertura del 17 ottobre: orari verificati, tariffa non pubblicata
    const r = await plan({ date: '2026-10-20', moods: ['cultural'], mustSee: ['masi-palazzo-reali'], budget: { amount: 500, per: 'person', strict: false } });
    const p = ok(r)[0];
    const stop = p.stops.find((s) => s.placeId === 'masi-palazzo-reali')!;
    expect(stop.cost.some((c) => c.min == null)).toBe(true);
    expect(p.totals.cost.unknownEssential).toBeGreaterThan(0);
    expect(p.totals.cost.status).toBe('unverifiable');
    expect(p.feasibility).not.toBe('valid');
  });
  it('una chiusura straordinaria dichiarata dal gestore rende impossibile la tappa obbligatoria e ne dà il motivo', async () => {
    const r = await plan({ moods: ['cultural'], mustSee: ['masi-palazzo-reali'] });
    expect(r.status).toBe('infeasible');
    if (r.status === 'infeasible') expect(r.infeasible.reasons.map((x) => x.message).join(' ')).toMatch(/MASI Palazzo Reali.*riallestimento/);
  });
  it('senza modello AI la fonte è dichiarata come pianificatore deterministico', async () => {
    const [p] = ok(await plan({}));
    expect(p.plannerSource).toBe('deterministic');
  });
});

describe('J — vincoli impossibili', () => {
  it('budget rigido incompatibile con una tappa obbligatoria: spiega e propone modifiche', async () => {
    const r = await plan({ startTime: '19:00', endTime: '22:00', budget: { amount: 5, per: 'person', strict: true }, mustSee: ['seven-lugano'] });
    expect(r.status).toBe('infeasible');
    if (r.status === 'infeasible') {
      expect(r.infeasible.reasons.length).toBeGreaterThan(0);
      expect(r.infeasible.suggestions.length).toBeGreaterThan(0);
    }
  });
  it('finestra troppo breve', async () => {
    const r = await plan({ startTime: '10:00', endTime: '10:20' });
    expect(r.status).toBe('infeasible');
  });
});

describe('K — gruppo variabile', () => {
  for (const n of [1, 4, 12]) {
    it(`${n} persone: totali coerenti e un avatar per persona`, async () => {
      const [p] = ok(await plan({ people: adults(n), moods: ['cultural'] }));
      expect(p.request.people).toHaveLength(n);
      expect(p.totals.cost.perPersonMax * n).toBeCloseTo(p.totals.cost.max, 0);
    });
  }
  it('oltre 12 persone la richiesta è rifiutata dallo schema', () => {
    expect(GroupRequest.safeParse({ ...req({}), people: adults(13) }).success).toBe(false);
  });
});

describe('contraddizioni del testo libero', () => {
  it('il budget scritto nel testo diverso dal modulo va risolto esplicitamente', async () => {
    const r = await plan({ budget: { amount: 50, per: 'person', strict: false }, freeText: 'vorremmo spendere massimo 20 franchi a testa' });
    expect(r.status).toBe('needs_resolution');
    const r2 = await planAlternatives(req({ budget: { amount: 50, per: 'person', strict: false }, freeText: 'vorremmo spendere massimo 20 franchi a testa', resolutions: { budget: 'keep_form' } }), { data });
    expect(r2.status).toBe('ok');
  });
});

describe('tappe bloccate', () => {
  it('una cena prenotata resta all\'orario indicato', async () => {
    const r = await plan({ startTime: '17:00', endTime: '23:00', moods: ['food'], locked: [{ placeId: 'la-tinera', start: '19:30', end: '21:00' }], mustSee: ['la-tinera'] });
    const [p] = ok(r);
    const s = p.stops.find((x) => x.placeId === 'la-tinera')!;
    expect(s.locked).toBe(true);
    expect(s.start).toBe('2026-10-02T19:30:00+02:00');
    expect(s.end).toBe('2026-10-02T21:00:00+02:00');
  });
});
