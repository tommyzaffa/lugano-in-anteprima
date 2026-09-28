import { describe, it, expect } from 'vitest';
import { groupCost, sumCosts } from '../src/shared/pricing.ts';
import type { PriceEstimate, Person } from '../src/shared/types.ts';

const evidence = { field: 'price', sourceId: 't', status: 'estimate' as const };
const adult = (id: string): Person => ({ id, name: id, kind: 'adult', avatar: { color: '#000', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short', tone: '#f0cfa8' }, interests: [] });
const child = (id: string, ageBand: Person['ageBand']): Person => ({ ...adult(id), kind: 'child', ageBand });

describe('prezzi di gruppo', () => {
  const museum: PriceEstimate[] = [{ id: 'm', label: 'Ingresso', currency: 'CHF', min: 15, max: 20, unit: 'person', audience: 'all', status: 'estimate', essential: true, childFree: true, childAgeMax: 16, evidence }];
  it('moltiplica per persona ed esclude i bambini gratuiti', () => {
    const lines = groupCost(museum, [adult('a'), adult('b'), child('c', '6-11'), child('d', '0-5')], '2026-10-02T10:00:00+02:00', 'x');
    expect(lines[0].min).toBe(30);
    expect(lines[0].max).toBe(40);
    expect(lines[0].note).toContain('2 bambini gratis');
  });
  it('un costo sconosciuto non vale zero e rende il budget non verificabile', () => {
    const unknown: PriceEstimate[] = [{ id: 'u', label: 'Ingresso', currency: 'CHF', unit: 'person', audience: 'all', status: 'unknown', essential: true, evidence: { ...evidence, status: 'unknown' } }];
    const lines = groupCost(unknown, [adult('a'), adult('b')], '2026-10-02T10:00:00+02:00', 'x');
    expect(lines[0].min).toBeNull();
    const t = sumCosts(lines, 2, { amount: 1000, per: 'group' });
    expect(t.min).toBe(0);
    expect(t.unknownEssential).toBe(1);
    expect(t.status).toBe('unverifiable');
  });
  it('distingue per persona e per gruppo nel tetto di spesa', () => {
    const lines = groupCost(museum, [adult('a'), adult('b'), adult('c'), adult('d')], 'x', 'x');
    expect(sumCosts(lines, 4, { amount: 20, per: 'person' }).status).toBe('within');
    expect(sumCosts(lines, 4, { amount: 70, per: 'group' }).status).toBe('unverifiable'); // 60–80: potrebbe superare
    expect(sumCosts(lines, 4, { amount: 50, per: 'group' }).status).toBe('over');
  });
  it('tariffe separate adulti e bambini', () => {
    const lido: PriceEstimate[] = [
      { id: 'a', label: 'Adulti', currency: 'CHF', min: 10, max: 12, unit: 'person', audience: 'adult', status: 'estimate', essential: true, evidence },
      { id: 'c', label: 'Ragazzi', currency: 'CHF', min: 5, max: 6, unit: 'person', audience: 'child', childAgeMax: 15, status: 'estimate', essential: true, evidence },
    ];
    const lines = groupCost(lido, [adult('a'), adult('b'), child('c', '6-11'), child('d', '16-17')], 'x', 'x');
    const t = sumCosts(lines, 4);
    // 3 tariffe adulto (il 16enne supera l'età massima ragazzi) + 1 ragazzi
    expect(t.min).toBe(35);
    expect(t.max).toBe(42);
  });
  it('le voci facoltative incidono solo sul massimo', () => {
    const t = sumCosts([{ id: 'o', label: 'x', min: 10, max: 20, status: 'estimate', essential: false, at: 'x' }], 1, { amount: 5, per: 'group' });
    expect(t.min).toBe(0);
    expect(t.max).toBe(20);
    expect(t.status).toBe('unverifiable');
  });
});
