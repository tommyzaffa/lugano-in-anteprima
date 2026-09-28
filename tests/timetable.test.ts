/**
 * Calcoli di data e ora senza Luxon nel percorso caldo (stessi risultati, più veloci),
 * orario di riferimento per le date non coperte dal feed GTFS e interruzione per tempo
 * del pianificatore dichiarata come tale.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { DateTime } from 'luxon';
import { isoWeekday, addDaysToDate, localDateOfMs, localMinuteOfDay, zurichOffsetMin, localToInstant, TZ } from '../src/shared/time.ts';
import { checkVisit } from '../src/shared/calendar.ts';
import { OpeningSchedule } from '../src/shared/types.ts';
import { DataStore } from '../src/server/data.ts';
import { planAlternatives, PlanningTimeout } from '../src/server/planner/index.ts';
import { revalidate } from '../src/server/planner/revalidate.ts';
import { GroupRequest, type Plan } from '../src/shared/types.ts';

describe('date di calendario e istanti di Zurigo', () => {
  it('giorno della settimana e somma di giorni come Luxon, anche su fine mese, anno e 29 febbraio', () => {
    for (const d of ['2026-03-29', '2026-10-25', '2026-12-31', '2028-02-28', '2028-02-29', '2027-01-01']) {
      expect(isoWeekday(d)).toBe(DateTime.fromISO(d, { zone: TZ }).weekday);
      for (const n of [-400, -1, 1, 7, 364]) expect(addDaysToDate(d, n)).toBe(DateTime.fromISO(d, { zone: TZ }).plus({ days: n }).toFormat('yyyy-MM-dd'));
    }
  });
  it('data locale, minuto del giorno e offset attorno ai cambi d\'ora (indipendenti dal fuso del processo)', () => {
    const start = Date.parse('2026-03-28T20:00:00Z'), end = Date.parse('2026-03-29T04:00:00Z');
    const autumnStart = Date.parse('2026-10-24T20:00:00Z'), autumnEnd = Date.parse('2026-10-25T04:00:00Z');
    for (const [a, b] of [[start, end], [autumnStart, autumnEnd]]) {
      for (let t = a; t <= b; t += 7 * 60_000) {
        const dt = DateTime.fromMillis(t, { zone: TZ });
        expect(zurichOffsetMin(t)).toBe(dt.offset);
        expect(localDateOfMs(t)).toBe(dt.toFormat('yyyy-MM-dd'));
        expect(localMinuteOfDay(t)).toBe(dt.hour * 60 + dt.minute);
      }
    }
  });
  it('localToInstant in cache restituisce lo stesso istante della costruzione diretta', () => {
    const a = localToInstant('2026-10-25', '02:30');
    const b = localToInstant('2026-10-25', '02:30');
    expect(a).toBe(b);
    expect(a.toMillis()).toBe(DateTime.fromObject({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 }, { zone: TZ }).toMillis());
  });
  it('checkVisit accetta indifferentemente un istante in millisecondi o un DateTime', () => {
    const s = OpeningSchedule.parse({ id: 'x', kind: 'public', holidays: 'regular', evidence: { field: 'hours', sourceId: 't', status: 'demo' }, rules: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '10:00', to: '18:00', lastEntry: '17:30' }] });
    for (const hhmm of ['09:40', '10:00', '17:20', '17:40', '17:55']) {
      const dt = localToInstant('2026-10-02', hhmm);
      expect(checkVisit(s, dt.toMillis(), 30)).toEqual(checkVisit(s, dt, 30));
    }
  });
});

const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short', tone: '#f0cfa8' };
const station = { kind: 'stop', label: 'Stazione FFS di Lugano', lon: 8.946849, lat: 46.005499 };
const req = (p: Record<string, unknown>) => GroupRequest.parse({
  date: '2026-10-02', start: station, end: { mode: 'same' }, occasion: 'date', budget: { per: 'person', strict: false },
  people: [0, 1].map((i) => ({ id: `a${i}`, name: `Adulto ${i + 1}`, kind: 'adult', avatar: av, interests: [] })),
  startTime: '09:30', endTime: '18:00', moods: ['views', 'cultural'], ...p,
});

describe('orario di riferimento oltre il periodo del feed GTFS', () => {
  let data: DataStore;
  beforeAll(() => { data = new DataStore(); data.load(); });

  it('dentro il feed la data resta sé stessa; dopo si usa lo stesso giorno della settimana di 52 settimane prima', () => {
    expect(data.transit.referenceDate('2026-10-02')).toBe('2026-10-02');
    const ref = data.transit.referenceDate('2027-01-15')!;
    expect(ref).toBe('2026-01-16');
    expect(isoWeekday(ref)).toBe(isoWeekday('2027-01-15'));
    expect(data.transit.covers(ref)).toBe(true);
  });
  it('un festivo si confronta con una domenica, un feriale mai con un festivo', () => {
    // Natale 2026 (venerdì) → domenica dell'anno orario 2026
    expect(isoWeekday(data.transit.referenceDate('2026-12-25')!)).toBe(7);
    // 1° giugno 2028: 104 settimane prima cadrebbe il Corpus Domini 2026 (4 giugno) → si sposta di una settimana
    const ref = data.transit.referenceDate('2028-06-01')!;
    expect(ref).not.toBe('2026-06-04');
    expect(isoWeekday(ref)).toBe(isoWeekday('2028-06-01'));
  });
  it('troppo lontano nel tempo: nessun orario inventato', () => {
    expect(data.transit.referenceDate('2031-01-01')).toBeNull();
  });
  it('un programma del 15 gennaio 2027 usa i mezzi con orario stimato e dichiarato, mai «ufficiale»', async () => {
    const r = await planAlternatives(req({ date: '2027-01-15' }), { data });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.notices.join(' ')).toMatch(/stimate dall'orario del 2026-01-16/);
    const withRides = r.alternatives.filter((p: Plan) => p.trips.some((t) => t.legs.some((l) => l.transit)));
    expect(withRides.length).toBeGreaterThan(0);
    for (const p of withRides) {
      const chk = p.checks.find((c) => c.id === 'transit')!;
      expect(chk.status).toBe('uncertain');
      expect(chk.detail).toMatch(/^Orario stimato/);
      expect(p.feasibility).not.toBe('valid');
      for (const l of p.trips.flatMap((t) => t.legs).filter((x) => x.transit)) {
        expect(l.source.label).toMatch(/^Orario di riferimento del 2026-01-16/);
        expect(l.notes.join(' ')).toMatch(/Orario stimato/);
        // gli orari restano quelli del giorno reale
        expect(l.departure.slice(0, 10)).toBe('2027-01-15');
      }
      const rv = revalidate(p, data);
      expect(rv.items.some((i) => i.severity === 'warning' && /stimate/.test(i.message))).toBe(true);
      expect(rv.items.some((i) => /fuori dal periodo/.test(i.message))).toBe(false);
    }
  });
  it('dentro il feed nessuna corsa è marcata come stimata', async () => {
    const r = await planAlternatives(req({}), { data });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    for (const l of r.alternatives.flatMap((p) => p.trips.flatMap((t) => t.legs)).filter((x) => x.transit)) {
      expect(l.source.label).toMatch(/^Orario ufficiale/);
    }
  });
  it('se il tempo finisce prima di trovare un programma non si dichiara «impossibile»', async () => {
    await expect(planAlternatives(req({}), { data, timeLimitMs: 0 })).rejects.toBeInstanceOf(PlanningTimeout);
  });
});
