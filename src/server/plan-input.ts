/** Validate client-supplied plans before the simulation/replanning code uses them. */
import { z } from 'zod';
import { GroupRequest, OpeningSchedule, PriceEstimate, Evidence, type Plan } from '../shared/types.ts';
const text = z.string().max(4000);
const texts = z.array(text).max(200);
const num = z.number().finite();
const time = z.string().max(40).refine((s) => Number.isFinite(Date.parse(s)));
const point = z.object({ label: text, lon: num.min(-180).max(180), lat: num.min(-90).max(90), placeId: text.optional(), stopId: text.optional() }).passthrough();
const coords = z.array(z.tuple([num.min(-180).max(180), num.min(-90).max(90)])).max(30000);
const check = z.object({ id: text, label: text, status: z.enum(['ok', 'uncertain', 'violated']), detail: text }).passthrough();
const cost = z.object({ id: text, label: text, min: num.nullable(), max: num.nullable(), status: z.enum(['known', 'estimate', 'unknown']), essential: z.boolean(), at: time }).passthrough();
const costs = z.array(cost).max(200);
const transit = z.object({ routeShort: text, agency: text, headsign: text, tripId: text, stops: z.array(z.object({ name: text, time: text, lon: num, lat: num }).passthrough()).max(1000) }).passthrough();
const leg = z.object({ id: text, mode: text, from: point, to: point, departure: time, arrival: time, durationMin: num, distanceM: num,
  geometry: coords, flags: z.object({ stairs: z.boolean(), trail: z.boolean(), unpaved: z.boolean(), noSidewalkInfo: z.boolean(), steep: z.boolean(), strollerOk: text }),
  transit: z.array(transit).min(1).max(100).optional(), source: z.object({ id: text, label: text, freshness: text }).passthrough(), notes: texts, cost: costs.optional(),
}).passthrough();
const trip = z.object({ id: text, fromStop: num, toStop: num, from: point, to: point, departure: time, arrival: time, legs: z.array(leg).min(1).max(100), cost: costs, notes: texts,
  summary: z.object({ mainMode: text, durationMin: num, walkM: num, ascentM: num, descentM: num, rides: num, label: text }),
}).passthrough();
const stop = z.object({ id: text, kind: z.enum(['place', 'event', 'pause']), placeId: text, name: text, arrival: time, start: time, end: time, departure: time, stayMin: num.min(0).max(1440), locked: z.boolean(), mandatory: z.boolean(), cost: costs,
  checks: z.array(check).max(200), reasons: texts, lon: num.min(-180).max(180), lat: num.min(-90).max(90), category: text, dataQuality: text, exit: point.optional(),
  activityPath: z.object({ coords, lengthM: num, upM: num, downM: num, mode: text }).optional(),
}).passthrough();
const planBase = z.object({ id: text, version: num, branchId: text, createdAt: time, title: text, theme: text, summary: text, request: GroupRequest,
  stops: z.array(stop).min(1).max(30), trips: z.array(trip).max(40), end: point,
  totals: z.object({ startsAt: time, endsAt: time, durationMin: num, walkM: num, ascentM: num, descentM: num, transitRides: num,
    cost: z.object({ min: num, max: num, perPersonMin: num, perPersonMax: num, unknownEssential: num, unknownOptional: num, status: text }) }),
  checks: z.array(check).max(500), feasibility: z.enum(['valid', 'uncertain', 'invalid']), tradeoffs: texts, missing: texts, whyThis: texts,
  narrative: z.object({ lines: z.array(z.object({ at: time, speaker: text, text, stopId: text.optional() })).max(100), source: text }), plannerSource: text,
  snapshot: z.object({ catalogVersion: text, transitFeed: text, computedAt: time, demo: z.boolean(),
    places: z.record(text, z.object({ name: text, schedules: z.array(OpeningSchedule).max(20), prices: z.array(PriceEstimate).max(100), evidence: z.array(Evidence).max(100) })),
    weather: z.object({ status: text, hours: z.array(z.object({ time: time, tempC: num.nullable(), precipMm: num.nullable(), precipProb: num.nullable(), code: num.nullable() })).max(1000) }).passthrough().nullable().optional(),
  }).passthrough(),
}).passthrough();
function schema(depth: number): z.ZodType {
  return planBase.extend({ decisions: z.array(z.object({ id: text, at: time, afterStop: num, prompt: text, mandatory: z.boolean(), options: z.array(z.object({ id: text, label: text, detail: text, valid: z.boolean(), plan: depth ? schema(depth - 1).nullable() : z.null() }).passthrough()).max(8) }).passthrough()).max(10) }).refine((p) => p.trips.length >= p.stops.length && p.trips.length <= p.stops.length + 1, { message: "Missing or inconsistent trips" });
}
const PlanInput = schema(2);
export function parsePlan(input: unknown): Plan | null {
  const p = PlanInput.safeParse(input);
  return p.success ? p.data as Plan : null;
}
