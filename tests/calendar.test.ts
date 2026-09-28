import { describe, it, expect } from 'vitest';
import { checkVisit, openIntervals, intervalsForDate, expandEvent, ticinoHolidays, describeDay } from '../src/shared/calendar.ts';
import { localToInstant, requestWindow } from '../src/shared/time.ts';
import { OpeningSchedule, CatalogEvent } from '../src/shared/types.ts';

const ev = { field: 'hours', sourceId: 'test', status: 'demo' as const };
const museum = OpeningSchedule.parse({
  id: 'm', kind: 'public', holidays: 'closed', evidence: ev,
  rules: [{ days: [2, 3, 5, 6, 7], from: '10:00', to: '18:00', lastEntry: '17:30' }, { days: [4], from: '10:00', to: '20:00', lastEntry: '19:30' }],
  exceptions: [{ date: '2026-12-24', intervals: [{ from: '10:00', to: '14:00', lastEntry: '13:30' }] }],
});
const bar = OpeningSchedule.parse({ id: 'b', kind: 'public', holidays: 'regular', evidence: ev, rules: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '20:00', to: '01:00' }] });

describe('orari di apertura', () => {
  it('rifiuta un arrivo dopo l\'ultimo ingresso anche se il museo è ancora aperto (scenario F)', () => {
    const r = checkVisit(museum, localToInstant('2026-10-02', '17:40'), 15);
    expect(r.ok).toBe(false);
    expect(r.status).toBe('last_entry_passed');
  });
  it('accetta un arrivo prima dell\'ultimo ingresso con visita che finisce entro la chiusura', () => {
    expect(checkVisit(museum, localToInstant('2026-10-02', '16:00'), 90).ok).toBe(true);
  });
  it('rifiuta una visita che supera la chiusura', () => {
    const r = checkVisit(museum, localToInstant('2026-10-02', '17:00'), 90);
    expect(r.status).toBe('closes_before_end');
  });
  it('è chiuso il lunedì e nelle festività ticinesi', () => {
    expect(checkVisit(museum, localToInstant('2026-09-28', '11:00'), 60).status).toBe('closed');
    // 1 novembre 2026 è domenica ma festivo (Ognissanti) e la regola festivi è "chiuso"
    expect(checkVisit(museum, localToInstant('2026-11-01', '11:00'), 60).status).toBe('closed');
  });
  it('applica l\'eccezione della vigilia', () => {
    expect(describeDay(museum, '2026-12-24')).toContain('10:00–14:00');
    expect(checkVisit(museum, localToInstant('2026-12-24', '13:45'), 10).status).toBe('last_entry_passed');
  });
  it('un locale 20:00–01:00 termina il giorno successivo', () => {
    const [iv] = intervalsForDate(bar, '2026-10-02');
    expect(iv.end.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-10-03 01:00');
    expect(checkVisit(bar, localToInstant('2026-10-02', '23:30'), 60).ok).toBe(true);
    expect(checkVisit(bar, localToInstant('2026-10-02', '23:30'), 120).ok).toBe(false);
    // dopo mezzanotte si è ancora nell'intervallo del giorno prima
    expect(checkVisit(bar, localToInstant('2026-10-03', '00:20'), 30).ok).toBe(true);
  });
  it('gestisce il ritorno all\'ora solare (25 ottobre 2026): 20:00–03:00 dura 8 ore reali', () => {
    const late = OpeningSchedule.parse({ id: 'l', kind: 'public', holidays: 'regular', evidence: ev, rules: [{ days: [6], from: '20:00', to: '03:00' }] });
    const [iv] = intervalsForDate(late, '2026-10-24');
    expect(iv.start.offset).toBe(120);
    expect(iv.end.offset).toBe(60);
    expect(iv.end.diff(iv.start, 'hours').hours).toBe(8);
  });
  it('gestisce il passaggio all\'ora legale (29 marzo 2026): 22:00–04:00 dura 5 ore reali', () => {
    const s = OpeningSchedule.parse({ id: 's', kind: 'public', holidays: 'regular', evidence: ev, rules: [{ days: [6], from: '22:00', to: '04:00' }] });
    const [iv] = intervalsForDate(s, '2026-03-28');
    expect(iv.end.diff(iv.start, 'hours').hours).toBe(5);
  });
  it('la finestra richiesta oltre mezzanotte finisce il giorno dopo', () => {
    const w = requestWindow('2026-10-02', '19:00', '01:30');
    expect(w.crossesMidnight).toBe(true);
    expect(w.end.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-10-03 01:30');
  });
  it('rispetta la stagionalità a cavallo d\'anno', () => {
    const s = OpeningSchedule.parse({ id: 'x', kind: 'public', holidays: 'regular', evidence: ev, rules: [
      { days: [1, 2, 3, 4, 5, 6, 7], from: '09:00', to: '18:00', seasonFrom: '03-15', seasonTo: '11-01' },
      { days: [6, 7], from: '10:00', to: '16:00', seasonFrom: '11-02', seasonTo: '03-14' },
    ] });
    expect(intervalsForDate(s, '2026-07-01')).toHaveLength(1);
    expect(intervalsForDate(s, '2027-01-05')).toHaveLength(0); // martedì d'inverno
    expect(intervalsForDate(s, '2027-01-09')).toHaveLength(1); // sabato d'inverno
  });
  it('openIntervals unisce il 24/7', () => {
    const s = OpeningSchedule.parse({ id: 'p', kind: 'public', alwaysOpen: true, evidence: ev });
    const ivs = openIntervals(s, localToInstant('2026-10-02', '10:00'), localToInstant('2026-10-04', '10:00'));
    expect(ivs).toHaveLength(1);
  });
});

describe('festività ticinesi', () => {
  it('calcola le feste mobili del 2026', () => {
    const h = ticinoHolidays(2026);
    expect(h.get('2026-04-06')).toBe('Lunedì di Pasqua'); // Pasqua 5 aprile 2026
    expect(h.get('2026-05-14')).toBe('Ascensione');
    expect(h.get('2026-05-25')).toBe('Lunedì di Pentecoste');
    expect(h.get('2026-06-04')).toBe('Corpus Domini');
  });
});

describe('eventi', () => {
  const weekly = CatalogEvent.parse({
    id: 'jazz', title: 'Jazz', placeId: 'x', description: '', category: 'concert', booking: { required: 'no' }, demo: true,
    recurrence: { freq: 'weekly', byDay: [5], from: '20:30', to: '23:00', validFrom: '2026-06-05', validTo: '2026-10-16',
      exceptions: [{ date: '2026-10-09', status: 'cancelled', note: 'annullato' }] },
  });
  it('una occorrenza annullata resta visibile come annullata e non come in programma (scenario E)', () => {
    const occ = expandEvent(weekly, localToInstant('2026-10-09', '00:00'), localToInstant('2026-10-09', '23:59'));
    expect(occ).toHaveLength(1);
    expect(occ[0].status).toBe('cancelled');
  });
  it('non crea occorrenze dopo la fine della stagione', () => {
    const occ = expandEvent(weekly, localToInstant('2026-10-17', '00:00'), localToInstant('2026-12-31', '23:59'));
    expect(occ).toHaveLength(0);
  });
  it('genera le occorrenze settimanali nella validità', () => {
    const occ = expandEvent(weekly, localToInstant('2026-09-01', '00:00'), localToInstant('2026-09-30', '23:59'));
    expect(occ.map((o) => o.start.slice(0, 10))).toEqual(['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']);
    expect(occ[0].start).toBe('2026-09-04T20:30:00+02:00');
  });
  it('gestisce sessioni distinte di un evento su più giorni', () => {
    const multi = CatalogEvent.parse({ id: 'fest', title: 'Festa', placeId: 'x', description: '', category: 'festival', booking: { required: 'no' },
      sessions: [{ id: 's1', start: '2026-10-02T17:00:00+02:00', end: '2026-10-03T00:30:00+02:00' }, { id: 's2', start: '2026-10-03T11:00:00+02:00', end: '2026-10-04T01:00:00+02:00', status: 'sold_out' }] });
    const occ = expandEvent(multi, localToInstant('2026-10-02', '00:00'), localToInstant('2026-10-04', '23:00'));
    expect(occ).toHaveLength(2);
    expect(occ[1].status).toBe('sold_out');
  });
});
