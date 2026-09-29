import { distanceKm, type AreaAdvice } from '../../shared/area.ts';
import type { DataStore } from '../data.ts';
import type { PlanContext } from './context.ts';
import { selectCandidates, type CandidateReport } from './candidates.ts';

export function areaAdvice(ctx: PlanContext, data: DataStore, report: CandidateReport): AreaAdvice | undefined {
  const area = ctx.req.area;
  if (!area) return;
  const countEvents = (r: CandidateReport) => {
    const events = new Set(r.candidates.filter((c) => c.event).map((c) => c.event!.id));
    const places = new Set(r.candidates.map((c) => c.place.id));
    for (const e of data.events.values()) if (e.ongoing && e.ongoing.from <= ctx.req.date && e.ongoing.to >= ctx.req.date && places.has(e.placeId)) events.add(e.id);
    return events.size;
  };
  const result: AreaAdvice = { label: area.center.label, radiusKm: area.radiusKm, activities: new Set(report.candidates.map((c) => c.place.id)).size, events: countEvents(report), alternatives: [] };
  if (result.events && result.activities) return result;
  // Apply the same date, hours and group constraints, relaxing only geography.
  const all = selectCandidates({ ...ctx, req: { ...ctx.req, area: null } }, data);
  const ongoingPlaces = new Set([...data.events.values()].filter((e) => e.ongoing && e.ongoing.from <= ctx.req.date && e.ongoing.to >= ctx.req.date).map((e) => e.placeId));
  const options = all.candidates.filter((c) => !result.activities || c.kind === 'event' || ongoingPlaces.has(c.place.id))
    .sort((a, b) => distanceKm(a.place, area.center) - distanceKm(b.place, area.center));
  const seen = new Set<string>();
  for (const c of options) {
    if (distanceKm(c.place.entrance, area.center) <= area.radiusKm) continue;
    const nearest = [...data.areas].sort((a, b) => distanceKm(a, c.place.entrance) - distanceKm(b, c.place.entrance))[0];
    const label = nearest?.label ?? c.place.area ?? c.place.municipality.name;
    if (seen.has(label)) continue;
    seen.add(label);
    const center = { kind: 'point' as const, label, lon: nearest?.lon ?? c.place.lon, lat: nearest?.lat ?? c.place.lat };
    const radiusKm = Math.max(area.radiusKm, Math.ceil(distanceKm(center, c.place.entrance) * 2) / 2);
    if (radiusKm > 15) continue;
    const matching = { ...all, candidates: all.candidates.filter((x) => distanceKm(x.place.entrance, center) <= radiusKm) };
    result.alternatives.push({ label, distanceKm: Math.round(distanceKm(area.center, c.place.entrance) * 10) / 10, activities: new Set(matching.candidates.map((x) => x.place.id)).size, events: countEvents(matching), area: { center, radiusKm } });
    if (result.alternatives.length === 3) break;
  }
  return result;
}
