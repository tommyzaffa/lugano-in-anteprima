/**
 * Contesto di pianificazione: richiesta normalizzata, finestra temporale,
 * vincoli rigidi e preferenze, opzioni di viaggio e punti di partenza/arrivo.
 */
import type { GroupRequest, LegPoint, WeatherSnapshot } from '../../shared/types.ts';
import { requestWindow } from '../../shared/time.ts';
import { budgetCap } from '../../shared/pricing.ts';
import { profileFromRequest, type WalkProfile } from '../routing/walk.ts';
import type { TravelOptions } from '../routing/router.ts';
import type { TransitMode } from '../routing/transit.ts';
import type { TextHints } from './text.ts';
import { config } from '../config.ts';

export interface PlanContext {
  req: GroupRequest;
  hints: TextHints;
  start: number;
  end: number;
  crossesMidnight: boolean;
  startPoint: LegPoint;
  endPoint: LegPoint | null; // null = punto libero
  people: number;
  kids: number;
  youngKids: boolean;
  cap: number | null;
  strictBudget: boolean;
  profile: WalkProfile;
  nightProfile: WalkProfile;
  travel: TravelOptions;
  nightTravel: TravelOptions;
  moods: Set<string>;
  avoid: Set<string>;
  weather: WeatherSnapshot | null;
  rainLikely: boolean;
  /** ora (ms) oltre la quale si considera sera/buio (stima artistica: non calcolo astronomico) */
  duskAt: number;
  signal?: AbortSignal;
  progress: (step: string) => void;
}

export function buildContext(req: GroupRequest, hints: TextHints, weather: WeatherSnapshot | null, progress: (s: string) => void, signal?: AbortSignal): PlanContext {
  const w = requestWindow(req.date, req.startTime, req.endTime);
  const startPoint: LegPoint = { label: req.start.label, lon: req.start.lon, lat: req.start.lat, placeId: req.start.placeId, stopId: req.start.stopId };
  let endPoint: LegPoint | null = startPoint;
  if (req.end.mode === 'free') endPoint = null;
  else if (req.end.mode !== 'same' && req.end.location) endPoint = { label: req.end.location.label, lon: req.end.location.lon, lat: req.end.location.lat, placeId: req.end.location.placeId, stopId: req.end.location.stopId };
  const avoid = new Set<string>([...req.avoid, ...hints.avoid]);
  const moods = new Set<string>([...req.moods, ...hints.moods]);
  const modes = new Set<TransitMode>();
  if (req.transport.bus) modes.add('bus');
  if (req.transport.train) modes.add('train');
  if (req.transport.boat && !avoid.has('boats')) modes.add('boat');
  if (req.transport.funicular && !avoid.has('heights')) { modes.add('funicular'); modes.add('cable_car'); }
  const profile = profileFromRequest({ ...req, avoid: [...avoid] as any });
  const nightProfile = profileFromRequest({ ...req, avoid: [...avoid] as any }, { night: true });
  const walkWeight = req.pace === 'relaxed' ? 1.45 : req.pace === 'intense' ? 0.9 : 1.15;
  const comfortable = (req.pace === 'relaxed' ? 20 : req.pace === 'intense' ? 45 : 30) * 60 * (req.mobility.frequentBreaks ? 0.7 : 1);
  const travel: TravelOptions = {
    profile, modes, minChangeSec: config.planner.minChangeSec, boardMarginSec: config.planner.boardMarginSec,
    comfortableWalkSec: comfortable, people: req.people, passes: req.passes, walkWeight,
  };
  // «sera» artistica: 19:00 in estate, 18:00 in inverno (non è un calcolo astronomico)
  const month = Number(req.date.slice(5, 7));
  const duskHour = month >= 4 && month <= 9 ? 19.5 : 18;
  const dusk = new Date(w.start.toMillis());
  const duskAt = w.start.set({ hour: Math.floor(duskHour), minute: (duskHour % 1) * 60 }).toMillis();
  void dusk;
  const rainLikely = !!weather && weather.status === 'live' && weather.hours.some((h) => (h.precipProb ?? 0) >= 60 || (h.precipMm ?? 0) >= 1);
  return {
    req, hints,
    start: w.start.toMillis(), end: w.end.toMillis(), crossesMidnight: w.crossesMidnight,
    startPoint, endPoint,
    people: req.people.length,
    kids: req.people.filter((p) => p.kind === 'child').length,
    youngKids: req.people.some((p) => p.kind === 'child' && p.ageBand === '0-5'),
    cap: budgetCap(req.budget, req.people.length),
    strictBudget: req.budget.strict && req.budget.amount != null,
    profile, nightProfile,
    travel, nightTravel: { ...travel, profile: nightProfile },
    moods, avoid, weather, rainLikely, duskAt, signal, progress,
  };
}

export function checkAbort(ctx: PlanContext) {
  if (ctx.signal?.aborted) throw new Error('ABORTED');
}
