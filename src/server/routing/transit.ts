/**
 * Motore dei trasporti pubblici su orario GTFS statico: Connection Scan Algorithm.
 * Gli orari GTFS sono relativi a «mezzogiorno meno 12 ore» della giornata di
 * servizio (corretto anche nei giorni di cambio dell'ora legale). Le corse a
 * frequenza (exact_times=0) sono espanse e marcate come orario indicativo.
 */
import { DateTime } from 'luxon';
import { TZ } from '../../shared/types.ts';
import { isoWeekday, addDaysToDate } from '../../shared/time.ts';
import { holidayName } from '../../shared/calendar.ts';

export type TransitMode = 'bus' | 'train' | 'funicular' | 'boat' | 'cable_car';

export interface TransitData {
  source: any;
  agencies: Record<string, { id: string; name: string; url: string }>;
  routes: { id: string; agency: string; short: string; long: string; type: number; mode: TransitMode }[];
  stops: { id: string; name: string; lat: number; lon: number; parent: string; platform: string; modes: TransitMode[]; walkNode: number; walkDistM: number; walkNodeSF: number; walkDistSFM: number }[];
  services: Record<string, { days: number[]; start: string; end: string; add: string[]; remove: string[] }>;
  patterns: { route: string; mode: TransitMode; stops: number[]; segs: number[] }[];
  trips: { p: number; s: string; h: string; n: string; id: string; t: number[]; pk?: number[]; dr?: number[]; f?: { start: number; end: number; headway: number; exact: number }[] }[];
  segments: { mode: TransitMode; coords: number[]; lengthM: number; approx: boolean }[];
  footpaths: [number, number, number, number][];
  /** interscambi percorribili senza gradini né sentieri (passeggino, sedia a rotelle) */
  footpathsSF: [number, number, number, number][];
}

export interface TripInstance {
  trip: number;
  pattern: number;
  /** ms epoch per ogni fermata del pattern: arrivo, partenza */
  arr: Float64Array;
  dep: Float64Array;
  frequencyBased: boolean;
  headwaySec?: number;
  serviceDate: string;
  /** giornata dell'orario usata come riferimento quando la data non è coperta dal feed */
  referenceDate?: string;
}

interface ConnectionSet {
  key: string;
  dep: Float64Array;
  arr: Float64Array;
  from: Int32Array;
  to: Int32Array;
  inst: Int32Array; // indice istanza di corsa
  hop: Int32Array;  // indice della fermata di partenza nel pattern
  instances: TripInstance[];
}

export interface CsaOptions {
  modes: Set<TransitMode>;
  /** usa solo interscambi senza gradini */
  stepFree?: boolean;
  /** fermate dove il gruppo non può salire né scendere (es. non accessibili in sedia a rotelle) */
  blockedStops?: Set<number>;
  /** secondi minimi di cambio fra due corse (oltre al cammino) */
  minChangeSec: number;
  maxDurationSec: number;
}

export interface CsaResult {
  arrival: Float64Array;
  ready: Float64Array;
  /** come si è raggiunta la fermata: -1 sorgente, >=0 connessione di uscita; -2 - k = interscambio a piedi dalla fermata k */
  via: Int32Array;
  enter: Int32Array; // connessione di salita per la corsa che ha raggiunto la fermata
  walkSec: Float64Array; // durata del cammino di interscambio
  conns: ConnectionSet;
  departAt: number;
}

function ymd(date: string) { return date.replace(/-/g, ''); }

export class TransitNetwork {
  readonly d: TransitData;
  readonly routeById: Map<string, TransitData['routes'][number]>;
  private footOut: [number, number][][];
  private footOutSF: [number, number][][];
  private connCache = new Map<string, ConnectionSet>();
  /** servizi attivi per data (le corse sono decine di migliaia, i servizi poche centinaia) */
  private activeCache = new Map<string, Map<string, boolean>>();

  constructor(d: TransitData) {
    this.d = d;
    this.routeById = new Map(d.routes.map((r) => [r.id, r]));
    this.footOut = d.stops.map(() => []);
    for (const [a, b, sec] of d.footpaths) this.footOut[a].push([b, sec]);
    this.footOutSF = d.stops.map(() => []);
    for (const [a, b, sec] of d.footpathsSF ?? []) this.footOutSF[a].push([b, sec]);
  }

  get feedVersion(): string { return String(this.d.source.feedVersion); }
  get feedRange(): { start: string; end: string } { return { start: this.d.source.feedStart, end: this.d.source.feedEnd }; }

  /** La data è coperta dal periodo di validità del feed? */
  covers(date: string): boolean {
    const x = ymd(date);
    return x >= this.d.source.feedStart && x <= this.d.source.feedEnd;
  }

  /**
   * Giornata dell'orario da usare per una data. Se la data è coperta dal feed è la data stessa.
   * Altrimenti (per esempio dopo il cambio d'orario di dicembre, prima che il nuovo orario sia
   * importato) si usa lo stesso giorno della settimana 52 settimane prima o dopo, nella stessa
   * stagione, con i festivi abbinati ai festivi: è una stima dichiarata, mai l'orario ufficiale.
   */
  referenceDate(date: string): string | null {
    if (this.covers(date)) return date;
    const dir = ymd(date) > this.d.source.feedEnd ? -1 : 1;
    const holiday = holidayName(date) != null || isoWeekday(date) === 7;
    for (let k = 1; k <= 3; k++) {
      let ref = addDaysToDate(date, dir * 364 * k);
      // un festivo si confronta con una domenica, un feriale con un feriale non festivo
      if (holiday && isoWeekday(ref) !== 7) ref = addDaysToDate(ref, 7 - isoWeekday(ref));
      else if (!holiday && holidayName(ref)) ref = addDaysToDate(ref, dir * 7);
      if (this.covers(ref)) return ref;
    }
    return null;
  }

  serviceActive(sid: string, date: string): boolean {
    let byService = this.activeCache.get(date);
    if (!byService) {
      if (this.activeCache.size > 60) this.activeCache.clear();
      byService = new Map();
      this.activeCache.set(date, byService);
    }
    let v = byService.get(sid);
    if (v === undefined) { v = this.computeServiceActive(sid, date); byService.set(sid, v); }
    return v;
  }

  private computeServiceActive(sid: string, date: string): boolean {
    const s = this.d.services[sid];
    if (!s) return false;
    const x = ymd(date);
    if (s.remove.includes(x)) return false;
    if (s.add.includes(x)) return true;
    if (!s.start || x < s.start || x > s.end) return false;
    return s.days[isoWeekday(date) - 1] === 1;
  }

  /** Istante di riferimento GTFS: mezzogiorno locale meno 12 ore. */
  static serviceBase(date: string): number {
    const [y, m, d] = date.split('-').map(Number);
    return DateTime.fromObject({ year: y, month: m, day: d, hour: 12 }, { zone: TZ }).minus({ hours: 12 }).toMillis();
  }

  private instancesFor(date: string, from: number, to: number, modes: Set<TransitMode>): TripInstance[] {
    const out: TripInstance[] = [];
    const svcDate = this.referenceDate(date);
    if (!svcDate) return out;
    const referenceDate = svcDate === date ? undefined : svcDate;
    // gli orari restano relativi alla data reale (ora legale compresa); cambia solo quali corse circolano
    const base = TransitNetwork.serviceBase(date);
    this.d.trips.forEach((t, ti) => {
      const pat = this.d.patterns[t.p];
      if (!modes.has(pat.mode)) return;
      if (!this.serviceActive(t.s, svcDate)) return;
      const n = pat.stops.length;
      const make = (shiftSec: number, freq?: { headway: number }) => {
        const arr = new Float64Array(n), dep = new Float64Array(n);
        for (let i = 0; i < n; i++) { arr[i] = base + (t.t[i * 2] + shiftSec) * 1000; dep[i] = base + (t.t[i * 2 + 1] + shiftSec) * 1000; }
        if (dep[0] > to || arr[n - 1] < from) return;
        out.push({ trip: ti, pattern: t.p, arr, dep, frequencyBased: !!freq, headwaySec: freq?.headway, serviceDate: date, referenceDate });
      };
      if (t.f && t.f.length) {
        const first = t.t[1];
        for (const f of t.f) {
          for (let s = f.start; s < f.end; s += f.headway) make(s - first, f.exact ? undefined : { headway: f.headway });
        }
      } else make(0);
    });
    return out;
  }

  /**
   * Connessioni di una giornata (dalle 00:00 locali della data di `from` per 32 ore),
   * ordinate per partenza. In cache per data e modi: tutte le interrogazioni di un
   * piano riusano lo stesso insieme.
   */
  connections(from: number, _to: number, modes: Set<TransitMode>): ConnectionSet {
    const date = DateTime.fromMillis(from, { zone: TZ }).toFormat('yyyy-MM-dd');
    const key = `${date}|${[...modes].sort().join(',')}`;
    const hit = this.connCache.get(key);
    if (hit) return hit;
    const winFrom = DateTime.fromISO(date, { zone: TZ }).toMillis();
    const winTo = winFrom + 32 * 3600_000;
    const instances: TripInstance[] = [];
    for (const d of [-1, 0, 1].map((k) => DateTime.fromISO(date, { zone: TZ }).plus({ days: k }).toFormat('yyyy-MM-dd'))) {
      instances.push(...this.instancesFor(d, winFrom, winTo, modes));
    }
    const list: [number, number, number, number, number, number][] = [];
    instances.forEach((inst, k) => {
      const pat = this.d.patterns[inst.pattern];
      for (let i = 0; i + 1 < pat.stops.length; i++) {
        if (inst.dep[i] < winFrom || inst.dep[i] > winTo) continue;
        list.push([inst.dep[i], inst.arr[i + 1], pat.stops[i], pat.stops[i + 1], k, i]);
      }
    });
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const n = list.length;
    const cs: ConnectionSet = {
      key, instances,
      dep: new Float64Array(n), arr: new Float64Array(n), from: new Int32Array(n), to: new Int32Array(n), inst: new Int32Array(n), hop: new Int32Array(n),
    };
    list.forEach((c, i) => { cs.dep[i] = c[0]; cs.arr[i] = c[1]; cs.from[i] = c[2]; cs.to[i] = c[3]; cs.inst[i] = c[4]; cs.hop[i] = c[5]; });
    if (this.connCache.size > 12) this.connCache.delete(this.connCache.keys().next().value!);
    this.connCache.set(key, cs);
    return cs;
  }

  /**
   * CSA uno-a-tutti. `sources`: fermate raggiungibili a piedi con istante di arrivo (ms).
   * `targetBound`: se fornito, interrompe quando le partenze superano il miglior arrivo possibile.
   */
  csa(sources: { stop: number; at: number }[], departAt: number, opts: CsaOptions, targetBound?: () => number): CsaResult {
    const nStops = this.d.stops.length;
    const conns = this.connections(departAt, departAt + opts.maxDurationSec * 1000, opts.modes);
    const arrival = new Float64Array(nStops).fill(Infinity);
    const ready = new Float64Array(nStops).fill(Infinity);
    const via = new Int32Array(nStops).fill(-9);
    const enter = new Int32Array(nStops).fill(-1);
    const walkSec = new Float64Array(nStops);
    const boarded = new Int32Array(conns.instances.length).fill(-1);
    for (const s of sources) {
      if (s.at < arrival[s.stop]) { arrival[s.stop] = s.at; ready[s.stop] = s.at; via[s.stop] = -1; }
    }
    // interscambi iniziali a piedi dalle sorgenti
    for (const s of sources) for (const [b, sec] of (opts.stepFree ? this.footOutSF : this.footOut)[s.stop]) {
      const t = s.at + sec * 1000;
      if (t < arrival[b]) { arrival[b] = t; ready[b] = t; via[b] = -2 - s.stop; walkSec[b] = sec; }
    }
    const trips = this.d.trips;
    const footOut = opts.stepFree ? this.footOutSF : this.footOut;
    // ricerca binaria della prima connessione utile
    let lo = 0, hi = conns.dep.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (conns.dep[mid] < departAt) lo = mid + 1; else hi = mid; }
    const changeMs = opts.minChangeSec * 1000;
    const horizon = departAt + opts.maxDurationSec * 1000;
    for (let c = lo; c < conns.dep.length; c++) {
      const dep = conns.dep[c];
      if (dep > horizon) break;
      if (targetBound && dep > targetBound()) break;
      const inst = conns.inst[c];
      const from = conns.from[c], to = conns.to[c];
      const hop = conns.hop[c];
      const t = trips[conns.instances[inst].trip];
      if (boarded[inst] < 0) {
        const canBoard = ready[from] <= dep && !(t.pk && t.pk[hop] === 1) && !opts.blockedStops?.has(from);
        if (!canBoard) continue;
        boarded[inst] = c;
      }
      const arr = conns.arr[c];
      if (t.dr && t.dr[hop + 1] === 1) continue; // discesa non consentita
      if (opts.blockedStops?.has(to)) continue; // fermata non utilizzabile dal gruppo: si prosegue a bordo
      if (arr < arrival[to]) {
        arrival[to] = arr;
        ready[to] = Math.min(ready[to], arr + changeMs);
        via[to] = c;
        enter[to] = boarded[inst];
        for (const [b, sec] of footOut[to]) {
          const tw = arr + sec * 1000;
          if (tw < arrival[b]) { arrival[b] = tw; ready[b] = tw + changeMs / 2; via[b] = -2 - to; walkSec[b] = sec; }
        }
      }
    }
    return { arrival, ready, via, enter, walkSec, conns, departAt };
  }

  /** Ricostruisce la sequenza di corse e interscambi fino alla fermata `stop`. */
  reconstruct(res: CsaResult, stop: number): JourneyPart[] | null {
    const parts: JourneyPart[] = [];
    let cur = stop;
    for (let guard = 0; guard < 20; guard++) {
      const v = res.via[cur];
      if (v === -1) return parts.reverse();
      if (v === -9) return null;
      if (v <= -2) {
        const from = -2 - v;
        parts.push({ kind: 'transfer', fromStop: from, toStop: cur, seconds: res.walkSec[cur] });
        cur = from;
        continue;
      }
      const exitC = v, enterC = res.enter[cur];
      const inst = res.conns.instances[res.conns.inst[exitC]];
      parts.push({
        kind: 'ride', instance: inst,
        fromHop: res.conns.hop[enterC], toHop: res.conns.hop[exitC] + 1,
        fromStop: res.conns.from[enterC], toStop: cur,
        dep: res.conns.dep[enterC], arr: res.conns.arr[exitC],
      });
      cur = res.conns.from[enterC];
    }
    return null;
  }

  /** Prossime partenze dello stesso pattern dalla stessa fermata (per «ultima corsa» e «E se perdiamo il bus»). */
  departuresFrom(patternIdx: number, hop: number, from: number, to: number): { dep: number; frequencyBased: boolean }[] {
    const out: { dep: number; frequencyBased: boolean }[] = [];
    const d0 = DateTime.fromMillis(from, { zone: TZ }).minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const d1 = DateTime.fromMillis(to, { zone: TZ }).toFormat('yyyy-MM-dd');
    const modes = new Set<TransitMode>([this.d.patterns[patternIdx].mode]);
    for (let d = d0; d <= d1; d = DateTime.fromISO(d, { zone: TZ }).plus({ days: 1 }).toFormat('yyyy-MM-dd')) {
      for (const inst of this.instancesFor(d, from, to, modes)) {
        if (inst.pattern !== patternIdx) continue;
        const dep = inst.dep[hop];
        if (dep >= from && dep <= to) out.push({ dep, frequencyBased: inst.frequencyBased });
      }
    }
    return out.sort((a, b) => a.dep - b.dep);
  }

  /** Ultima partenza della giornata di servizio da una fermata verso un'altra (qualsiasi corsa diretta). */
  lastDirectDeparture(fromStop: number, toStop: number, date: string, modes: Set<TransitMode>): number | null {
    let best: number | null = null;
    for (const d of [date]) {
      const base = TransitNetwork.serviceBase(d);
      for (const inst of this.instancesFor(d, base, base + 30 * 3600_000, modes)) {
        const pat = this.d.patterns[inst.pattern];
        const i = pat.stops.indexOf(fromStop);
        if (i < 0) continue;
        const j = pat.stops.indexOf(toStop, i + 1);
        if (j < 0) continue;
        if (best == null || inst.dep[i] > best) best = inst.dep[i];
      }
    }
    return best;
  }

  segmentCoords(seg: number): [number, number][] {
    const s = this.d.segments[seg];
    const out: [number, number][] = [];
    for (let i = 0; i < s.coords.length; i += 2) out.push([s.coords[i] / 1e6, s.coords[i + 1] / 1e6]);
    return out;
  }
}

export type JourneyPart =
  | { kind: 'transfer'; fromStop: number; toStop: number; seconds: number }
  | { kind: 'ride'; instance: TripInstance; fromHop: number; toHop: number; fromStop: number; toStop: number; dep: number; arr: number };
