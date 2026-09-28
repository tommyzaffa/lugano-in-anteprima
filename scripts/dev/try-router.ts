import { readFileSync } from 'node:fs';
import { Graph } from '../../src/server/routing/graph.ts';
import { TransitNetwork } from '../../src/server/routing/transit.ts';
import { Router } from '../../src/server/routing/router.ts';
import { profileFromRequest } from '../../src/server/routing/walk.ts';
import { localToInstant } from '../../src/shared/time.ts';

const t0 = Date.now();
const walkG = new Graph(JSON.parse(readFileSync('data/build/graph-walk.json', 'utf8')));
const tn = new TransitNetwork(JSON.parse(readFileSync('data/build/transit.json', 'utf8')));
const router = new Router(walkG, tn);
const cat = JSON.parse(readFileSync('data/build/catalog.json', 'utf8'));
console.log('load ms', Date.now() - t0);
const P = (id: string) => { const p = cat.places.find((x: any) => x.id === id); return { label: p.name, lon: p.entrance.lon, lat: p.entrance.lat, placeId: id }; };
const station = { label: 'Stazione Lugano', lon: 8.946849, lat: 46.005499 };
const people = [{ id: 'a', name: 'A', kind: 'adult', avatar: {} }, { id: 'b', name: 'B', kind: 'adult', avatar: {} }] as any;
const base = { pace: 'balanced', mobility: { stroller: false, wheelchair: false, avoidStairs: false, frequentBreaks: false }, people, avoid: [], moods: [] } as any;
const opts = (req: any) => ({ profile: profileFromRequest(req), modes: new Set<any>(['bus', 'train', 'funicular', 'boat', 'cable_car']), minChangeSec: 120, boardMarginSec: 120, comfortableWalkSec: 1800, people: req.people, passes: [], walkWeight: 1.15 });
const cases: [string, any, any, string, any][] = [
  ['Stazione → LAC', station, P('lac'), '10:00', base],
  ['Stazione → Monte Brè', station, P('monte-bre'), '10:00', base],
  ['LAC → San Salvatore', P('lac'), P('san-salvatore'), '10:00', base],
  ['Piazza Riforma → Monte Boglia', P('piazza-riforma'), P('monte-boglia'), '09:00', base],
  ['Piazza Riforma → Museo doganale', P('piazza-riforma'), P('museo-doganale'), '12:30', base],
  ['Piazza Riforma → Gandria (passeggino)', P('piazza-riforma'), P('gandria'), '10:00', { ...base, mobility: { ...base.mobility, stroller: true } }],
  ['Stazione → Swissminiatur', station, P('swissminiatur'), '10:00', base],
  ['Stazione → Museo Hesse', station, P('museo-hesse'), '10:00', base],
  ['Monte Brè → Stazione (tardi)', P('monte-bre'), station, '22:30', base],
];
for (const [name, a, b, time, req] of cases) {
  const t1 = Date.now();
  const trip = router.trip(a, b, localToInstant('2026-10-02', time).toMillis(), opts(req), { fromStop: -1, toStop: 0 });
  const ms = Date.now() - t1;
  if (!trip) { console.log(`✗ ${name}: nessun percorso (${ms} ms)`); continue; }
  console.log(`✓ ${name} [${ms} ms]: ${trip.departure.slice(11, 16)}→${trip.arrival.slice(11, 16)} ${trip.summary.durationMin} min, ${trip.summary.label}, a piedi ${trip.summary.walkM} m, +${trip.summary.ascentM} m; alt: ${JSON.stringify(trip.alternatives)}`);
  for (const l of trip.legs) console.log(`    - ${l.mode} ${l.departure.slice(11, 16)}-${l.arrival.slice(11, 16)} ${l.from.label} → ${l.to.label} ${l.distanceM} m ${l.transit ? l.transit[0].routeShort + ' ' + l.transit[0].headsign : ''} ${l.flags.stairs ? '[scale]' : ''}${l.flags.trail ? '[sentiero]' : ''} pts=${l.geometry.length} ${l.cost ? l.cost.map((c) => c.label + ' ' + c.min + '-' + c.max).join(';') : ''}`);
}
