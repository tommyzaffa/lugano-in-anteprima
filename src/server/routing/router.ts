/**
 * Router multimodale: cammino reale sul grafo OSM + orario GTFS (CSA).
 * Produce Trip composti da tratte a modalità singola, contigue nel tempo,
 * sempre con geometria reale (mai linee rette attraverso edifici o acqua).
 */
import { Graph, haversine } from './graph.ts';
import { TransitNetwork, type TransitMode, type CsaOptions, type JourneyPart } from './transit.ts';
import { walkCost, edgeTime, type WalkProfile } from './walk.ts';
import { EdgeFlag } from '../../shared/graph-format.ts';
import type { RouteLeg, Trip, LegPoint, LegMode, CostLine, Person, TransitInfo } from '../../shared/types.ts';
import { isoFromMs } from '../../shared/time.ts';
import { rideFare, mergeBreSections } from '../catalog/fares.ts';

export interface WalkResult {
  coords: [number, number][];
  lengthM: number;
  upM: number;
  downM: number;
  seconds: number;
  hike: boolean;
  flags: RouteLeg['flags'];
  streets: string[];
  stepsCount: number;
}

export interface TravelOptions {
  profile: WalkProfile;
  modes: Set<TransitMode>;
  minChangeSec: number;
  boardMarginSec: number;
  /** oltre questa durata a piedi si preferiscono i mezzi, se esistono */
  comfortableWalkSec: number;
  people: Person[];
  passes: string[];
  /** peso del tempo a piedi rispetto al tempo sui mezzi (ritmo) */
  walkWeight: number;
}

const MAX_SNAP_M = 350;

export class Router {
  readonly walkG: Graph;
  readonly transit: TransitNetwork;
  private stopsByNode = new Map<number, number[]>();
  private stopsByNodeSF = new Map<number, number[]>();
  private accessCache = new Map<string, Map<number, number>>();
  private walkCache = new Map<string, WalkResult | null>();

  constructor(walkG: Graph, transit: TransitNetwork) {
    this.walkG = walkG;
    this.transit = transit;
    transit.d.stops.forEach((s, i) => {
      if (s.walkNode >= 0) (this.stopsByNode.get(s.walkNode) ?? this.stopsByNode.set(s.walkNode, []).get(s.walkNode)!).push(i);
      if (s.walkNodeSF >= 0) (this.stopsByNodeSF.get(s.walkNodeSF) ?? this.stopsByNodeSF.set(s.walkNodeSF, []).get(s.walkNodeSF)!).push(i);
    });
  }

  private stepFree(p: WalkProfile) { return p.steps === 'forbidden'; }

  snap(lon: number, lat: number, profile: WalkProfile): { node: number; cost: number; distM: number }[] {
    const cost = walkCost(profile);
    const near = this.walkG.nearest(lon, lat, 12, MAX_SNAP_M).filter((n) => this.walkG.usable(n.node, cost));
    if (!near.length) return [];
    const best = near[0].distM;
    return near.filter((n) => n.distM <= best + 60).slice(0, 4).map((n) => ({ node: n.node, distM: n.distM, cost: n.distM / profile.speed }));
  }

  /** Percorso a piedi reale fra due punti. */
  walk(a: { lon: number; lat: number }, b: { lon: number; lat: number }, profile: WalkProfile, maxSec = 6 * 3600): WalkResult | null {
    const key = `${a.lon.toFixed(5)},${a.lat.toFixed(5)}>${b.lon.toFixed(5)},${b.lat.toFixed(5)}|${profile.id}`;
    if (this.walkCache.has(key)) return this.walkCache.get(key)!;
    const res = this.walkUncached(a, b, profile, maxSec);
    if (this.walkCache.size > 20000) this.walkCache.clear();
    this.walkCache.set(key, res);
    return res;
  }

  private walkUncached(a: { lon: number; lat: number }, b: { lon: number; lat: number }, profile: WalkProfile, maxSec: number): WalkResult | null {
    const direct = haversine(a.lon, a.lat, b.lon, b.lat);
    if (direct < 25) {
      return { coords: [[a.lon, a.lat], [b.lon, b.lat]], lengthM: direct, upM: 0, downM: 0, seconds: direct / profile.speed, hike: false, flags: { stairs: false, trail: false, unpaved: false, noSidewalkInfo: false, steep: false, strollerOk: 'unknown' }, streets: [], stepsCount: 0 };
    }
    const sa = this.snap(a.lon, a.lat, profile), sb = this.snap(b.lon, b.lat, profile);
    if (!sa.length || !sb.length) return null;
    const cost = walkCost(profile);
    const path = this.walkG.astar(sa, sb, cost, profile.speed * 1.6, maxSec * 2.5);
    if (!path) return null;
    let seconds = 0, trailM = 0, stepsCount = 0;
    const flags: RouteLeg['flags'] = { stairs: false, trail: false, unpaved: false, noSidewalkInfo: false, steep: false, strollerOk: 'yes' };
    const streets: string[] = [];
    for (const { index, forward } of path.edges) {
      const e = this.walkG.edgeView(index, forward);
      seconds += edgeTime(profile, e);
      if (e.flags & EdgeFlag.STEPS) { flags.stairs = true; stepsCount++; }
      if (e.sac >= 2) { flags.trail = true; trailM += e.lengthM; }
      if (e.flags & EdgeFlag.UNPAVED) flags.unpaved = true;
      if (e.flags & EdgeFlag.ROAD_NO_SIDEWALK_INFO) flags.noSidewalkInfo = true;
      if (e.flags & EdgeFlag.STEEP) flags.steep = true;
      if (e.name && streets[streets.length - 1] !== e.name) streets.push(e.name);
    }
    const sNode = path.nodes[0], tNode = path.nodes[path.nodes.length - 1];
    const accessA = haversine(a.lon, a.lat, this.walkG.lon[sNode], this.walkG.lat[sNode]);
    const accessB = haversine(b.lon, b.lat, this.walkG.lon[tNode], this.walkG.lat[tNode]);
    seconds += (accessA + accessB) / profile.speed;
    // passeggino: sì solo se niente scale/sentieri e fondo pavimentato; altrimenti no o ignoto
    flags.strollerOk = flags.stairs || flags.trail ? 'no' : flags.unpaved || flags.steep ? 'unknown' : 'yes';
    const lengthM = path.lengthM + accessA + accessB;
    const hike = trailM > 300 || (path.upM > 250 && trailM > 100);
    return {
      coords: [[a.lon, a.lat], ...path.coords, [b.lon, b.lat]],
      lengthM, upM: path.upM, downM: path.downM, seconds, hike, flags, streets: streets.slice(0, 12), stepsCount,
    };
  }

  /** Fermate raggiungibili a piedi da un punto, con tempo in secondi (raggio adattivo). */
  accessStops(p: { lon: number; lat: number }, profile: WalkProfile, baseMaxSec = 900): Map<number, number> {
    const key = `${p.lon.toFixed(5)},${p.lat.toFixed(5)}|${profile.id}|${baseMaxSec}`;
    const hit = this.accessCache.get(key);
    if (hit) return hit;
    const src = this.snap(p.lon, p.lat, profile);
    const out = new Map<number, number>();
    if (src.length) {
      const byNode = this.stepFree(profile) ? this.stopsByNodeSF : this.stopsByNode;
      const collect = (dist: Map<number, number>) => {
        out.clear();
        for (const [node, sec] of dist) {
          const ss = byNode.get(node);
          if (!ss) continue;
          for (const s of ss) {
            const st = this.transit.d.stops[s];
            const extra = (this.stepFree(profile) ? st.walkDistSFM : st.walkDistM) / profile.speed;
            const t = sec + extra;
            if (t < (out.get(s) ?? Infinity)) out.set(s, t);
          }
        }
      };
      const cost = walkCost(profile);
      let maxSec = baseMaxSec;
      collect(this.walkG.dijkstra(src, cost, maxSec));
      // luoghi isolati (vette, sentieri): allarga il raggio finché si trova qualche fermata
      while (out.size < 2 && maxSec < 3 * 3600) {
        maxSec *= 2;
        collect(this.walkG.dijkstra(src, cost, maxSec));
      }
    }
    if (this.accessCache.size > 5000) this.accessCache.clear();
    this.accessCache.set(key, out);
    return out;
  }

  csaOptions(o: TravelOptions): CsaOptions {
    return { modes: o.modes, minChangeSec: o.minChangeSec, maxDurationSec: 4 * 3600, stepFree: this.stepFree(o.profile) };
  }

  /** Stima veloce uno-a-tutti: istante di arrivo (ms) a ogni fermata partendo da un punto. */
  oneToAll(a: { lon: number; lat: number }, departAt: number, o: TravelOptions) {
    const access = this.accessStops(a, o.profile);
    const sources = [...access].map(([stop, sec]) => ({ stop, at: departAt + (sec + o.boardMarginSec) * 1000 }));
    return this.transit.csa(sources, departAt, this.csaOptions(o));
  }

  /**
   * Miglior spostamento fra due punti partendo non prima di `departAt`.
   * Confronta il solo cammino con le combinazioni di mezzi; restituisce null se
   * nessuna soluzione è praticabile.
   */
  trip(from: LegPoint, to: LegPoint, departAt: number, o: TravelOptions, idx: { fromStop: number; toStop: number }): Trip | null {
    const walkRes = this.walk(from, to, o.profile);
    const candidates: { trip: Trip; score: number }[] = [];
    if (walkRes) {
      const t = this.walkTrip(from, to, departAt, walkRes, o, idx);
      const overshoot = Math.max(0, walkRes.seconds - o.comfortableWalkSec);
      candidates.push({ trip: t, score: walkRes.seconds * o.walkWeight + overshoot * 1.5 });
    }
    const tr = o.modes.size ? this.transitTrip(from, to, departAt, o, idx) : null;
    if (tr) {
      const dur = (Date.parse(tr.arrival) - departAt) / 1000;
      const walkSec = tr.legs.filter((l) => l.mode === 'walk' || l.mode === 'hike').reduce((s, l) => s + l.durationMin * 60, 0);
      candidates.push({ trip: tr, score: dur + tr.summary.rides * 150 + walkSec * (o.walkWeight - 1) });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0].trip;
    best.alternatives = candidates.slice(1).map((c) => ({ mode: c.trip.summary.label, durationMin: c.trip.summary.durationMin, walkM: c.trip.summary.walkM }));
    return best;
  }

  walkTrip(from: LegPoint, to: LegPoint, departAt: number, w: WalkResult, o: TravelOptions, idx: { fromStop: number; toStop: number }): Trip {
    const leg = this.walkLeg(from, to, departAt, w);
    return this.assemble([leg], from, to, idx);
  }

  private walkLeg(from: LegPoint, to: LegPoint, departAt: number, w: WalkResult): RouteLeg {
    const arr = departAt + w.seconds * 1000;
    const notes: string[] = [];
    if (w.hike) notes.push('Escursione su sentiero: tempi e dislivelli stimati; condizioni del sentiero non verificate.');
    if (w.flags.stairs) notes.push(`Il percorso include scalinate (${w.stepsCount} tratti).`);
    if (w.flags.noSidewalkInfo) notes.push('Alcuni tratti su strade principali senza dati sul marciapiede.');
    return {
      id: `walk-${departAt}-${Math.round(w.lengthM)}`,
      mode: w.hike ? 'hike' : 'walk',
      from, to,
      departure: isoFromMs(departAt), arrival: isoFromMs(arr),
      durationMin: Math.round(w.seconds / 6) / 10,
      distanceM: Math.round(w.lengthM),
      ascentM: Math.round(w.upM), descentM: Math.round(w.downM),
      geometry: w.coords.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6] as [number, number]),
      flags: w.flags,
      streets: w.streets,
      source: { id: 'routing', label: 'Percorso calcolato sulla rete pedonale OSM', freshness: 'computed' },
      notes,
    };
  }

  private waitLeg(at: LegPoint, from: number, to: number): RouteLeg {
    return {
      id: `wait-${from}`, mode: 'wait', from: at, to: at,
      departure: isoFromMs(from), arrival: isoFromMs(to), durationMin: Math.round((to - from) / 6000) / 10,
      distanceM: 0, geometry: [[at.lon, at.lat]],
      flags: { stairs: false, trail: false, unpaved: false, noSidewalkInfo: false, steep: false, strollerOk: 'yes' },
      source: { id: 'routing', label: 'Attesa', freshness: 'computed' }, notes: [],
    };
  }

  private stopPoint(i: number): LegPoint {
    const s = this.transit.d.stops[i];
    return { label: s.name, lon: s.lon, lat: s.lat, stopId: s.id };
  }

  /** Esegue la CSA e sceglie la fermata d'uscita pesando il cammino finale. */
  private bestJourney(from: LegPoint, to: LegPoint, departAt: number, o: TravelOptions): { parts: JourneyPart[]; arrival: number; egressSec: number } | null {
    const access = this.accessStops(from, o.profile);
    const egress = this.accessStops(to, o.profile);
    if (!access.size || !egress.size) return null;
    const sources = [...access].map(([stop, sec]) => ({ stop, at: departAt + (sec + o.boardMarginSec) * 1000 }));
    let bound = Infinity;
    const res = this.transit.csa(sources, departAt, this.csaOptions(o), () => bound);
    const W = o.walkWeight + 0.4;
    let best: { parts: JourneyPart[]; arrival: number; egressSec: number; score: number } | null = null;
    const ranked = [...egress].filter(([stop]) => Number.isFinite(res.arrival[stop]) && res.via[stop] !== -1 && res.via[stop] !== -9)
      .map(([stop, sec]) => ({ stop, sec, score: res.arrival[stop] + sec * 1000 * W }))
      .sort((a, b) => a.score - b.score);
    for (const c of ranked.slice(0, 12)) {
      const parts = this.transit.reconstruct(res, c.stop);
      if (!parts || !parts.some((p) => p.kind === 'ride')) continue;
      best = { parts, arrival: res.arrival[c.stop] + c.sec * 1000, egressSec: c.sec, score: c.score };
      break;
    }
    return best;
  }

  /**
   * Elimina gli «avanti e indietro»: se una corsa riporta il gruppo indietro e la corsa successiva
   * ripassa dalla fermata in cui era salito prima (es. scendere in funicolare per poi risalire
   * sulla stessa linea), si sale direttamente sulla seconda corsa in quella fermata: stesso arrivo,
   * meno corse e un biglietto in meno.
   */
  private removeBacktracks(parts: JourneyPart[]): JourneyPart[] {
    const out = parts.slice();
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < out.length; i++) {
        const r1 = out[i];
        if (r1.kind !== 'ride') continue;
        let j = i + 1;
        while (j < out.length && out[j].kind === 'transfer') j++;
        const r2 = out[j];
        if (!r2 || r2.kind !== 'ride') continue;
        const stops = this.transit.d.patterns[r2.instance.pattern].stops;
        // la seconda corsa ripassa (dopo la sua salita) dalla fermata dove era iniziata la prima
        for (let h = r2.fromHop + 1; h < r2.toHop; h++) {
          if (stops[h] !== r1.fromStop || r2.instance.dep[h] < r1.dep) continue;
          out.splice(i, j - i + 1, { ...r2, fromHop: h, fromStop: r1.fromStop, dep: r2.instance.dep[h] });
          changed = true;
          break;
        }
        if (changed) break;
      }
    }
    return out;
  }

  /** Elimina corse superflue all'inizio o alla fine quando camminare è equivalente. */
  private simplify(parts0: JourneyPart[], from: LegPoint, to: LegPoint, departAt: number, arrival: number, o: TravelOptions): JourneyPart[] {
    const parts = this.removeBacktracks(parts0);
    const rides = parts.map((p, i) => [p, i] as const).filter(([p]) => p.kind === 'ride') as [Extract<JourneyPart, { kind: 'ride' }>, number][];
    if (rides.length <= 1) return parts;
    let startIdx = 0;
    for (let k = rides.length - 1; k > 0; k--) {
      const [r, i] = rides[k];
      const w = this.walk(from, this.stopPoint(r.fromStop), o.profile);
      if (w && w.seconds <= Math.max(15 * 60, o.comfortableWalkSec * 0.6) && departAt + (w.seconds + o.boardMarginSec) * 1000 <= r.dep) { startIdx = i; break; }
    }
    let endIdx = parts.length - 1;
    for (let k = 0; k < rides.length - 1; k++) {
      const [r, i] = rides[k];
      if (i < startIdx) continue;
      const w = this.walk(this.stopPoint(r.toStop), to, o.profile);
      if (w && w.seconds <= 15 * 60 && r.arr + w.seconds * 1000 <= arrival + 4 * 60_000) { endIdx = i; break; }
    }
    return parts.slice(startIdx, endIdx + 1);
  }

  transitTrip(from: LegPoint, to: LegPoint, departAt: number, o: TravelOptions, idx: { fromStop: number; toStop: number }): Trip | null {
    const first = this.bestJourney(from, to, departAt, o);
    if (!first) return null;
    // partenza più tardiva possibile con lo stesso arrivo: meno attese in fermata
    let chosen = first, dep = departAt;
    for (let step = 0; step < 6; step++) {
      const firstRide = chosen.parts.find((p) => p.kind === 'ride') as Extract<JourneyPart, { kind: 'ride' }>;
      const waitAtFirst = firstRide.dep - dep;
      if (waitAtFirst < 20 * 60_000) break;
      const tryDep = dep + Math.min(waitAtFirst - 10 * 60_000, 30 * 60_000);
      const alt = this.bestJourney(from, to, tryDep, o);
      if (!alt || alt.arrival > first.arrival + 60_000) break;
      chosen = alt; dep = tryDep;
    }
    let parts = this.simplify(chosen.parts, from, to, dep, chosen.arrival, o);
    while (parts.length && parts[0].kind === 'transfer') parts.shift();
    while (parts.length && parts[parts.length - 1].kind === 'transfer') parts.pop();
    if (!parts.some((p) => p.kind === 'ride')) return null;
    const firstRide = parts.find((p) => p.kind === 'ride') as Extract<JourneyPart, { kind: 'ride' }>;
    const legs: RouteLeg[] = [];
    // cammino fino alla prima fermata: si parte il più tardi possibile per non attendere in fermata
    const boardStop = this.stopPoint(firstRide.fromStop);
    const w0 = this.walk(from, boardStop, o.profile);
    if (!w0) return null;
    const leaveAt = Math.max(departAt, firstRide.dep - (w0.seconds + o.boardMarginSec) * 1000);
    let clock = leaveAt;
    if (w0.lengthM > 15) { const l = this.walkLeg(from, boardStop, clock, w0); legs.push(l); clock = Date.parse(l.arrival); }
    for (const p of parts) {
      if (p.kind === 'transfer') {
        const a = this.stopPoint(p.fromStop), b = this.stopPoint(p.toStop);
        const w = this.walk(a, b, o.profile);
        if (w && w.lengthM > 15) { const l = this.walkLeg(a, b, clock, w); legs.push(l); clock = Date.parse(l.arrival); }
        continue;
      }
      const sp = this.stopPoint(p.fromStop);
      if (clock > p.dep) return null; // coincidenza non raggiungibile col cammino reale
      if (p.dep > clock + 30_000) legs.push(this.waitLeg(sp, clock, p.dep));
      legs.push(this.rideLeg(p, o));
      clock = p.arr;
    }
    const lastRide = [...parts].reverse().find((p) => p.kind === 'ride') as Extract<JourneyPart, { kind: 'ride' }>;
    const lastStop = this.stopPoint(lastRide.toStop);
    const w1 = this.walk(lastStop, to, o.profile);
    if (!w1) return null;
    if (w1.lengthM > 15) legs.push(this.walkLeg(lastStop, to, clock, w1));
    return this.assemble(legs, from, to, idx);
  }

  private rideLeg(p: Extract<JourneyPart, { kind: 'ride' }>, o: TravelOptions): RouteLeg {
    const inst = p.instance;
    const pat = this.transit.d.patterns[inst.pattern];
    const trip = this.transit.d.trips[inst.trip];
    const route = this.transit.routeById.get(pat.route)!;
    const agency = this.transit.d.agencies[route.agency]?.name ?? route.agency;
    const geometry: [number, number][] = [];
    let lengthM = 0, approx = false;
    for (let h = p.fromHop; h < p.toHop; h++) {
      const seg = pat.segs[h];
      const c = this.transit.segmentCoords(seg);
      lengthM += this.transit.d.segments[seg].lengthM;
      if (this.transit.d.segments[seg].approx) approx = true;
      for (let i = geometry.length ? 1 : 0; i < c.length; i++) geometry.push(c[i]);
    }
    const stops: TransitInfo['stops'] = [];
    for (let h = p.fromHop; h <= p.toHop; h++) {
      const s = this.transit.d.stops[pat.stops[h]];
      stops.push({ name: s.name, time: isoFromMs(h === p.fromHop ? inst.dep[h] : inst.arr[h]), lon: s.lon, lat: s.lat });
    }
    const mode = pat.mode as LegMode;
    const notes: string[] = [];
    if (inst.frequencyBased) notes.push(`Servizio a cadenza (circa ogni ${Math.round((inst.headwaySec ?? 0) / 60)} min): orario indicativo.`);
    if (approx) notes.push('Parte della geometria della tratta è approssimata (non ricostruita sulla rete).');
    const hops = p.toHop - p.fromHop;
    const fare = rideFare({ short: route.short, mode: pat.mode, agency }, hops, o.people, isoFromMs(p.dep), o.passes, [this.transit.d.stops[p.fromStop].name, this.transit.d.stops[p.toStop].name]);
    const transit: TransitInfo = {
      routeShort: route.short, routeLong: route.long, agency, headsign: trip.h, tripId: trip.id,
      frequencyBased: inst.frequencyBased, stops, mode: pat.mode,
    };
    return {
      id: `ride-${trip.id}-${p.dep}`,
      mode,
      from: this.stopPoint(p.fromStop), to: this.stopPoint(p.toStop),
      departure: isoFromMs(p.dep), arrival: isoFromMs(p.arr),
      durationMin: Math.round((p.arr - p.dep) / 6000) / 10,
      distanceM: Math.round(lengthM),
      geometry,
      flags: { stairs: false, trail: false, unpaved: false, noSidewalkInfo: false, steep: false, strollerOk: 'unknown' },
      transit: [transit],
      source: { id: 'gtfs-ch', label: `Orario ufficiale GTFS ${this.transit.feedVersion} (statico)`, freshness: 'static_timetable', feedVersion: this.transit.feedVersion },
      cost: [fare],
      notes,
    };
  }

  assemble(legs: RouteLeg[], from: LegPoint, to: LegPoint, idx: { fromStop: number; toStop: number }): Trip {
    const dep = legs[0].departure, arr = legs[legs.length - 1].arrival;
    const moving = legs.filter((l) => l.mode !== 'wait');
    const rides = legs.filter((l) => l.transit);
    const walkM = legs.filter((l) => l.mode === 'walk' || l.mode === 'hike').reduce((s, l) => s + l.distanceM, 0);
    const ascentM = legs.reduce((s, l) => s + (l.ascentM ?? 0), 0);
    const descentM = legs.reduce((s, l) => s + (l.descentM ?? 0), 0);
    const main = rides.length ? rides.reduce((a, b) => (b.durationMin > a.durationMin ? b : a)).mode : (moving.some((l) => l.mode === 'hike') ? 'hike' : 'walk');
    const hikeM = legs.filter((l) => l.mode === 'hike').reduce((a, l) => a + l.distanceM, 0);
    const label = rides.length
      ? rides.map((r) => `${modeLabel(r.mode)} ${r.transit![0].routeShort}`).join(' + ') + (hikeM ? ' + escursione' : walkM > 1500 ? ' + a piedi' : '')
      : main === 'hike' ? 'Escursione a piedi' : 'A piedi';
    const cost: CostLine[] = mergeArcobaleno(mergeBreSections(legs.flatMap((l) => l.cost ?? [])));
    const notes = [...new Set(legs.flatMap((l) => l.notes))];
    return {
      id: `trip-${idx.fromStop}-${idx.toStop}-${Date.parse(dep)}`,
      fromStop: idx.fromStop, toStop: idx.toStop, from, to,
      departure: dep, arrival: arr, legs,
      summary: { mainMode: main as LegMode, durationMin: Math.round((Date.parse(arr) - Date.parse(dep)) / 60000), walkM: Math.round(walkM), ascentM: Math.round(ascentM), descentM: Math.round(descentM), rides: rides.length, label },
      cost, notes,
    };
  }
}

export function modeLabel(m: LegMode | TransitMode): string {
  return ({ walk: 'A piedi', hike: 'Escursione', bus: 'Bus', train: 'Treno', funicular: 'Funicolare', boat: 'Battello', cable_car: 'Funivia', wait: 'Attesa' } as Record<string, string>)[m] ?? m;
}

/**
 * Un biglietto Arcobaleno vale per le coincidenze entro la sua validità: le corse
 * bus/treno/funicolare cittadina dello stesso spostamento sono conteggiate una volta
 * (con la fascia più alta), invece di sommare più biglietti.
 */
function mergeArcobaleno(lines: CostLine[]): CostLine[] {
  const isArc = (l: CostLine) => l.label.startsWith('Biglietto Arcobaleno') || l.label.startsWith('Funicolare Lugano Città');
  const arc = lines.filter(isArc);
  if (arc.length <= 1) return lines;
  const top = arc.reduce((a, b) => ((b.max ?? 0) > (a.max ?? 0) ? b : a));
  const merged: CostLine = { ...top, label: 'Biglietto Arcobaleno (vale per le coincidenze)', note: `${top.note ?? ''} Conteggiato una sola volta per ${arc.length} corse in coincidenza.`.trim() };
  return [merged, ...lines.filter((l) => !isArc(l))];
}
