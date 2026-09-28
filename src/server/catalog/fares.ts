/**
 * Tariffe INDICATIVE dei trasporti (stime redazionali, non listini).
 * Gli abbonamenti dichiarati non vengono scalati: si segnala solo che
 * potrebbero includere la corsa, da verificare.
 */
import type { CostLine, Person } from '../../shared/types.ts';
import type { TransitMode } from '../routing/transit.ts';

interface FareRule { label: string; adult: [number, number]; childFactor: number; note: string }

const RULES: { match: (r: { short: string; mode: TransitMode; agency: string }, hops: number) => boolean; rule: FareRule }[] = [
  { match: (r) => r.mode === 'funicular' && r.short === '2650', rule: { label: 'Funicolare Lugano Città–Stazione', adult: [1.1, 1.5], childFactor: 0.5, note: 'Tariffa indicativa della funicolare cittadina.' } },
  { match: (r) => r.mode === 'funicular' && r.short === '2652', rule: { label: 'Funicolare Monte San Salvatore (corsa semplice)', adult: [20, 26], childFactor: 0.5, note: 'Stima per corsa semplice; andata e ritorno di solito più conveniente. Da verificare.' } },
  { match: (r, hops) => r.mode === 'funicular' && r.short === '2653' && hops <= 1, rule: { label: 'Funicolare Cassarate–Suvigliana', adult: [1.5, 3.5], childFactor: 0.5, note: 'Tratta breve, tariffa indicativa.' } },
  { match: (r) => r.mode === 'funicular' && r.short === '2653', rule: { label: 'Funicolare Monte Brè (corsa semplice)', adult: [14, 19], childFactor: 0.5, note: 'Stima per corsa semplice; andata e ritorno di solito più conveniente. Da verificare.' } },
  { match: (r, hops) => r.mode === 'boat' && hops <= 2, rule: { label: 'Battello Società Navigazione Lago di Lugano (tratta breve)', adult: [8, 17], childFactor: 0.5, note: 'Stima per tratta breve.' } },
  { match: (r, hops) => r.mode === 'boat' && hops <= 5, rule: { label: 'Battello SNL (tratta media)', adult: [15, 27], childFactor: 0.5, note: 'Stima per tratta media.' } },
  { match: (r) => r.mode === 'boat', rule: { label: 'Battello SNL (tratta lunga)', adult: [25, 40], childFactor: 0.5, note: 'Stima per tratta lunga.' } },
  { match: (r) => r.mode === 'train', rule: { label: 'Biglietto Arcobaleno (treno regionale)', adult: [2.3, 5.4], childFactor: 0.5, note: 'Tariffa indicativa comunità Arcobaleno; dipende dalle zone.' } },
  { match: () => true, rule: { label: 'Biglietto Arcobaleno (bus)', adult: [2.3, 4.6], childFactor: 0.5, note: 'Tariffa indicativa comunità Arcobaleno; dipende dalle zone. Un biglietto può valere per più corse entro la validità.' } },
];

export function rideFare(route: { short: string; mode: TransitMode; agency: string }, hops: number, people: Person[], at: string, passes: string[]): CostLine {
  const r = RULES.find((x) => x.match(route, hops))!.rule;
  let min = 0, max = 0;
  for (const p of people) {
    if (p.kind === 'child') {
      if (p.ageBand === '0-5') continue; // sotto i 6 anni di norma gratis (da verificare)
      min += r.adult[0] * r.childFactor; max += r.adult[1] * r.childFactor;
    } else { min += r.adult[0]; max += r.adult[1]; }
  }
  const passNote = passes.length ? ` Con ${passes.map(passLabel).join(', ')} la corsa potrebbe essere inclusa o scontata: non applicato, da verificare.` : '';
  return {
    id: `fare-${route.short}-${at}`,
    label: r.label,
    min: round(min), max: round(max),
    status: 'estimate', essential: true, perPerson: false,
    note: r.note + passNote,
    evidenceStatus: 'estimate',
    at,
  };
}
function round(x: number) { return Math.round(x * 10) / 10; }
export function passLabel(p: string): string {
  return ({ ga: 'AG/GA', half_fare: 'metà prezzo', arcobaleno: 'abbonamento Arcobaleno', ticino_ticket: 'Ticino Ticket', lugano_card: 'Lugano Card' } as Record<string, string>)[p] ?? p;
}
