/**
 * Prezzi per il gruppo. Regole:
 *  - un costo sconosciuto NON vale zero: resta «sconosciuto» e rende il totale non verificabile;
 *  - le stime restano fasce min–max;
 *  - si distingue costo per persona e per gruppo;
 *  - nessuno sconto non verificato viene applicato.
 */
import type { PriceEstimate, CostLine, Person, Totals } from './types.ts';

export interface GroupComposition { adults: number; children: { ageBand?: string }[]; total: number }

export function composition(people: Person[]): GroupComposition {
  const children = people.filter((p) => p.kind === 'child').map((p) => ({ ageBand: p.ageBand }));
  return { adults: people.length - children.length, children, total: people.length };
}

function childAge(band?: string): number {
  switch (band) {
    case '0-5': return 4;
    case '6-11': return 9;
    case '12-15': return 14;
    case '16-17': return 17;
    default: return 10; // età non indicata: si assume fascia intermedia
  }
}

/** Costo per il gruppo di un insieme di prezzi di un luogo o evento. */
export function groupCost(prices: PriceEstimate[], people: Person[], at: string, idPrefix: string): CostLine[] {
  const comp = composition(people);
  const lines: CostLine[] = [];
  if (!prices.length) {
    return [{ id: `${idPrefix}-unknown`, label: 'Costo', min: null, max: null, status: 'unknown', essential: true, at, note: 'Nessuna informazione sul prezzo.', evidenceStatus: 'unknown' }];
  }
  const adultRules = prices.filter((p) => p.audience === 'adult' || p.audience === 'all');
  const childRules = prices.filter((p) => p.audience === 'child');
  for (const p of prices) {
    if (p.unit === 'free') {
      lines.push({ id: `${idPrefix}-${p.id}`, label: p.label, min: 0, max: 0, status: p.status, essential: p.essential, at, evidenceStatus: p.evidence.status, note: p.note });
      continue;
    }
    if (p.unit === 'group') {
      lines.push({ id: `${idPrefix}-${p.id}`, label: `${p.label} (per il gruppo)`, min: p.min ?? null, max: p.max ?? p.min ?? null, status: p.min == null ? 'unknown' : p.status, essential: p.essential, at, evidenceStatus: p.evidence.status, note: p.note });
      continue;
    }
    // per persona: decide a chi si applica
    let count = 0;
    let freeKids = 0;
    if (p.audience === 'child') {
      count = comp.children.filter((c) => childAge(c.ageBand) <= (p.childAgeMax ?? 15)).length;
    } else if (p.audience === 'adult') {
      count = comp.adults;
      // bambini senza una tariffa bambini dedicata pagano come adulti (stima prudente)
      if (!childRules.length) count += comp.children.length;
      else count += comp.children.filter((c) => !childRules.some((r) => childAge(c.ageBand) <= (r.childAgeMax ?? 15))).length;
    } else {
      count = comp.total;
      if (p.childFree) {
        freeKids = comp.children.filter((c) => childAge(c.ageBand) <= (p.childAgeMax ?? 15)).length;
        count -= freeKids;
      }
    }
    if (count <= 0 && !(p.audience === 'all' && freeKids > 0)) continue;
    const unknown = p.status === 'unknown' || p.min == null;
    const note = [p.note, freeKids ? `${freeKids} bambin${freeKids > 1 ? 'i' : 'o'} gratis secondo la fonte (da verificare)` : ''].filter(Boolean).join(' · ') || undefined;
    lines.push({
      id: `${idPrefix}-${p.id}`,
      label: `${p.label}${count > 0 ? ` × ${count}` : ''}`,
      min: unknown ? null : round((p.min ?? 0) * count),
      max: unknown ? null : round((p.max ?? p.min ?? 0) * count),
      status: unknown ? 'unknown' : p.status,
      essential: p.essential && !p.optional,
      perPerson: true,
      at,
      evidenceStatus: p.evidence.status,
      note,
    });
  }
  void adultRules;
  return lines;
}

export function round(x: number): number { return Math.round(x * 100) / 100; }

export function sumCosts(lines: CostLine[], people: number, budget?: { amount?: number; per: 'person' | 'group' }): Totals['cost'] {
  let min = 0, max = 0, unknownEssential = 0, unknownOptional = 0;
  for (const l of lines) {
    if (l.status === 'unknown' || l.min == null || l.max == null) {
      if (l.essential) unknownEssential++; else unknownOptional++;
      continue;
    }
    if (!l.essential) { max += l.max; continue; } // facoltativo: incide solo sul massimo
    min += l.min; max += l.max;
  }
  min = round(min); max = round(max);
  let status: Totals['cost']['status'] = 'no_budget';
  if (budget?.amount != null) {
    const cap = budget.per === 'person' ? budget.amount * people : budget.amount;
    if (min > cap + 0.001) status = 'over';
    else if (unknownEssential > 0 || max > cap + 0.001) status = 'unverifiable';
    else status = 'within';
  }
  return { min, max, perPersonMin: round(min / people), perPersonMax: round(max / people), unknownEssential, unknownOptional, status };
}

export function budgetCap(budget: { amount?: number; per: 'person' | 'group' }, people: number): number | null {
  if (budget.amount == null) return null;
  return budget.per === 'person' ? budget.amount * people : budget.amount;
}

export function fmtChf(x: number | null | undefined): string {
  if (x == null) return '?';
  return x % 1 === 0 ? `CHF ${x}` : `CHF ${x.toFixed(2)}`;
}

export function fmtRange(min: number | null, max: number | null): string {
  if (min == null || max == null) return 'sconosciuto';
  if (Math.abs(min - max) < 0.01) return fmtChf(min);
  return `${fmtChf(min)}–${max % 1 === 0 ? max : max.toFixed(2)}`;
}
