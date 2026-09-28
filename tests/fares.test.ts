/**
 * Tariffe ufficiali delle funicolari (listini consultati il 28.09.2026) e fasce
 * d'età dei prezzi dei luoghi.
 */
import { describe, it, expect } from 'vitest';
import { officialFare, rideFare, applyReturnTickets, mergeBreSections } from '../src/server/catalog/fares.ts';
import { groupCost } from '../src/shared/pricing.ts';
import type { Person, PriceEstimate } from '../src/shared/types.ts';

const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short', tone: '#f0cfa8' } as any;
const adult = (i: number): Person => ({ id: `a${i}`, name: `A${i}`, kind: 'adult', avatar: av, interests: [] } as any);
const child = (i: number, ageBand: string): Person => ({ id: `c${i}`, name: `C${i}`, kind: 'child', ageBand, avatar: av, interests: [] } as any);

describe('funicolari: listini ufficiali', () => {
  it('San Salvatore: corsa semplice e andata e ritorno per adulti, ragazzi e piccoli', () => {
    const fam = [adult(1), adult(2), child(1, '6-11'), child(2, '0-5')];
    expect(officialFare('2652', 'single', fam, []).total).toBe(25 * 2 + 11);
    expect(officialFare('2652', 'ret', fam, []).total).toBe(32 * 2 + 14);
    expect(officialFare('2652', 'ret', [adult(1)], ['half_fare']).total).toBe(16);
    expect(officialFare('2652', 'single', [adult(1)], ['ticino_ticket']).total).toBe(20);
  });
  it('Monte Brè: listino con metà prezzo/AG', () => {
    expect(officialFare('2653', 'single', [adult(1), adult(2)], []).total).toBe(34);
    expect(officialFare('2653', 'ret', [adult(1)], ['ga']).total).toBe(13);
    expect(officialFare('2653', 'ret', [child(1, '12-15')], []).total).toBe(13);
  });
  it('la corsa porta la fonte ed è marcata come verificata', () => {
    const l = rideFare({ short: '2652', mode: 'funicular', agency: 'FMS' }, 1, [adult(1)], '2026-10-03T10:00:00+02:00', []);
    expect(l.status).toBe('known');
    expect(l.evidenceStatus).toBe('verified');
    expect(l.note).toMatch(/montesansalvatore\.ch/);
  });
  it('salita e discesa con la stessa funicolare diventano un biglietto di andata e ritorno', () => {
    const p = [adult(1), adult(2)];
    const up = rideFare({ short: '2652', mode: 'funicular', agency: 'FMS' }, 1, p, '2026-10-03T10:00:00+02:00', []);
    const down = rideFare({ short: '2652', mode: 'funicular', agency: 'FMS' }, 1, p, '2026-10-03T12:00:00+02:00', []);
    const bus = rideFare({ short: '1', mode: 'bus', agency: 'TPL' }, 3, p, '2026-10-03T09:30:00+02:00', []);
    const out = applyReturnTickets([bus, up, down], p, []);
    expect(out[0]).toEqual(bus);
    expect(out[1].label).toMatch(/andata e ritorno/);
    expect(out[1].min).toBe(64);
    expect(out[2].min).toBe(0);
    expect((out[1].min ?? 0) + (out[2].min ?? 0)).toBeLessThan((up.min ?? 0) + (down.min ?? 0));
  });
});

describe('Monte Brè: due sezioni, un biglietto', () => {
  it('prima sezione da sola a tariffa di sezione; con la seconda nello stesso viaggio è compresa', () => {
    const p = [adult(1)];
    const s1 = rideFare({ short: '2653', mode: 'funicular', agency: 'FMB' }, 1, p, '2026-10-03T10:00:00+02:00', [], ['Cassarate', 'Suvigliana']);
    const s2 = rideFare({ short: '2653', mode: 'funicular', agency: 'FMB' }, 5, p, '2026-10-03T10:05:00+02:00', [], ['Suvigliana', 'Monte Brè']);
    expect(s1.min).toBe(2.2);
    expect(s2.min).toBe(17);
    const merged = mergeBreSections([s1, s2]);
    expect(merged).toHaveLength(1);
    expect(merged[0].min).toBe(17);
    expect(mergeBreSections([s1])).toEqual([s1]);
  });
});

describe('prezzi dei luoghi per fasce d\'età', () => {
  const ev = { field: 'price', sourceId: 'official-web', status: 'verified' } as const;
  const prices: PriceEstimate[] = [
    { id: 'a', label: 'Adulti', currency: 'CHF', min: 15, max: 15, unit: 'person', audience: 'adult', status: 'known', essential: true, evidence: ev },
    { id: 'c', label: '6–15', currency: 'CHF', min: 5, max: 5, unit: 'person', audience: 'child', childAgeMax: 15, status: 'known', essential: true, evidence: ev },
    { id: 'k', label: '0–5', currency: 'CHF', min: 0, max: 0, unit: 'person', audience: 'child', childAgeMax: 5, status: 'known', essential: true, evidence: ev },
  ];
  it('ogni bambino è contato una sola volta, nella fascia più stretta', () => {
    const lines = groupCost(prices, [adult(1), child(1, '0-5'), child(2, '6-11')], '2026-10-03T10:00:00+02:00', 'x');
    const total = lines.reduce((s, l) => s + (l.min ?? 0), 0);
    expect(total).toBe(15 + 5 + 0);
    expect(lines.find((l) => l.id === 'x-k')?.label).toMatch(/× 1/);
    expect(lines.find((l) => l.id === 'x-c')?.label).toMatch(/× 1/);
  });
});
