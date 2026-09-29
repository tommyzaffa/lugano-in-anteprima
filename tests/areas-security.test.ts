import { beforeAll, describe, expect, it } from 'vitest';
import { DataStore } from '../src/server/data.ts';
import { GroupRequest } from '../src/shared/types.ts';
import { inArea, distanceKm } from '../src/shared/area.ts';
import { planAlternatives } from '../src/server/planner/index.ts';
import { planB } from '../src/server/planner/planb.ts';
import { createApi } from '../src/server/api.ts';
import { openDb } from '../src/server/db.ts';
import { parsePlan } from '../src/server/plan-input.ts';
import { pawnSvg } from '../src/client/map/avatars.ts';
import { redactPlan, DEFAULT_REDACTION } from '../src/shared/export.ts';
import { safeUrl } from '../src/client/safe-url.ts';
let data: DataStore;
let api: ReturnType<typeof createApi>;
beforeAll(() => { data = new DataStore(); data.load(); api = createApi(data, openDb(':memory:')); });
const request = (label: string, radiusKm = 1) => {
  const a = data.areas.find((a) => a.label === label)!;
  const center = { kind: 'point', label, lon: a.lon, lat: a.lat };
  return GroupRequest.parse({ people: [{ id: 'a', name: 'A', kind: 'adult', avatar: { color: '#aabbcc', accent: '#fff' } }],
    date: '2026-10-03', startTime: '10:00', endTime: '16:00', start: center, end: { mode: 'same' }, occasion: 'leisure', budget: { per: 'person', strict: false }, area: { center, radiusKm }, locale: 'fr' });
};
describe('territorial coverage and hard area constraint', () => {
  it.each(['Caslano', 'Comano', 'Cureglia', 'Paradiso', 'Sonvico', 'Agno'])('%s has usable places, stops and local itineraries', async (name) => {
    const r = request(name);
    expect([...data.places.values()].filter((p) => inArea(p.entrance, r.area)).length).toBeGreaterThan(1);
    expect(data.transit.d.stops.some((s) => inArea(s, r.area))).toBe(true);
    const out = await planAlternatives(r, { data });
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.alternatives.length).toBeGreaterThan(0);
    for (const plan of out.alternatives) {
      expect(parsePlan(plan)).not.toBeNull();
      expect(parsePlan({ ...plan, trips: [] })).toBeNull();
      expect(redactPlan(plan, DEFAULT_REDACTION).request.area).toBeNull();
      for (const stop of plan.stops) expect(inArea(stop, r.area)).toBe(true);
      for (const item of planB(plan, data).items) for (const option of item.options) expect(inArea(data.place(option.placeId)!.entrance, r.area)).toBe(true);
    }
  });
  it('keeps the start separate and rejects mandatory stops outside the chosen area', async () => {
    const req = request('Caslano');
    const outside = [...data.places.values()].find((p) => p.id === 'parco-ciani')!;
    expect(outside).toBeDefined();
    const out = await planAlternatives({ ...req, mustSee: [outside.id], start: { kind: 'point', label: 'Lugano', lon: outside.lon, lat: outside.lat } }, { data });
    expect(out.status).toBe('infeasible');
    if (out.status === 'infeasible') expect(out.infeasible.reasons.some((r) => r.message.includes('fuori dalla zona scelta'))).toBe(true);
  });
  it('reports no matching local events and orders alternatives by distance', async () => {
    const req = request('Caslano', 0.5);
    const out = await planAlternatives(req, { data });
    expect(out.areaAdvice?.events).toBe(0);
    const alternatives = out.areaAdvice!.alternatives;
    expect(alternatives.length).toBeGreaterThan(0);
    expect(alternatives.map((a) => a.distanceKm)).toEqual(alternatives.map((a) => a.distanceKm).sort((a,b) => a-b));
    expect(req.area!.center.label).toBe('Caslano');
    expect(distanceKm(req.area!.center, alternatives[0].area.center)).toBeGreaterThan(0.5);
  });
});
describe('API and rendering boundaries', () => {
  it('rejects oversized requests before parsing them', async () => {
    const res = await api.request('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ freeText: 'x'.repeat(65000) }) });
    expect(res.status).toBe(413);
  });
  it.each(['/api/replan', '/api/planb', '/api/revalidate'])('rejects malformed plans at %s', async (url) => {
    const res = await api.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: { request: request('Comano'), stops: [{}] }, decision: { kind: 'skip', atTime: '2026-10-03T10:00:00+02:00' } }) });
    expect(res.status).toBe(400);
  });
  it('rejects invalid dates, coordinates and markup in colors', () => {
    const req = request('Comano');
    expect(GroupRequest.safeParse({ ...req, date: '2026-02-30' }).success).toBe(false);
    expect(GroupRequest.safeParse({ ...req, start: { ...req.start, lat: 1000 } }).success).toBe(false);
    expect(pawnSvg('red"/><script>alert(1)</script><path fill="')).not.toContain('<script');
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('https://lugano.ch/')).toBe('https://lugano.ch/');
  });
});
