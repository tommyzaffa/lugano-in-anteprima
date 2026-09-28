/**
 * Tariffe dei trasporti.
 * - Funicolari del Monte San Salvatore e del Monte Brè: listini ufficiali letti sui siti dei
 *   gestori (URL e data in OFFICIAL), con ragazzi, gratuità, metà prezzo/AG e andata e ritorno.
 * - Altri mezzi: stime redazionali, non listini. Gli abbonamenti non vengono scalati: si
 *   segnala solo che potrebbero includere la corsa.
 */
import type { CostLine, Person } from '../../shared/types.ts';
import type { TransitMode } from '../routing/transit.ts';

interface FareRule { label: string; adult: [number, number]; childFactor: number; note: string }

/** Listini ufficiali per corsa semplice e andata e ritorno. */
interface OfficialFare {
  label: string;
  single: { adult: number; child: number; half: number; reduced?: number };
  ret: { adult: number; child: number; half: number; reduced?: number };
  /** età massima della tariffa ragazzi; sotto childFreeMax si viaggia gratis */
  childMax: number; childFreeMax: number;
  /** abbonamenti che danno la tariffa «half» secondo il listino */
  halfPasses: string[]; reducedPasses: string[];
  url: string; checked: string; note: string;
}
export const OFFICIAL: Record<string, OfficialFare> = {
  '2652': {
    label: 'Funicolare Monte San Salvatore',
    single: { adult: 25, child: 11, half: 12.5, reduced: 20 }, ret: { adult: 32, child: 14, half: 16, reduced: 25.5 },
    childMax: 16, childFreeMax: 5, halfPasses: ['half_fare', 'ga'], reducedPasses: ['ticino_ticket'],
    url: 'https://www.montesansalvatore.ch/en/timetable-and-fares/', checked: '2026-09-28',
    note: 'Listino ufficiale 2026: ragazzi 6–16 anni, metà prezzo e AG a tariffa ridotta, Ticino Ticket/AVS/studenti CHF 20 (a/r 25.50). Stagione estiva fino all\'8 novembre 2026.',
  },
  '2653': {
    label: 'Funicolare Monte Brè',
    single: { adult: 17, child: 8.5, half: 8.5 }, ret: { adult: 26, child: 13, half: 13 },
    childMax: 15, childFreeMax: 5, halfPasses: ['half_fare', 'ga'], reducedPasses: [],
    url: 'https://www.montebre.ch/en/fares-timetables/', checked: '2026-09-28',
    note: 'Listino ufficiale Cassarate–Brè vetta: ragazzi 6–15 anni, 0–5 gratis, metà prezzo/AG e AVS a metà.',
  },
};
/**
 * Monte Brè: il biglietto Cassarate–vetta vale per entrambe le sezioni. Se nello stesso
 * viaggio ci sono la prima sezione e la seconda, la prima è compresa nel biglietto intero.
 */
export function mergeBreSections(lines: CostLine[]): CostLine[] {
  const full = lines.find((l) => l.id.startsWith('fare-2653-') && !l.id.startsWith('fare-2653-s-'));
  if (!full) return lines;
  const out: CostLine[] = [];
  for (const l of lines) {
    if (l.id.startsWith('fare-2653-s-')) continue;
    out.push(l === full ? { ...l, note: `Comprende la prima sezione Cassarate–Suvigliana. ${l.note ?? ''}`.trim() } : l);
  }
  return out;
}
const SUVIGLIANA = { adult: 2.2, child: 1.1, url: 'https://www.montebre.ch/en/fares-timetables/', checked: '2026-09-28' };

function ageOf(p: Person): number {
  if (p.kind !== 'child') return 30;
  return ({ '0-5': 4, '6-11': 9, '12-15': 14, '16-17': 17 } as Record<string, number>)[p.ageBand ?? ''] ?? 10;
}

/** Costo di una corsa (o di un'andata e ritorno) su una funicolare con listino ufficiale. */
export function officialFare(short: string, kind: 'single' | 'ret', people: Person[], passes: string[]): { total: number; detail: string } {
  const f = OFFICIAL[short];
  const t = f[kind];
  let total = 0, free = 0, kids = 0;
  for (const p of people) {
    const age = ageOf(p);
    if (age <= f.childFreeMax) { free++; continue; }
    if (age <= f.childMax) { total += t.child; kids++; continue; }
    // lo sconto dell'abbonamento si applica a chi lo possiede: il modulo lo chiede per il gruppo
    total += passes.some((x) => f.halfPasses.includes(x)) ? t.half : passes.some((x) => f.reducedPasses.includes(x)) && t.reduced ? t.reduced : t.adult;
  }
  const parts = [kids ? `${kids} ragazz${kids > 1 ? 'i' : 'o'}` : '', free ? `${free} gratis` : '', passes.some((x) => f.halfPasses.includes(x)) ? 'metà prezzo/AG applicato' : ''].filter(Boolean);
  return { total: Math.round(total * 100) / 100, detail: parts.join(', ') };
}

const RULES: { match: (r: { short: string; mode: TransitMode; agency: string }, hops: number) => boolean; rule: FareRule }[] = [
  { match: (r) => r.mode === 'funicular' && r.short === '2650', rule: { label: 'Funicolare Lugano Città–Stazione', adult: [1.1, 1.5], childFactor: 0.5, note: 'Tariffa indicativa della funicolare cittadina.' } },
  { match: (r, hops) => r.mode === 'boat' && hops <= 2, rule: { label: 'Battello Società Navigazione Lago di Lugano (tratta breve)', adult: [8, 17], childFactor: 0.5, note: 'Stima per tratta breve.' } },
  { match: (r, hops) => r.mode === 'boat' && hops <= 5, rule: { label: 'Battello SNL (tratta media)', adult: [15, 27], childFactor: 0.5, note: 'Stima per tratta media.' } },
  { match: (r) => r.mode === 'boat', rule: { label: 'Battello SNL (tratta lunga)', adult: [25, 40], childFactor: 0.5, note: 'Stima per tratta lunga.' } },
  { match: (r) => r.mode === 'train', rule: { label: 'Biglietto Arcobaleno (treno regionale)', adult: [2.3, 5.4], childFactor: 0.5, note: 'Tariffa indicativa comunità Arcobaleno; dipende dalle zone.' } },
  { match: () => true, rule: { label: 'Biglietto Arcobaleno (bus)', adult: [2.3, 4.6], childFactor: 0.5, note: 'Tariffa indicativa comunità Arcobaleno; dipende dalle zone. Un biglietto può valere per più corse entro la validità.' } },
];

export function rideFare(route: { short: string; mode: TransitMode; agency: string }, hops: number, people: Person[], at: string, passes: string[], stopNames: [string, string] = ['', '']): CostLine {
  const firstSection = stopNames.every((n) => /^(Cassarate|Suvigliana)$/.test(n));
  if (route.mode === 'funicular' && route.short === '2653' && firstSection) {
    // solo la prima sezione Cassarate–Suvigliana
    const kids = people.filter((p) => ageOf(p) > 5 && ageOf(p) <= 15).length, free = people.filter((p) => ageOf(p) <= 5).length;
    const total = Math.round(((people.length - kids - free) * SUVIGLIANA.adult + kids * SUVIGLIANA.child) * 100) / 100;
    return { id: `fare-${route.short}-s-${at}`, label: 'Funicolare Cassarate–Suvigliana', min: total, max: total, status: 'known', essential: true, perPerson: false, at, evidenceStatus: 'verified', note: `Listino ufficiale (${SUVIGLIANA.url}, consultato il ${SUVIGLIANA.checked}).` };
  }
  if (route.mode === 'funicular' && OFFICIAL[route.short]) {
    const f = OFFICIAL[route.short];
    const { total, detail } = officialFare(route.short, 'single', people, passes);
    return {
      id: `fare-${route.short}-${at}`, label: `${f.label} (corsa semplice)`, min: total, max: total, status: 'known', essential: true, perPerson: false, at,
      evidenceStatus: 'verified', note: `${f.note}${detail ? ` (${detail})` : ''} Fonte: ${f.url}, consultata il ${f.checked}.`,
    };
  }
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

/**
 * Se il programma sale e scende con la stessa funicolare, il listino ufficiale di andata e
 * ritorno costa meno di due corse semplici: la prima corsa diventa il biglietto a/r, la
 * seconda risulta inclusa. Le righe restano visibili per trasparenza.
 */
export function applyReturnTickets(lines: CostLine[], people: Person[], passes: string[]): CostLine[] {
  const out = lines.map((l) => ({ ...l }));
  for (const short of Object.keys(OFFICIAL)) {
    const idx = out.map((l, i) => (l.id.startsWith(`fare-${short}-`) && !l.id.startsWith(`fare-${short}-s-`) && l.label.endsWith('(corsa semplice)') ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k + 1 < idx.length; k += 2) {
      const a = out[idx[k]], b = out[idx[k + 1]];
      const { total } = officialFare(short, 'ret', people, passes);
      if (total >= (a.min ?? 0) + (b.min ?? 0)) continue;
      const f = OFFICIAL[short];
      out[idx[k]] = { ...a, label: `${f.label} (andata e ritorno)`, min: total, max: total, note: `Biglietto di andata e ritorno: conviene rispetto a due corse semplici. ${a.note ?? ''}`.trim() };
      out[idx[k + 1]] = { ...b, label: `${f.label} (ritorno incluso)`, min: 0, max: 0, note: 'Compreso nel biglietto di andata e ritorno.' };
    }
  }
  return out;
}
