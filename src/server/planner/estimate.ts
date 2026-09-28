/**
 * Stima rapida dei tempi di spostamento verso tutti i candidati da un punto e
 * un istante: un Dijkstra pedonale limitato + una scansione CSA uno-a-tutti.
 * Serve solo a esplorare le combinazioni; il piano finale è validato con i
 * percorsi e le corse reali.
 */
import type { LegPoint } from '../../shared/types.ts';
import type { Router, TravelOptions } from '../routing/router.ts';
import { walkCost } from '../routing/walk.ts';
import type { Candidate } from './candidates.ts';

export interface Estimate { sec: number; mode: 'walk' | 'transit'; walkM: number; rides: number }

export class Estimator {
  private snapCache = new Map<string, { node: number; cost: number }[]>();
  private dijCache = new Map<string, Map<number, number>>();
  private egressCache = new Map<string, Map<number, number>>();
  private activityCache = new Map<string, { sec: number; lengthM: number; upM: number; downM: number } | null>();
  calls = 0;

  constructor(private router: Router) {}

  private snap(p: { lon: number; lat: number }, o: TravelOptions) {
    const k = `${p.lon.toFixed(5)},${p.lat.toFixed(5)}|${o.profile.id}`;
    let s = this.snapCache.get(k);
    if (!s) { s = this.router.snap(p.lon, p.lat, o.profile); this.snapCache.set(k, s); }
    return s;
  }

  private walkTable(p: LegPoint, o: TravelOptions, maxSec: number) {
    const k = `${p.lon.toFixed(5)},${p.lat.toFixed(5)}|${o.profile.id}|${maxSec}`;
    let d = this.dijCache.get(k);
    if (!d) {
      d = this.router.walkG.dijkstra(this.snap(p, o), walkCost(o.profile), maxSec);
      if (this.dijCache.size > 400) this.dijCache.clear();
      this.dijCache.set(k, d);
    }
    return d;
  }

  egress(p: { lon: number; lat: number }, o: TravelOptions) {
    const k = `${p.lon.toFixed(5)},${p.lat.toFixed(5)}|${o.profile.id}`;
    let e = this.egressCache.get(k);
    if (!e) { e = this.router.accessStops(p, o.profile); this.egressCache.set(k, e); }
    return e;
  }

  /** Tempo stimato (s) per raggiungere ciascun candidato partendo da `from` all'istante `t`. */
  toCandidates(from: LegPoint, t: number, cands: Candidate[], o: TravelOptions): Map<string, Estimate> {
    this.calls++;
    const out = new Map<string, Estimate>();
    const maxWalk = Math.min(4 * 3600, Math.max(o.comfortableWalkSec * 2, 45 * 60));
    const walk = this.walkTable(from, o, maxWalk);
    let csa: ReturnType<Router['oneToAll']> | null = null;
    if (o.modes.size) csa = this.router.oneToAll(from, t, o);
    for (const c of cands) {
      const ent = c.place.entrance;
      let best: Estimate | null = null;
      const sn = this.snap(ent, o);
      for (const s of sn) {
        const d = walk.get(s.node);
        if (d == null) continue;
        const sec = d + s.cost;
        if (!best || sec < best.sec) best = { sec, mode: 'walk', walkM: sec * o.profile.speed, rides: 0 };
      }
      if (csa) {
        const eg = this.egress(ent, o);
        let tb = Infinity;
        for (const [stop, sec] of eg) {
          const a = csa.arrival[stop];
          if (!Number.isFinite(a)) continue;
          const v = (a - t) / 1000 + sec;
          if (v < tb) tb = v;
        }
        if (Number.isFinite(tb)) {
          // il cammino è preferito se non molto più lento (peso del ritmo)
          const walkScore = best ? best.sec * o.walkWeight + Math.max(0, best.sec - o.comfortableWalkSec) * 1.5 : Infinity;
          if (tb + 150 < walkScore) best = { sec: tb, mode: 'transit', walkM: 400, rides: 1 };
        }
      }
      if (best) out.set(c.key, best);
    }
    return out;
  }

  /** Durata e dislivello della passeggiata-attività (ingresso → uscita). */
  activity(c: Candidate, o: TravelOptions) {
    if (!c.exit) return null;
    const k = `${c.key}|${o.profile.id}`;
    if (this.activityCache.has(k)) return this.activityCache.get(k)!;
    const w = this.router.walk(c.place.entrance, c.exit.entrance, o.profile);
    const r = w ? { sec: w.seconds, lengthM: w.lengthM, upM: w.upM, downM: w.downM } : null;
    this.activityCache.set(k, r);
    return r;
  }

  /** Stima prudente del rientro verso il punto finale (s). */
  returnEstimate(from: { lon: number; lat: number }, end: LegPoint | null, o: TravelOptions): number {
    if (!end) return 0;
    const endTable = this.walkTable(end, o, Math.min(3 * 3600, Math.max(o.comfortableWalkSec * 2, 45 * 60)));
    let best = Infinity;
    for (const s of this.snap(from, o)) {
      const d = endTable.get(s.node);
      if (d != null) best = Math.min(best, d + s.cost);
    }
    // con i mezzi: accesso alla fermata più vicina + tratta in linea d'aria a ~5 m/s + attesa media
    const acc = this.egress(from, o);
    const accMin = acc.size ? Math.min(...acc.values()) : Infinity;
    const eAcc = this.egress(end, o);
    const eMin = eAcc.size ? Math.min(...eAcc.values()) : Infinity;
    const dx = (from.lon - end.lon) * 77000, dy = (from.lat - end.lat) * 111000;
    const transit = accMin + eMin + Math.hypot(dx, dy) / 5 + 12 * 60;
    return Math.min(best, o.modes.size ? transit : Infinity);
  }
}
