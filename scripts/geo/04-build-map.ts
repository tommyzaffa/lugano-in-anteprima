/**
 * Fase 1 — Cartografia vettoriale propria.
 *
 * Input:  data/raw/osm/lugano-area.geojsonseq (osmium export dell'estratto Geofabrik CH+IT
 *         ritagliato sull'area buffer; vedi scripts/geo/README.md)
 * Output: public/tiles/lugano/{z}/{x}/{y}.pbf  (Mapbox Vector Tiles, schema proprio)
 *         public/tiles/lugano/tiles.json         (TileJSON con elenco layer)
 *         data/build/osm/*.json                   (derivati per grafo, catalogo, comuni)
 *
 * Nessuna geometria viene deformata: si classifica e si ritaglia al buffer.
 * Dati © OpenStreetMap contributors, ODbL.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import GeoJSONVT from 'geojson-vt';
import vtpbf from 'vt-pbf';
import * as turf from '@turf/turf';
import polylabel from 'polylabel';
import { tilesInBbox } from '../lib/tiles.ts';
import type { Feature, Geometry, Position } from 'geojson';

const perimeter = JSON.parse(readFileSync('data/geo/perimeter.json', 'utf8'));
const BUF = perimeter.buffer;
const BBOX: [number, number, number, number] = [BUF.west, BUF.south, BUF.east, BUF.north];
const INPUT = 'data/raw/osm/lugano-area.geojsonseq';
const OUT_TILES = 'public/tiles/lugano';
const OUT_OSM = 'data/build/osm';
const MIN_Z = 8, MAX_Z = 16;

type Props = Record<string, any>;
type F = Feature<Geometry, Props>;

// ---------- lettura ----------
const raw = readFileSync(INPUT, 'utf8').split('\n');
const features: F[] = [];
for (const line of raw) {
  const s = line.replace(/^\x1e/, '').trim();
  if (!s) continue;
  features.push(JSON.parse(s));
}
console.log(`Feature lette: ${features.length}`);
// osmium esporta le vie chiuse sia come LineString sia come Polygon: ne teniamo una sola.
{
  const byRef = new Map<string, F[]>();
  for (const f of features) {
    if (f.properties['@type'] !== 'way') continue;
    const k = 'w' + f.properties['@id'];
    const arr = byRef.get(k);
    if (arr) arr.push(f); else byRef.set(k, [f]);
  }
  const drop = new Set<F>();
  for (const arr of byRef.values()) {
    if (arr.length < 2) continue;
    const t = arr[0].properties;
    const wantLine = (t.highway && t.area !== 'yes') || t.railway || t.aerialway || t.route === 'ferry' || t.barrier || t.waterway && !t.area || t.natural === 'coastline' || t.natural === 'cliff' || t.natural === 'tree_row';
    const keep = arr.find((f) => (wantLine ? f.geometry.type === 'LineString' : f.geometry.type !== 'LineString')) ?? arr[0];
    for (const f of arr) if (f !== keep) drop.add(f);
  }
  const before = features.length;
  for (let i = features.length - 1; i >= 0; i--) if (drop.has(features[i])) features.splice(i, 1);
  console.log(`Duplicati linea/area rimossi: ${before - features.length}`);
}

// ---------- utilità ----------
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
function roundGeom(g: Geometry): Geometry {
  const rc = (c: any): any => (typeof c[0] === 'number' ? [r6(c[0]), r6(c[1])] : c.map(rc));
  if (g.type === 'GeometryCollection') return g;
  return { ...g, coordinates: rc((g as any).coordinates) } as Geometry;
}
function inBuf(lon: number, lat: number) { return lon >= BUF.west && lon <= BUF.east && lat >= BUF.south && lat <= BUF.north; }
function clip(f: F): F | null {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === 'Point') return inBuf(g.coordinates[0], g.coordinates[1]) ? f : null;
  const bb = turf.bbox(f);
  if (bb[2] < BUF.west || bb[0] > BUF.east || bb[3] < BUF.south || bb[1] > BUF.north) return null;
  if (bb[0] >= BUF.west && bb[2] <= BUF.east && bb[1] >= BUF.south && bb[3] <= BUF.north) return f;
  if (g.type === 'LineString' || g.type === 'MultiLineString' || g.type === 'Polygon' || g.type === 'MultiPolygon') {
    const c = turf.bboxClip(f as any, BBOX) as F;
    const coords = (c.geometry as any).coordinates;
    if (!coords || coords.length === 0) return null;
    return c;
  }
  return null;
}
function hash(n: number | string): number {
  let h = 2166136261;
  const s = String(n);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function osmRef(p: Props): string {
  const t = p['@type'];
  return `${t === 'node' ? 'n' : t === 'way' ? 'w' : 'r'}${p['@id']}`;
}
function labelPoint(f: F): Position | null {
  try { return labelPointUnsafe(f); } catch { return null; }
}
function cleanPoly(poly: number[][][]): number[][][] | null {
  const rings = poly.filter((r) => Array.isArray(r) && r.length >= 4);
  return rings.length ? rings : null;
}
function labelPointUnsafe(f: F): Position | null {
  const g = f.geometry;
  if (g.type === 'Polygon') { const c = cleanPoly(g.coordinates as number[][][]); return c ? (polylabel(c as any, 0.00002) as Position) : null; }
  if (g.type === 'MultiPolygon') {
    let best: number[][][] | null = null, bestA = -1;
    for (const p0 of g.coordinates) { const poly = cleanPoly(p0 as number[][][]); if (!poly) continue; const a = turf.area(turf.polygon(poly)); if (a > bestA) { bestA = a; best = poly; } }
    return best ? (polylabel(best as any, 0.00002) as Position) : null;
  }
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'LineString') return turf.along(turf.lineString(g.coordinates), turf.length(turf.lineString(g.coordinates)) / 2).geometry.coordinates;
  return null;
}
const isArea = (f: F) => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon';
const isLine = (f: F) => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString';

// ---------- classificazione ----------
const layers: Record<string, F[]> = {
  water: [], waterway: [], landcover: [], buildings: [], roads: [], rail: [], aerialway: [], ferry: [],
  boundary: [], places: [], peaks: [], pois: [], labels: [],
};
const derived = {
  highways: [] as any[], rail: [] as any[], pois: [] as any[], entrances: [] as any[],
  lake: [] as any[], municipalities: [] as any[], buildings: [] as any[], ferries: [] as any[], aerialways: [] as any[],
};

function roadClass(t: Props): string | null {
  const h = t.highway;
  if (!h) return null;
  switch (h) {
    case 'motorway': case 'motorway_link': return 'motorway';
    case 'trunk': case 'trunk_link': return 'trunk';
    case 'primary': case 'primary_link': return 'primary';
    case 'secondary': case 'secondary_link': return 'secondary';
    case 'tertiary': case 'tertiary_link': return 'tertiary';
    case 'residential': case 'unclassified': case 'living_street': case 'road': return 'minor';
    case 'service': case 'busway': return 'service';
    case 'pedestrian': return 'pedestrian';
    case 'footway': case 'corridor': return t.footway === 'sidewalk' || t.footway === 'crossing' ? 'sidewalk' : 'footway';
    case 'path': case 'bridleway': return t.sac_scale && t.sac_scale !== 'hiking' ? 'trail' : 'path';
    case 'steps': return 'steps';
    case 'track': return 'track';
    case 'cycleway': return 'cycleway';
    default: return null;
  }
}
const SAC: Record<string, number> = { hiking: 1, mountain_hiking: 2, demanding_mountain_hiking: 3, alpine_hiking: 4, demanding_alpine_hiking: 5, difficult_alpine_hiking: 6 };

function landcoverKind(t: Props): string | null {
  const { landuse: lu, natural: n, leisure: le, amenity: am, man_made: mm } = t;
  if (n === 'wood' || lu === 'forest') return 'forest';
  if (n === 'scrub' || n === 'heath') return 'scrub';
  if (n === 'grassland' || ['meadow', 'grass', 'village_green', 'recreation_ground'].includes(lu) || le === 'common') return 'grass';
  if (le === 'park' || le === 'dog_park') return 'park';
  if (le === 'garden') return 'garden';
  if (lu === 'vineyard') return 'vineyard';
  if (lu === 'orchard') return 'orchard';
  if (['farmland', 'farmyard', 'allotments', 'greenhouse_horticulture', 'plant_nursery'].includes(lu)) return 'farm';
  if (lu === 'residential') return 'residential';
  if (lu === 'commercial' || lu === 'retail') return 'commercial';
  if (['industrial', 'railway', 'construction', 'brownfield', 'quarry', 'landfill'].includes(lu)) return 'industrial';
  if (lu === 'cemetery' || am === 'grave_yard') return 'cemetery';
  if (le === 'playground') return 'playground';
  if (['pitch', 'sports_centre', 'stadium', 'track', 'golf_course'].includes(le)) return 'sport';
  if (['beach', 'sand', 'shingle'].includes(n)) return 'beach';
  if (le === 'beach_resort' || le === 'swimming_area') return 'lido';
  if (['bare_rock', 'scree'].includes(n)) return 'rock';
  if (n === 'wetland') return 'wetland';
  if (['school', 'university', 'hospital', 'college', 'kindergarten'].includes(am)) return 'institution';
  if (am === 'parking') return 'parking';
  if (mm === 'pier' || mm === 'breakwater' || mm === 'groyne') return 'pier';
  if (le === 'marina') return 'marina';
  return null;
}
const LC_MINZOOM: Record<string, number> = { forest: 8, grass: 10, park: 10, scrub: 10, vineyard: 11, orchard: 12, farm: 11, residential: 10, commercial: 11, industrial: 11, cemetery: 12, playground: 14, sport: 13, beach: 12, lido: 12, rock: 11, wetland: 11, institution: 13, parking: 15, pier: 13, marina: 12 };

function buildingHeight(t: Props): number {
  const h = parseFloat(String(t.height ?? '').replace(',', '.'));
  if (h > 1 && h < 250) return h;
  const lv = parseFloat(t['building:levels']);
  const roof = parseFloat(t['roof:levels']) || 0;
  if (lv > 0 && lv < 60) return lv * 3.1 + roof * 2 + 1.5;
  const b = t.building;
  if (['church', 'cathedral', 'chapel'].includes(b) || t.amenity === 'place_of_worship') return b === 'chapel' ? 8 : 16;
  if (['garage', 'garages', 'shed', 'hut', 'carport', 'roof', 'kiosk', 'cabin', 'service', 'toilets', 'greenhouse'].includes(b)) return 3.2;
  if (['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'farm', 'villa'].includes(b)) return 8;
  if (['apartments', 'residential'].includes(b)) return 14;
  if (['commercial', 'retail', 'office', 'hotel', 'public', 'civic', 'school', 'university', 'hospital', 'train_station'].includes(b)) return 13;
  if (['industrial', 'warehouse', 'manufacture'].includes(b)) return 9;
  return 9;
}
function minHeight(t: Props): number {
  const mh = parseFloat(t.min_height);
  if (mh > 0 && mh < 200) return mh;
  const ml = parseFloat(t['building:min_level']);
  if (ml > 0) return ml * 3.1;
  return 0;
}

const POI_CLASS: [(t: Props) => boolean, string][] = [
  [(t) => t.tourism === 'museum', 'museum'],
  [(t) => t.tourism === 'gallery' || t.amenity === 'arts_centre', 'gallery'],
  [(t) => t.tourism === 'viewpoint', 'viewpoint'],
  [(t) => t.tourism === 'attraction' || t.tourism === 'theme_park' || t.tourism === 'zoo', 'attraction'],
  [(t) => t.tourism === 'artwork', 'artwork'],
  [(t) => ['hotel', 'hostel', 'guest_house', 'motel', 'apartment', 'camp_site', 'alpine_hut'].includes(t.tourism), 'lodging'],
  [(t) => t.tourism === 'picnic_site' || t.leisure === 'picnic_site', 'picnic'],
  [(t) => t.tourism === 'information' && t.information === 'office', 'info'],
  [(t) => t.amenity === 'restaurant', 'restaurant'],
  [(t) => t.amenity === 'cafe', 'cafe'],
  [(t) => t.amenity === 'bar' || t.amenity === 'pub' || t.amenity === 'biergarten', 'bar'],
  [(t) => t.amenity === 'ice_cream' || t.shop === 'ice_cream', 'ice_cream'],
  [(t) => t.amenity === 'fast_food', 'fast_food'],
  [(t) => t.amenity === 'theatre' || t.amenity === 'music_venue' || t.amenity === 'events_venue', 'theatre'],
  [(t) => t.amenity === 'cinema', 'cinema'],
  [(t) => t.amenity === 'nightclub', 'nightclub'],
  [(t) => t.amenity === 'casino', 'casino'],
  [(t) => t.amenity === 'library', 'library'],
  [(t) => t.amenity === 'marketplace', 'market'],
  [(t) => t.amenity === 'place_of_worship', 'worship'],
  [(t) => t.amenity === 'toilets', 'toilets'],
  [(t) => t.amenity === 'drinking_water' || (t.amenity === 'fountain' && t.drinking_water === 'yes'), 'water'],
  [(t) => t.amenity === 'fountain', 'fountain'],
  [(t) => t.leisure === 'playground', 'playground'],
  [(t) => ['beach_resort', 'swimming_area', 'bathing_place'].includes(t.leisure) || t.leisure === 'swimming_pool' && t.access !== 'private' && !!t.name, 'lido'],
  [(t) => t.leisure === 'park' || t.leisure === 'garden', 'park'],
  [(t) => t.leisure === 'nature_reserve', 'nature'],
  [(t) => ['castle', 'ruins', 'monument', 'memorial', 'archaeological_site', 'church', 'manor', 'tower', 'building', 'city_gate', 'wayside_shrine', 'wayside_cross'].includes(t.historic), 'historic'],
  [(t) => ['bakery', 'confectionery', 'chocolate', 'pastry'].includes(t.shop), 'bakery'],
  [(t) => ['wine', 'deli', 'cheese', 'farm'].includes(t.shop), 'food_shop'],
  [(t) => ['books', 'gift'].includes(t.shop), 'shop'],
  [(t) => t.amenity === 'ferry_terminal', 'pier'],
  [(t) => t.man_made === 'tower' && t['tower:type'] === 'observation', 'viewpoint'],
  [(t) => t.man_made === 'lighthouse', 'historic'],
];
function poiClass(t: Props): string | null {
  for (const [test, c] of POI_CLASS) if (test(t)) return c;
  return null;
}
const KEEP_POI_TAGS = ['name', 'name:it', 'name:de', 'name:en', 'amenity', 'tourism', 'leisure', 'historic', 'shop', 'cuisine', 'opening_hours', 'opening_hours:kitchen', 'website', 'contact:website', 'phone', 'contact:phone', 'email', 'wheelchair', 'wheelchair:description', 'toilets:wheelchair', 'changing_table', 'addr:street', 'addr:housenumber', 'addr:postcode', 'addr:city', 'wikidata', 'wikipedia', 'operator', 'fee', 'charge', 'outdoor_seating', 'indoor_seating', 'diet:vegetarian', 'diet:vegan', 'diet:gluten_free', 'reservation', 'stars', 'ele', 'description', 'description:it', 'drinking_water', 'information', 'religion', 'denomination', 'museum', 'artwork_type', 'access', 'lit', 'covered', 'capacity', 'check_date:opening_hours', 'smoking', 'dog', 'internet_access', 'payment:cash', 'building', 'entrance', 'image', 'wikimedia_commons', 'start_date', 'heritage'];
function pickTags(t: Props): Props {
  const o: Props = {};
  for (const k of KEEP_POI_TAGS) if (t[k] != null) o[k] = t[k];
  return o;
}

let n = 0;
for (const f0 of features) {
  n++;
  const t = f0.properties;
  const ref = osmRef(t);
  f0.geometry = roundGeom(f0.geometry);

  // Comuni (poligoni amministrativi livello 8) e confine di Stato (livello 2)
  if (t.boundary === 'administrative' && isArea(f0)) {
    const lvl = Number(t.admin_level);
    if ([2, 8, 9, 10].includes(lvl)) {
      const lines = turf.polygonToLine(f0 as any) as any;
      const lineFeats: any[] = lines.type === 'FeatureCollection' ? lines.features : [lines];
      for (const lf of lineFeats) {
        const c = clip({ type: 'Feature', geometry: lf.geometry, properties: {} });
        if (c) layers.boundary.push({ ...c, properties: { lvl, name: t.name ?? '' } });
      }
      if (lvl === 8 || lvl === 10 || lvl === 9) {
        const bb = turf.bbox(f0);
        if (!(bb[2] < BUF.west || bb[0] > BUF.east || bb[3] < BUF.south || bb[1] > BUF.north)) {
          const simp = turf.simplify(f0 as any, { tolerance: 0.00005, highQuality: false });
          const country = t['ISO3166-2']?.startsWith('IT') || t['ref:ISTAT'] || t['ref:catasto'] ? 'IT' : (t['swisstopo:BFS_NUMMER'] || t['ref:bfs'] || t['ISO3166-2']?.startsWith('CH') ? 'CH' : '?');
          derived.municipalities.push({ type: 'Feature', geometry: simp.geometry, properties: { osm: ref, name: t.name, level: lvl, country, bfs: t['swisstopo:BFS_NUMMER'] ?? t['ref:bfs'] ?? null, istat: t['ref:ISTAT'] ?? null, wikidata: t.wikidata ?? null } });
          if (lvl >= 9 && t.name) {
            // etichetta di quartiere solo se non già presente come place node
          }
        }
      }
    }
    continue;
  }

  // Acqua
  const isWaterArea = isArea(f0) && (t.natural === 'water' || t.waterway === 'riverbank' || ['reservoir', 'basin'].includes(t.landuse) || t.leisure === 'swimming_pool');
  if (isWaterArea) {
    const kind = t.leisure === 'swimming_pool' ? 'pool' : t.water === 'lake' || /Lugano|Ceresio/.test(t.name ?? '') ? 'lake' : t.water === 'river' || t.waterway === 'riverbank' ? 'river' : 'pond';
    if (kind === 'pool' && t.access === 'private') { /* piscine private: dettaglio non utile */ }
    const c = clip(f0);
    if (c) {
      layers.water.push({ ...c, properties: { kind, name: kind === 'lake' ? (t.name ?? '') : '' } });
      if (kind === 'lake' && /Lugano|Ceresio/.test(t.name ?? '')) {
        derived.lake.push({ ...c, properties: { osm: ref, name: t.name } });
      }
    }
    if (kind === 'lake' && t.name) {
      // punto etichetta: sulla parte di lago dentro il perimetro
      const inner = turf.bboxClip(f0 as any, [perimeter.perimeter.west, perimeter.perimeter.south, perimeter.perimeter.east, perimeter.perimeter.north]) as F;
      const lp = labelPoint(inner);
      if (lp) layers.labels.push({ type: 'Feature', geometry: { type: 'Point', coordinates: lp }, properties: { kind: 'lake', name: t['name:it'] ?? t.name, rank: 1 } });
    }
    continue;
  }
  if (t.waterway && isLine(f0) && ['river', 'stream', 'canal', 'ditch', 'drain'].includes(t.waterway)) {
    const c = clip(f0);
    if (c) layers.waterway.push({ ...c, properties: { kind: t.waterway, name: t.name ?? '', tn: t.tunnel ? 1 : 0 } });
    continue;
  }

  // Edifici
  if (t.building && t.building !== 'no' && isArea(f0)) {
    const c = clip(f0);
    if (!c) continue;
    const h = buildingHeight(t);
    const lm = !!(t.wikidata || t.historic || ['museum', 'attraction'].includes(t.tourism) || ['place_of_worship', 'townhall', 'arts_centre', 'theatre'].includes(t.amenity) || ['church', 'cathedral', 'chapel', 'train_station'].includes(t.building));
    const props: Props = { h: Math.round(h * 10) / 10, mh: minHeight(t), tone: hash(t['@id']) % 4, lm: lm ? 1 : 0, kind: t.building };
    if (lm && t.name) props.name = t.name;
    layers.buildings.push({ ...c, properties: props });
    if (lm || t.name) {
      const lp = labelPoint(c);
      derived.buildings.push({ osm: ref, name: t.name ?? null, lm, h, lon: lp?.[0], lat: lp?.[1], tags: pickTags(t) });
    }
    // Un edificio può anche essere un POI (museo, chiesa...): continua sotto
    const pc = poiClass(t);
    if (!pc) continue;
  }

  // Strade e sentieri
  const rc = roadClass(t);
  if (rc && t.area !== 'yes' && !['construction', 'proposed'].includes(t.highway)) {
    let geom = f0.geometry;
    if (geom.type === 'Polygon') geom = { type: 'LineString', coordinates: geom.coordinates[0] };
    const lf: F = { ...f0, geometry: geom };
    const c = clip(lf);
    if (c) {
      const props: Props = { cls: rc };
      if (t.name) props.name = t.name;
      if (t.bridge && t.bridge !== 'no') props.br = 1;
      if (t.tunnel && t.tunnel !== 'no') props.tn = 1;
      if (t.sac_scale) props.sac = SAC[t.sac_scale] ?? 1;
      if (t.oneway === 'yes') props.ow = 1;
      if (t.layer) props.layer = Number(t.layer) || 0;
      layers.roads.push({ ...c, properties: props });
    }
    derived.highways.push({ osm: ref, id: t['@id'], nodes: t['@way_nodes'], coords: geom.type === 'LineString' ? geom.coordinates : null, tags: highwayTags(t) });
    continue;
  }
  if (t.highway === 'pedestrian' && t.area === 'yes' && isArea(f0)) {
    const c = clip(f0);
    if (c) layers.landcover.push({ ...c, properties: { kind: 'plaza' } });
    derived.highways.push({ osm: ref, id: t['@id'], nodes: t['@way_nodes'], coords: (f0.geometry as any).type === 'Polygon' ? (f0.geometry as any).coordinates[0] : null, tags: highwayTags(t), area: true });
    continue;
  }

  // Ferrovie, funicolari, impianti a fune, battelli
  if (t.railway && isLine(f0) && ['rail', 'funicular', 'light_rail', 'narrow_gauge', 'tram', 'subway', 'disused'].includes(t.railway)) {
    const c = clip(f0);
    if (c) {
      const props: Props = { cls: t.railway, tn: t.tunnel && t.tunnel !== 'no' ? 1 : 0, br: t.bridge && t.bridge !== 'no' ? 1 : 0, svc: t.service ? 1 : 0 };
      if (t.name) props.name = t.name;
      layers.rail.push({ ...c, properties: props });
    }
    if (t.railway !== 'disused') derived.rail.push({ osm: ref, id: t['@id'], nodes: t['@way_nodes'], coords: (f0.geometry as any).coordinates, tags: { railway: t.railway, name: t.name, service: t.service, tunnel: t.tunnel, bridge: t.bridge, usage: t.usage } });
    continue;
  }
  if (t.aerialway && isLine(f0)) {
    const c = clip(f0);
    if (c) layers.aerialway.push({ ...c, properties: { cls: t.aerialway, name: t.name ?? '' } });
    derived.aerialways.push({ osm: ref, coords: (f0.geometry as any).coordinates, tags: { aerialway: t.aerialway, name: t.name } });
    continue;
  }
  if (t.route === 'ferry' && isLine(f0)) {
    const c = clip(f0);
    if (c) layers.ferry.push({ ...c, properties: { name: t.name ?? '' } });
    derived.ferries.push({ osm: ref, coords: (f0.geometry as any).coordinates, tags: { name: t.name } });
    continue;
  }

  // Copertura del suolo
  const lc = isArea(f0) ? landcoverKind(t) : null;
  if (lc) {
    const c = clip(f0);
    if (c) {
      layers.landcover.push({ ...c, properties: { kind: lc } });
      if (t.name && ['park', 'garden', 'lido', 'forest', 'nature', 'cemetery'].includes(lc)) {
        const area = turf.area(c as any);
        if (area > 3000) {
          const lp = labelPoint(c);
          if (lp) layers.labels.push({ type: 'Feature', geometry: { type: 'Point', coordinates: lp }, properties: { kind: lc, name: t.name, rank: area > 200000 ? 2 : area > 20000 ? 3 : 4 } });
        }
      }
    }
    // può essere anche un POI (parco, lido): prosegui
  }
  if (t.man_made && isLine(f0) && ['pier', 'breakwater', 'groyne'].includes(t.man_made)) {
    const c = clip(f0);
    if (c) layers.roads.push({ ...c, properties: { cls: 'pier' } });
    continue;
  }

  // Luoghi e vette
  if (f0.geometry.type === 'Point' && t.place && t.name) {
    const c = clip(f0);
    if (c) {
      const rank = { city: 1, town: 2, village: 3, suburb: 3, quarter: 4, neighbourhood: 5, hamlet: 5, isolated_dwelling: 6, locality: 6, farm: 7, square: 6 }[t.place as string] ?? 7;
      layers.places.push({ ...c, properties: { kind: t.place, name: t.name, rank, pop: Number(t.population) || 0 } });
    }
    continue;
  }
  if (f0.geometry.type === 'Point' && t.natural === 'peak') {
    const c = clip(f0);
    if (c) layers.peaks.push({ ...c, properties: { name: t.name ?? '', ele: Number(t.ele) || 0 } });
    continue;
  }
  if (f0.geometry.type === 'Point' && t.entrance) {
    if (inBuf(...(f0.geometry.coordinates as [number, number]))) derived.entrances.push({ osm: ref, lon: f0.geometry.coordinates[0], lat: f0.geometry.coordinates[1], entrance: t.entrance, wheelchair: t.wheelchair ?? null, name: t.name ?? null, door: t.door ?? null, step_count: t.step_count ?? null });
    continue;
  }

  // POI
  const pc = poiClass(t);
  if (pc) {
    const lp = labelPoint(f0);
    if (!lp || !inBuf(lp[0], lp[1])) continue;
    derived.pois.push({ osm: ref, cls: pc, lon: r6(lp[0]), lat: r6(lp[1]), tags: pickTags(t) });
    if (t.name || ['toilets', 'water', 'viewpoint', 'playground'].includes(pc)) {
      layers.pois.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [r6(lp[0]), r6(lp[1])] }, properties: { cls: pc, name: t.name ?? '', osm: ref } });
    }
  }
}

function highwayTags(t: Props): Props {
  const keep = ['highway', 'name', 'footway', 'sidewalk', 'sidewalk:both', 'sidewalk:left', 'sidewalk:right', 'foot', 'access', 'bicycle', 'motor_vehicle', 'bus', 'psv', 'oneway', 'oneway:bus', 'oneway:psv', 'junction', 'surface', 'smoothness', 'incline', 'step_count', 'ramp', 'ramp:stroller', 'ramp:wheelchair', 'handrail', 'wheelchair', 'sac_scale', 'trail_visibility', 'lit', 'bridge', 'tunnel', 'layer', 'covered', 'width', 'maxspeed', 'area', 'conveying', 'elevator', 'service', 'crossing', 'tracktype', 'mtb:scale', 'segregated', 'indoor', 'level'];
  const o: Props = {};
  for (const k of keep) if (t[k] != null) o[k] = t[k];
  return o;
}

// ---------- tile ----------
console.log('Layer:', Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.length])));

const ROAD_MINZOOM: Record<string, number> = { motorway: 8, trunk: 8, primary: 9, secondary: 10, tertiary: 11, minor: 12, service: 14, pedestrian: 13, footway: 14, sidewalk: 16, path: 13, trail: 12, steps: 14, track: 13, cycleway: 14, pier: 14 };
const LAYER_CFG: Record<string, { minzoom: number; featMin?: (p: Props) => number }> = {
  water: { minzoom: 8, featMin: (p) => (p.kind === 'pool' ? 15 : p.kind === 'lake' ? 8 : 12) },
  waterway: { minzoom: 11, featMin: (p) => (p.kind === 'river' ? 11 : p.kind === 'stream' || p.kind === 'canal' ? 13 : 15) },
  landcover: { minzoom: 8, featMin: (p) => LC_MINZOOM[p.kind] ?? 13 },
  buildings: { minzoom: 13, featMin: (p) => (p.lm ? 13 : p.h > 12 ? 13 : 14) },
  roads: { minzoom: 8, featMin: (p) => ROAD_MINZOOM[p.cls] ?? 14 },
  rail: { minzoom: 9, featMin: (p) => (p.cls === 'disused' ? 14 : p.svc ? 14 : 9) },
  aerialway: { minzoom: 11 },
  ferry: { minzoom: 10 },
  boundary: { minzoom: 8, featMin: (p) => (p.lvl === 2 ? 8 : p.lvl === 8 ? 11 : 14) },
  places: { minzoom: 8, featMin: (p) => (p.rank <= 2 ? 8 : p.rank <= 3 ? 10 : p.rank <= 4 ? 12 : p.rank <= 5 ? 13 : 15) },
  peaks: { minzoom: 10 },
  pois: { minzoom: 14, featMin: (p) => (['museum', 'gallery', 'viewpoint', 'attraction', 'historic', 'park', 'lido', 'theatre'].includes(p.cls) ? 14 : 16) },
  labels: { minzoom: 8, featMin: (p) => (p.rank <= 1 ? 8 : p.rank === 2 ? 11 : p.rank === 3 ? 13 : 14) },
};

if (existsSync(OUT_TILES)) rmSync(OUT_TILES, { recursive: true });
mkdirSync(OUT_TILES, { recursive: true });
const indexes: Record<string, GeoJSONVT> = {};
for (const [name, feats] of Object.entries(layers)) {
  indexes[name] = new GeoJSONVT({ type: 'FeatureCollection', features: feats } as any, {
    maxZoom: MAX_Z, indexMaxZoom: 6, indexMaxPoints: 0, tolerance: name === 'buildings' ? 1.5 : 3, extent: 4096, buffer: name === 'labels' || name === 'places' || name === 'pois' ? 128 : 64,
  });
}

let tileCount = 0, bytes = 0, maxTile = 0;
for (let z = MIN_Z; z <= MAX_Z; z++) {
  for (const { x, y } of tilesInBbox(BUF, z)) {
    const tileLayers: Record<string, any> = {};
    for (const [name, idx] of Object.entries(indexes)) {
      const cfg = LAYER_CFG[name];
      if (z < cfg.minzoom) continue;
      const tile = idx.getTile(z, x, y);
      if (!tile || tile.features.length === 0) continue;
      const feats = cfg.featMin ? tile.features.filter((f: any) => cfg.featMin!(f.tags) <= z) : tile.features;
      if (feats.length === 0) continue;
      tileLayers[name] = { features: feats };
    }
    if (Object.keys(tileLayers).length === 0) continue;
    const buf = vtpbf.fromGeojsonVt(tileLayers, { version: 2, extent: 4096 });
    const file = `${OUT_TILES}/${z}/${x}/${y}.pbf`;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, buf);
    tileCount++; bytes += buf.length; maxTile = Math.max(maxTile, buf.length);
  }
}
const vectorLayers = Object.keys(LAYER_CFG).map((id) => ({ id, minzoom: LAYER_CFG[id].minzoom, maxzoom: MAX_Z, fields: {} }));
writeFileSync(`${OUT_TILES}/tiles.json`, JSON.stringify({
  tilejson: '3.0.0',
  name: 'Lugano in anteprima — base cartografica',
  description: 'Tile vettoriali generati localmente da OpenStreetMap (estratti Geofabrik CH + IT nord-ovest), ritagliati sull\'area buffer.',
  attribution: '© OpenStreetMap contributors (ODbL)',
  minzoom: MIN_Z, maxzoom: MAX_Z,
  bounds: BBOX,
  center: [8.955, 46.0, 13],
  vector_layers: vectorLayers,
  generatedAt: new Date().toISOString(),
}, null, 2));
console.log(`Tile scritti: ${tileCount}, ${(bytes / 1e6).toFixed(1)} MB, max ${(maxTile / 1e3).toFixed(0)} kB`);

// ---------- derivati ----------
mkdirSync(OUT_OSM, { recursive: true });
for (const [k, v] of Object.entries(derived)) {
  const out = ['lake', 'municipalities'].includes(k) ? { type: 'FeatureCollection', features: v } : v;
  writeFileSync(`${OUT_OSM}/${k}.json`, JSON.stringify(out));
  console.log(`  derivato ${k}: ${v.length}`);
}
writeFileSync(`${OUT_OSM}/meta.json`, JSON.stringify({
  source: 'Geofabrik extracts: europe/switzerland-latest.osm.pbf + europe/italy/nord-ovest-latest.osm.pbf, ritagliati con osmium extract --strategy=smart',
  license: 'ODbL 1.0 — © OpenStreetMap contributors',
  builtAt: new Date().toISOString(),
  bbox: BUF,
}, null, 2));
void n;
