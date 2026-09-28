/**
 * Costruisce il catalogo validato (data/build/catalog.json) dai file editoriali
 * (data/catalog/*.yaml) risolvendo coordinate, ingressi, comuni, orari OSM,
 * accessibilità e fermate vicine dai dati geografici importati.
 * Nessuna coordinata viene scritta a mano: se un riferimento OSM non si risolve,
 * la build fallisce.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import YAML from 'yaml';
import * as turf from '@turf/turf';
import polylabel from 'polylabel';
import { Place, CatalogEvent, Source, type PriceEstimate, type OpeningSchedule, type Evidence } from '../../src/shared/types.ts';
import { parseOsmOpeningHours } from '../../src/shared/osm-hours.ts';
import { haversine } from '../lib/dem.ts';

const TODAY = new Date().toISOString().slice(0, 10);
const perimeter = JSON.parse(readFileSync('data/geo/perimeter.json', 'utf8'));

// ------------------------------------------------------------------ indice OSM
console.log('Indicizzo gli oggetti OSM…');
const index = new Map<string, any>();
for (const line of readFileSync('data/raw/osm/lugano-area.geojsonseq', 'utf8').split('\n')) {
  const s = line.replace(/^\x1e/, '').trim();
  if (!s) continue;
  const f = JSON.parse(s);
  const t = f.properties['@type'];
  const ref = `${t === 'node' ? 'n' : t === 'way' ? 'w' : 'r'}${f.properties['@id']}`;
  const prev = index.get(ref);
  // preferisce l'area alla linea per le vie chiuse
  if (!prev || (prev.geometry.type === 'LineString' && f.geometry.type !== 'LineString')) index.set(ref, f);
}
const entrances: any[] = JSON.parse(readFileSync('data/build/osm/entrances.json', 'utf8'));
const municipalities = JSON.parse(readFileSync('data/build/osm/municipalities.json', 'utf8')).features.filter((f: any) => f.properties.level === 8);
const transit = JSON.parse(readFileSync('data/build/transit-raw.json', 'utf8'));

function cleanPoly(poly: number[][][]) { return poly.filter((r) => r.length >= 4); }
function representativePoint(f: any): [number, number] {
  const g = f.geometry;
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'Polygon') return polylabel(cleanPoly(g.coordinates) as any, 0.000005) as [number, number];
  if (g.type === 'MultiPolygon') {
    let best: any = null, bestA = -1;
    for (const p of g.coordinates) { const c = cleanPoly(p); if (!c.length) continue; const a = turf.area(turf.polygon(c)); if (a > bestA) { bestA = a; best = c; } }
    return polylabel(best as any, 0.000005) as [number, number];
  }
  if (g.type === 'LineString') {
    const ls = turf.lineString(g.coordinates);
    return turf.along(ls, turf.length(ls) / 2).geometry.coordinates as [number, number];
  }
  throw new Error('geometria non supportata ' + g.type);
}

function municipalityOf(lon: number, lat: number): { name: string; country: 'CH' | 'IT' | '?' } {
  const pt = turf.point([lon, lat]);
  for (const m of municipalities) {
    try { if (turf.booleanPointInPolygon(pt, m)) return { name: m.properties.name, country: m.properties.country }; } catch { /* poligono degenerato */ }
  }
  return { name: 'non determinato', country: '?' };
}

// ------------------------------------------------------------------ prezzi
const PRESETS: Record<string, { label: string; adult: [number, number]; child: [number, number] | null; childAgeMax?: number; note: string }> = {
  grotto: { label: 'Pasto (fascia grotto)', adult: [30, 55], child: [15, 30], childAgeMax: 11, note: 'Fascia indicativa per categoria, non un listino.' },
  osteria: { label: 'Pasto (fascia osteria/ristorante)', adult: [35, 65], child: [15, 30], childAgeMax: 11, note: 'Fascia indicativa per categoria, non un listino.' },
  pizzeria: { label: 'Pasto (fascia pizzeria)', adult: [20, 38], child: [12, 20], childAgeMax: 11, note: 'Fascia indicativa per categoria, non un listino.' },
  fine: { label: 'Cena (fascia alta)', adult: [80, 160], child: [40, 80], childAgeMax: 11, note: 'Fascia indicativa per categoria, non un listino.' },
  cafe: { label: 'Consumazione caffè/dolce', adult: [6, 15], child: [4, 10], childAgeMax: 11, note: 'Fascia indicativa per categoria.' },
  gelato: { label: 'Gelato', adult: [4, 8], child: [3, 6], childAgeMax: 11, note: 'Fascia indicativa per categoria.' },
  bar: { label: 'Consumazione al bar', adult: [10, 22], child: [5, 10], childAgeMax: 15, note: 'Fascia indicativa (una consumazione).' },
};

function ev(field: string, sourceId: string, status: Evidence['status'], extra: Partial<Evidence> = {}): Evidence {
  return { field, sourceId, status, observedAt: TODAY, lastCheckedAt: TODAY, ...extra };
}

function buildPrices(id: string, p: any): PriceEstimate[] {
  if (!p) return [{ id: `${id}-price`, label: 'Costo', currency: 'CHF', unit: 'person', audience: 'all', status: 'unknown', essential: true, evidence: ev('price', 'editorial-2026-09', 'unknown') }];
  if (p === 'free') return [{ id: `${id}-free`, label: 'Accesso libero', currency: 'CHF', min: 0, max: 0, unit: 'free', audience: 'all', status: 'known', essential: true, evidence: ev('price', 'editorial-2026-09', 'editorial', { note: 'Spazio pubblico o ingresso gratuito secondo la redazione.' }) }];
  if (typeof p === 'string') {
    const pr = PRESETS[p];
    if (!pr) throw new Error(`preset prezzo sconosciuto ${p}`);
    const out: PriceEstimate[] = [{ id: `${id}-${p}-adult`, label: pr.label, currency: 'CHF', min: pr.adult[0], max: pr.adult[1], unit: 'person', audience: 'adult', status: 'estimate', essential: true, note: pr.note, evidence: ev('price', 'estimate', 'estimate') }];
    if (pr.child) out.push({ id: `${id}-${p}-child`, label: `${pr.label} (bambini)`, currency: 'CHF', min: pr.child[0], max: pr.child[1], unit: 'person', audience: 'child', childAgeMax: pr.childAgeMax, status: 'estimate', essential: true, note: pr.note, evidence: ev('price', 'estimate', 'estimate') });
    return out;
  }
  return (p as any[]).map((x, i) => ({
    id: `${id}-p${i}`, label: x.label, currency: 'CHF', min: x.min, max: x.max ?? x.min, unit: x.unit ?? 'person', audience: x.audience ?? 'all',
    childAgeMax: x.childAgeMax, childFree: x.childFree, status: x.status ?? 'estimate', optional: x.optional, essential: x.essential ?? true, note: x.note,
    evidence: ev('price', x.status === 'known' ? 'editorial-2026-09' : x.status === 'unknown' ? 'editorial-2026-09' : 'estimate', x.status === 'known' ? 'editorial' : x.status === 'unknown' ? 'unknown' : 'estimate', { note: x.note ?? 'Tariffa indicativa, da verificare sul sito ufficiale.' }),
  }));
}

function applyLastEntry(s: OpeningSchedule, minutes?: number) {
  if (!minutes) return s;
  for (const r of s.rules) {
    const [h, m] = r.to.split(':').map(Number);
    let t = h * 60 + m - minutes;
    if (t < 0) t += 1440;
    r.lastEntry = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  return s;
}

const warnings: string[] = [];
function buildSchedules(id: string, y: any, tags: Record<string, string>): { schedules: OpeningSchedule[]; hoursStatus: string } {
  const h = y.hours;
  if (h === 'always') {
    return { schedules: [{ id: `${id}-public`, kind: 'public', tz: 'Europe/Zurich', alwaysOpen: true, rules: [], holidays: 'regular', exceptions: [], evidence: ev('hours', 'editorial-2026-09', 'editorial', { note: 'Spazio pubblico sempre accessibile (redazione).' }) }], hoursStatus: 'always' };
  }
  if (h === 'unknown' || h == null) return { schedules: [], hoursStatus: 'unknown' };
  if (h === 'osm') {
    const raw = tags.opening_hours;
    if (!raw) { warnings.push(`${id}: hours=osm ma il tag opening_hours manca`); return { schedules: [], hoursStatus: 'unknown' }; }
    const r = parseOsmOpeningHours(raw, { id: `${id}-public`, kind: 'public', evidence: ev('hours', 'osm', 'osm', { note: `opening_hours="${raw}"${tags['check_date:opening_hours'] ? ` (verificato su OSM il ${tags['check_date:opening_hours']})` : ''}` }) });
    if (!r.ok) { warnings.push(`${id}: opening_hours non convertibile (${r.reason}): ${raw}`); return { schedules: [], hoursStatus: 'unparsed' }; }
    const out = [applyLastEntry(r.schedule, y.lastEntryMin)];
    if (y.lastEntryMin) out[0].evidence.note += ` · ${y.lastEntryNote ?? `ultimo ingresso ${y.lastEntryMin} min prima (redazione)`}`;
    if (tags['opening_hours:kitchen']) {
      const k = parseOsmOpeningHours(tags['opening_hours:kitchen'], { id: `${id}-kitchen`, kind: 'kitchen', evidence: ev('hours', 'osm', 'osm') });
      if (k.ok) out.push(k.schedule);
    }
    return { schedules: out, hoursStatus: 'osm' };
  }
  if (typeof h === 'object' && h.osm) {
    const r = parseOsmOpeningHours(h.osm, { id: `${id}-public`, kind: 'public', evidence: ev('hours', 'editorial-2026-09', h.status ?? 'editorial', { note: h.note }) });
    if (!r.ok) throw new Error(`${id}: orario redazionale non valido: ${r.reason}`);
    const s = applyLastEntry(r.schedule, y.lastEntryMin);
    if (y.lastEntryMin) s.evidence.note = `${s.evidence.note ?? ''} · ${y.lastEntryNote ?? ''}`.trim();
    return { schedules: [s], hoursStatus: h.status ?? 'editorial' };
  }
  throw new Error(`${id}: formato hours non valido`);
}

function wheelchairFromOsm(v?: string): 'yes' | 'limited' | 'no' | 'unknown' {
  if (v === 'yes' || v === 'designated') return 'yes';
  if (v === 'limited') return 'limited';
  if (v === 'no') return 'no';
  return 'unknown';
}

// ------------------------------------------------------------------ fermate vicine
const MODE_OF_TYPE = (t: number) => (t >= 1400 && t < 1500 ? 'funicular' : t >= 1000 && t < 1100 ? 'boat' : t >= 100 && t < 200 ? 'train' : t >= 1300 && t < 1400 ? 'cable_car' : 'bus');
const stopModes = new Map<number, Set<string>>();
const routeType = new Map(transit.routes.map((r: any) => [r.id, r.type]));
for (const t of transit.trips) for (const s of t.stops) {
  let m = stopModes.get(s);
  if (!m) stopModes.set(s, (m = new Set()));
  m.add(MODE_OF_TYPE(routeType.get(t.route) as number));
}
function nearestStops(lon: number, lat: number) {
  const byName = new Map<string, { id: string; name: string; distanceM: number; modes: string[] }>();
  transit.stops.forEach((s: any, i: number) => {
    const d = haversine(lon, lat, s.lon, s.lat);
    if (d > 900) return;
    const prev = byName.get(s.name);
    const modes = [...(stopModes.get(i) ?? [])];
    if (!prev || d < prev.distanceM) byName.set(s.name, { id: s.id, name: s.name, distanceM: Math.round(d), modes: [...new Set([...(prev?.modes ?? []), ...modes])] });
    else prev.modes = [...new Set([...prev.modes, ...modes])];
  });
  return [...byName.values()].sort((a, b) => a.distanceM - b.distanceM).slice(0, 4);
}

// ------------------------------------------------------------------ luoghi
const rawPlaces: any[] = YAML.parse(readFileSync('data/catalog/places.yaml', 'utf8'));
const places: Place[] = [];
const ids = new Set<string>();
for (const y of rawPlaces) {
  if (ids.has(y.id)) throw new Error('id duplicato ' + y.id);
  ids.add(y.id);
  const f = index.get(y.osm);
  if (!f) throw new Error(`${y.id}: riferimento OSM non trovato ${y.osm}`);
  const tags = f.properties as Record<string, string>;
  const [lon, lat] = representativePoint(f);
  const inPerimeter = lon >= perimeter.perimeter.west && lon <= perimeter.perimeter.east && lat >= perimeter.perimeter.south && lat <= perimeter.perimeter.north;
  if (!inPerimeter) warnings.push(`${y.id}: fuori dal perimetro di prodotto (resta nel buffer)`);
  // ingresso: nodo entrance OSM più vicino entro 60 m (dentro o sul bordo dell'oggetto)
  let entrance: Place['entrance'] = { lon, lat, source: 'osm_feature' };
  let best = 60;
  for (const e of entrances) {
    const d = haversine(lon, lat, e.lon, e.lat);
    if (d < best && (e.entrance === 'main' || e.entrance === 'yes' || e.entrance === 'entrance')) { best = d; entrance = { lon: e.lon, lat: e.lat, source: 'osm_entrance', note: `OSM ${e.osm}${e.wheelchair ? `, wheelchair=${e.wheelchair}` : ''}` }; }
  }
  const { schedules, hoursStatus } = buildSchedules(y.id, y, tags);
  const access = y.access ?? {};
  const wheelchair = access.wheelchair === 'osm' ? wheelchairFromOsm(tags.wheelchair) : (access.wheelchair ?? 'unknown');
  const accessEvidence = access.wheelchair === 'osm' && tags.wheelchair
    ? ev('accessibility', 'osm', 'osm', { note: `wheelchair=${tags.wheelchair}${tags['wheelchair:description'] ? ` (${tags['wheelchair:description']})` : ''}` })
    : ev('accessibility', 'editorial-2026-09', wheelchair === 'unknown' && (access.stroller ?? 'unknown') === 'unknown' ? 'unknown' : 'editorial', { note: access.note });
  const website = y.website ?? tags.website ?? tags['contact:website'];
  const muni = municipalityOf(lon, lat);
  const place = {
    id: y.id,
    name: y.name,
    category: y.cat,
    osm: y.osm,
    lon: Math.round(lon * 1e6) / 1e6,
    lat: Math.round(lat * 1e6) / 1e6,
    entrance,
    municipality: muni,
    area: y.area,
    description: y.desc,
    tags: y.tags ?? [],
    moods: y.moods ?? [],
    visit: { min: y.visit[0], typical: y.visit[1], max: y.visit[2] },
    schedules,
    prices: buildPrices(y.id, y.prices),
    booking: { required: y.booking === false ? 'no' : (y.booking ?? 'unknown'), note: y.bookingNote },
    links: { website, phone: tags.phone ?? tags['contact:phone'] },
    accessibility: { wheelchair, stroller: access.stroller ?? 'unknown', stairs: access.stairs ?? 'unknown', note: access.note, evidence: accessEvidence },
    suitability: {
      occasions: y.occ ?? [], minAge: y.minAge, weather: y.weather ?? 'any', indoor: !!y.indoor,
      habitualAtmosphere: y.atmosphere ?? 'unknown', noise: y.noise ?? 'unknown', alcohol: y.alcohol ?? 'none',
    },
    mountain: y.mountain ? { ...y.mountain, conditionsVerified: y.mountain.conditionsVerified ?? false } : undefined,
    meal: y.meal,
    walkTo: y.walkTo,
    plannable: y.plannable ?? 'yes',
    diet: y.diet ?? (tags['diet:vegetarian'] === 'yes' || tags['diet:vegetarian'] === 'only' ? ['vegetarian'] : []),
    nearestStops: nearestStops(entrance.lon, entrance.lat),
    sponsored: false,
    demo: false,
    evidence: [
      ev('coordinates', 'osm', 'osm', { note: `Oggetto ${y.osm}${tags.name ? ` «${tags.name}»` : ''}` }),
      ev('description', 'editorial-2026-09', 'editorial'),
      ...(hoursStatus === 'unknown' || hoursStatus === 'unparsed' ? [ev('hours', 'editorial-2026-09', 'unknown', { note: hoursStatus === 'unparsed' ? `Orario OSM presente ma non convertibile: "${tags.opening_hours}"` : 'Orari non disponibili nel catalogo.' })] : []),
      ...(muni.country === '?' ? [] : [ev('municipality', 'osm', 'osm', { note: `Confini amministrativi OSM: ${muni.name} (${muni.country})` })]),
    ],
    sources: ['osm', 'editorial-2026-09'],
    lastEditorialCheck: '2026-09-28',
  };
  const parsed = Place.safeParse(place);
  if (!parsed.success) throw new Error(`${y.id}: ${JSON.stringify(parsed.error.issues, null, 1)}`);
  places.push(parsed.data);
}
for (const p of places) if (p.walkTo && !ids.has(p.walkTo)) throw new Error(`${p.id}: walkTo sconosciuto ${p.walkTo}`);

// ------------------------------------------------------------------ eventi
const rawEvents: any[] = YAML.parse(readFileSync('data/catalog/events.yaml', 'utf8'));
const events: CatalogEvent[] = rawEvents.map((e) => {
  if (!ids.has(e.placeId)) throw new Error(`evento ${e.id}: luogo sconosciuto ${e.placeId}`);
  const parsed = CatalogEvent.safeParse({
    ...e,
    prices: buildPrices(e.id, e.prices),
    demo: true,
    evidence: [ev('event', 'demo-fixtures', 'demo', { note: 'Fixture dimostrativa: non è l\'agenda reale.' })],
  });
  if (!parsed.success) throw new Error(`evento ${e.id}: ${JSON.stringify(parsed.error.issues)}`);
  // i prezzi degli eventi demo sono stime demo
  for (const p of parsed.data.prices) p.evidence = { ...p.evidence, sourceId: 'demo-fixtures', status: p.status === 'known' ? 'demo' : p.evidence.status };
  return parsed.data;
});

const sources = (YAML.parse(readFileSync('data/catalog/sources.yaml', 'utf8')) as any[]).map((s) => Source.parse({ ...s, acquiredAt: s.acquiredAt ?? TODAY }));

// ------------------------------------------------------------------ esplorazione libera (POI OSM non curati)
const pois: any[] = JSON.parse(readFileSync('data/build/osm/pois.json', 'utf8'));
const curatedOsm = new Set(places.map((p) => p.osm));
const P = perimeter.buffer;
const explore = pois
  .filter((p) => p.tags.name && !curatedOsm.has(p.osm) && p.lon >= P.west && p.lon <= P.east && p.lat >= P.south && p.lat <= P.north)
  .filter((p) => !['toilets', 'water', 'fountain', 'lodging', 'shop', 'food_shop', 'info', 'pier', 'library'].includes(p.cls))
  .map((p) => ({ osm: p.osm, cls: p.cls, name: p.tags.name, lon: p.lon, lat: p.lat, openingHours: p.tags.opening_hours ?? null, website: p.tags.website ?? p.tags['contact:website'] ?? null, wheelchair: p.tags.wheelchair ?? null, cuisine: p.tags.cuisine ?? null }));
const amenities = pois
  .filter((p) => ['toilets', 'water'].includes(p.cls))
  .map((p) => ({ osm: p.osm, cls: p.cls, lon: p.lon, lat: p.lat, fee: p.tags.fee ?? null, wheelchair: p.tags.wheelchair ?? null, openingHours: p.tags.opening_hours ?? null }));

// ------------------------------------------------------------------ indirizzi (ricerca locale, nessun geocoder esterno)
const addresses: [string, number, number][] = [];
for (const [, f] of index) {
  const t = f.properties;
  if (!t['addr:street'] || !t['addr:housenumber']) continue;
  try {
    const [lon, lat] = representativePoint(f);
    if (lon < P.west || lon > P.east || lat < P.south || lat > P.north) continue;
    addresses.push([`${t['addr:street']} ${t['addr:housenumber']}${t['addr:city'] ? `, ${t['addr:city']}` : ''}`, Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]);
  } catch { /* geometria non valida */ }
}

const version = `cat-${TODAY}-${places.length}p-${events.length}e`;
writeFileSync('data/build/catalog.json', JSON.stringify({ version, builtAt: new Date().toISOString(), sources, places, events }, null, 1));
writeFileSync('data/build/explore.json', JSON.stringify({ builtAt: new Date().toISOString(), source: 'osm', pois: explore, amenities }));
writeFileSync('data/build/addresses.json', JSON.stringify(addresses));
console.log(`Catalogo ${version}: ${places.length} luoghi, ${events.length} eventi, ${sources.length} fonti; esplorazione ${explore.length} POI OSM, ${amenities.length} servizi, ${addresses.length} indirizzi`);
const byCountry = places.reduce((a: any, p) => { a[p.municipality.name + ' ' + p.municipality.country] = (a[p.municipality.name + ' ' + p.municipality.country] ?? 0) + 1; return a; }, {});
console.log('Per comune:', byCountry);
if (warnings.length) console.log('Avvisi:\n  ' + warnings.join('\n  '));
