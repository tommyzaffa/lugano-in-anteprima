import { describe, it, expect } from 'vitest';
import { parseOsmOpeningHours } from '../src/shared/osm-hours.ts';
import { describeDay, checkVisit } from '../src/shared/calendar.ts';
import { localToInstant } from '../src/shared/time.ts';

const evidence = { field: 'hours', sourceId: 'osm', status: 'osm' as const };
const p = (s: string) => {
  const r = parseOsmOpeningHours(s, { id: 't', evidence });
  if (!r.ok) throw new Error(r.reason);
  return r.schedule;
};

describe('conversione opening_hours OSM', () => {
  it('orari settimanali con override', () => {
    const s = p('Mo off; Tu,We,Fr 11:00-18:00; Th 11:00-20:00; Sa,Su,PH 10:00-18:00');
    expect(describeDay(s, '2026-09-28')).toBe('Chiuso');
    expect(describeDay(s, '2026-10-01')).toBe('11:00–20:00');
    expect(s.holidays).toBe('as_sunday');
  });
  it('stagioni per mese', () => {
    const s = p('Mar-Oct: Mo-Su 10:30-17:30; Nov-Feb: Sa-Su 10:30-17:30');
    expect(describeDay(s, '2026-10-06')).toBe('10:30–17:30');
    expect(describeDay(s, '2026-11-10')).toBe('Chiuso');
    expect(describeDay(s, '2026-11-14')).toBe('10:30–17:30');
  });
  it('stagione con giorni e regola generale complementare', () => {
    const s = p('Jun 09-Oct 18: Tu-Su 12:00-16:00');
    expect(describeDay(s, '2026-10-18')).toBe('12:00–16:00');
    expect(describeDay(s, '2026-10-20')).toBe('Chiuso');
  });
  it('orari oltre mezzanotte e 25:00', () => {
    const s = p('Mo-Sa 17:00-25:00, Su off');
    expect(describeDay(s, '2026-10-02')).toContain('17:00–01:00 (+1)');
    expect(checkVisit(s, localToInstant('2026-10-03', '00:15'), 30).ok).toBe(true);
  });
  it('virgola come separatore di regole', () => {
    const s = p('Mo 07:00-15:30, Tu,We 07:00-15:30,17:30-23:00, Sa 18:00-01:00');
    expect(describeDay(s, '2026-09-30')).toBe('07:00–15:30, 17:30–23:00');
    expect(describeDay(s, '2026-10-03')).toContain('18:00–01:00');
  });
  it('PH off e 24/7', () => {
    expect(p('Mo-Fr 08:30-18:00; Sa-Su closed; PH closed').holidays).toBe('closed');
    expect(p('24/7').alwaysOpen).toBe(true);
  });
  it('rifiuta sintassi non supportata invece di indovinare', () => {
    expect(parseOsmOpeningHours('Th-Tu 09:00-24:00, Th-Tu 11:30-14:30 "cucina"', { id: 'x', evidence }).ok).toBe(false);
    expect(parseOsmOpeningHours('sunrise-sunset', { id: 'x', evidence }).ok).toBe(false);
  });
});

describe('regole aggiuntive OSM', () => {
  it('la virgola aggiunge intervalli invece di sostituirli', () => {
    const r = parseOsmOpeningHours('Mo,Tu off, Th-Su 12:00-15:00, Fr-Su 19:00-24:00, We 17:00-01:00', { id: 'g', evidence: { field: 'hours', sourceId: 'osm', status: 'osm' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(describeDay(r.schedule, '2026-10-02')).toBe('12:00–15:00, 19:00–00:00 (+1)');
    expect(describeDay(r.schedule, '2026-10-01')).toBe('12:00–15:00');
    expect(describeDay(r.schedule, '2026-09-28')).toBe('Chiuso');
  });
  it('il punto e virgola sostituisce', () => {
    const r = parseOsmOpeningHours('Mo-Su 10:00-18:00; We off', { id: 'g', evidence: { field: 'hours', sourceId: 'osm', status: 'osm' } });
    if (!r.ok) throw new Error();
    expect(describeDay(r.schedule, '2026-09-30')).toBe('Chiuso');
  });
});
