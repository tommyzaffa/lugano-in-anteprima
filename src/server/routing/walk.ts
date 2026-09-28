/**
 * Profili di cammino e funzioni di costo sul grafo pedonale.
 * Tempo per arco secondo DIN 33466 (combinazione di componente orizzontale e
 * verticale), velocità adattata a ritmo, bambini, passeggino ed escursione.
 * Il costo per la scelta del percorso aggiunge penalità (scale, strade senza
 * marciapiede noto, sentieri) che non alterano il tempo stimato mostrato.
 */
import { EdgeFlag } from '../../shared/graph-format.ts';
import type { EdgeView, CostFn } from './graph.ts';
import type { GroupRequest } from '../../shared/types.ts';

export interface WalkProfile {
  id: string;
  /** m/s in piano */
  speed: number;
  /** m/h in salita e in discesa */
  ascentRate: number;
  descentRate: number;
  steps: 'ok' | 'avoid' | 'forbidden';
  maxSac: number;          // scala SAC massima ammessa (0 = niente sentieri di montagna)
  trailPenalty: number;
  unpaved: 'ok' | 'avoid' | 'forbidden';
  night: boolean;
  climbPenalty: number;    // moltiplicatore sul tempo verticale nella scelta
  wheelchair: boolean;
}

export function profileFromRequest(r: Pick<GroupRequest, 'pace' | 'mobility' | 'people' | 'avoid' | 'moods'>, opts: { night?: boolean; hikingAllowed?: boolean } = {}): WalkProfile {
  const base = r.pace === 'relaxed' ? 3.8 : r.pace === 'intense' ? 5.0 : 4.5; // km/h
  const kids = r.people.some((p) => p.kind === 'child');
  const youngKids = r.people.some((p) => p.kind === 'child' && (p.ageBand === '0-5'));
  let speed = base / 3.6;
  if (kids) speed *= 0.88;
  if (r.mobility.stroller) speed *= 0.92;
  if (r.mobility.wheelchair) speed *= 0.85;
  if (r.mobility.frequentBreaks) speed *= 0.92;
  const strollerLike = r.mobility.stroller || r.mobility.wheelchair;
  const hikingAllowed = (opts.hikingAllowed ?? true) && !strollerLike && !youngKids && r.pace !== 'relaxed' && !r.avoid.includes('climbs');
  return {
    id: [r.pace, strollerLike ? 'stroller' : '', r.mobility.wheelchair ? 'wheelchair' : '', r.mobility.avoidStairs ? 'nostairs' : '', hikingAllowed ? 'hike' : '', opts.night ? 'night' : '', kids ? 'kids' : ''].filter(Boolean).join('-'),
    speed,
    ascentRate: r.pace === 'relaxed' ? 280 : r.pace === 'intense' ? 420 : 350,
    descentRate: r.pace === 'relaxed' ? 450 : r.pace === 'intense' ? 650 : 550,
    steps: strollerLike ? 'forbidden' : r.mobility.avoidStairs ? 'avoid' : 'ok',
    maxSac: strollerLike ? 0 : opts.night ? 1 : hikingAllowed ? 3 : 2,
    trailPenalty: hikingAllowed ? 1.1 : 3,
    unpaved: r.mobility.wheelchair ? 'forbidden' : r.mobility.stroller ? 'avoid' : 'ok',
    night: !!opts.night,
    climbPenalty: r.avoid.includes('climbs') ? 2 : 1,
    wheelchair: r.mobility.wheelchair,
  };
}

/** Tempo reale stimato (secondi) di un arco. */
export function edgeTime(p: WalkProfile, e: EdgeView): number {
  let speed = p.speed;
  if (e.flags & EdgeFlag.STEPS) speed *= 0.55;
  else if (e.sac >= 2) speed *= 0.75;
  else if (e.flags & EdgeFlag.UNPAVED) speed *= 0.9;
  const th = e.lengthM / speed;
  const tv = (e.upM / p.ascentRate + e.downM / p.descentRate) * 3600;
  return Math.max(th, tv) + Math.min(th, tv) / 2;
}

export function walkCost(p: WalkProfile): CostFn {
  return (e: EdgeView) => {
    const f = e.flags;
    if (e.sac > p.maxSac) return Infinity;
    if (f & EdgeFlag.STEPS) {
      if (p.steps === 'forbidden' && !(f & EdgeFlag.STROLLER_RAMP)) return Infinity;
    }
    if (p.wheelchair && (f & EdgeFlag.WHEELCHAIR_NO)) return Infinity;
    if (p.unpaved === 'forbidden' && (f & EdgeFlag.UNPAVED)) return Infinity;
    let t = edgeTime(p, e);
    if (p.climbPenalty > 1) t += (e.upM / p.ascentRate) * 3600 * (p.climbPenalty - 1);
    if ((f & EdgeFlag.STEPS) && p.steps === 'avoid') t *= 4;
    if (e.sac >= 2) t *= p.trailPenalty;
    if (p.unpaved === 'avoid' && (f & EdgeFlag.UNPAVED)) t *= 2.5;
    if (f & EdgeFlag.ROAD_NO_SIDEWALK_INFO) t *= 1.25;
    if (p.night && (f & EdgeFlag.PATH) && !(f & EdgeFlag.LIT)) t *= 2;
    if ((f & EdgeFlag.STEEP) && (p.wheelchair || p.unpaved !== 'ok')) t *= 3;
    return t;
  };
}
