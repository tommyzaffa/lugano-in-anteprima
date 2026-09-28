/**
 * Contesto attorno all'area dei dati: rilievo della regione (Terrain Tiles z8–11), laghi,
 * fiumi, confine di Stato e città principali (Natural Earth, pubblico dominio), ritagliati
 * su un riquadro largo (dal Lago Maggiore al Lago di Como). Serve solo a non lasciare
 * bianca la carta fuori dal perimetro: è disegnato sfumato e senza dettagli pianificabili.
 *
 * Output: public/terrain/{z}/{x}/{y}.png (z8–11 aggiuntivi) e public/data/contesto.geojson
 * Uso: npm run data:context
 */
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { tilesInBbox } from '../lib/tiles.ts';

export const WIDE = { west: 8.35, south: 45.55, east: 9.6, north: 46.45 };
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';

async function terrain() {
  const jobs: { z: number; x: number; y: number }[] = [];
  for (let z = 8; z <= 11; z++) for (const t of tilesInBbox(WIDE, z)) jobs.push({ z, ...t });
  let n = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (jobs.length) {
      const j = jobs.shift()!;
      const file = `public/terrain/${j.z}/${j.x}/${j.y}.png`;
      if (existsSync(file)) continue;
      mkdirSync(dirname(file), { recursive: true });
      const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${j.z}/${j.x}/${j.y}.png`, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) { console.warn('  ! tile', file, res.status); continue; }
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      n++;
    }
  }));
  console.log(`Terreno regionale: ${n} tile nuovi`);
}

type Pos = [number, number];
const inBox = ([x, y]: Pos, pad = 0) => x >= WIDE.west - pad && x <= WIDE.east + pad && y >= WIDE.south - pad && y <= WIDE.north + pad;
const round = (c: Pos): Pos => [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];

/** Ritaglio semplice: tiene le geometrie che toccano il riquadro (con margine), coordinate arrotondate. */
function touches(g: any): boolean {
  const pts: Pos[] = g.type === 'Point' ? [g.coordinates] : g.type === 'LineString' || g.type === 'MultiPoint' ? g.coordinates : g.type === 'Polygon' || g.type === 'MultiLineString' ? g.coordinates.flat() : g.type === 'MultiPolygon' ? g.coordinates.flat(2) : [];
  return pts.some((p) => inBox(p, 0.3));
}
function roundGeom(g: any): any {
  const r = (a: any): any => (typeof a[0] === 'number' ? round(a as Pos) : a.map(r));
  return { type: g.type, coordinates: r(g.coordinates) };
}

async function ne(file: string) {
  const res = await fetch(`${NE}/${file}`, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Natural Earth ${file}: ${res.status}`);
  return (await res.json()) as { features: any[] };
}

/** Spezza linee e multilinee tenendo solo i tratti dentro il riquadro (con margine). */
function clipLines(g: any, pad = 0.15): Pos[][] {
  const lines: Pos[][] = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  const out: Pos[][] = [];
  for (const l of lines) {
    let cur: Pos[] = [];
    for (const p of l) {
      if (inBox(p, pad)) cur.push(round(p));
      else { if (cur.length > 1) out.push(cur); cur = []; }
    }
    if (cur.length > 1) out.push(cur);
  }
  return out;
}

// città di riferimento attorno all'area (coordinate da OpenStreetMap via Nominatim, una richiesta al secondo)
const TOWNS: [string, string][] = [['Varese', 'it'], ['Como', 'it'], ['Bellinzona', 'ch'], ['Locarno', 'ch'], ['Mendrisio', 'ch'], ['Chiasso', 'ch'], ['Luino', 'it'], ['Ponte Tresa', 'ch'], ['Porlezza', 'it'], ['Menaggio', 'it'], ['Tesserete', 'ch'], ['Agno', 'ch'], ['Morcote', 'ch'], ['Riva San Vitale', 'ch'], ['Lavena Ponte Tresa', 'it'], ['Taverne', 'ch'], ['Maroggia', 'ch'], ['Cernobbio', 'it'], ['Arzo', 'ch'], ['Bissone', 'ch']];
async function towns(perimeter: { south: number; west: number; north: number; east: number }) {
  const out: any[] = [];
  for (const [name, cc] of TOWNS) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&countrycodes=${cc}&format=json&limit=1&featureType=settlement`;
    const res = await fetch(url, { headers: { 'User-Agent': 'LuganoInAnteprima/0.1 (github.com/tommyzaffa/lugano-in-anteprima)' }, signal: AbortSignal.timeout(20000) });
    const [r] = res.ok ? ((await res.json()) as any[]) : [];
    await new Promise((ok) => setTimeout(ok, 1100));
    if (!r) { console.warn('  ! città non trovata', name); continue; }
    const c: Pos = [Number(r.lon), Number(r.lat)];
    // le località dentro l'area dei dati hanno già le loro etichette dettagliate
    if (c[0] >= perimeter.west && c[0] <= perimeter.east && c[1] >= perimeter.south && c[1] <= perimeter.north) continue;
    if (!inBox(c)) continue;
    out.push({ type: 'Feature', properties: { k: 'place', name, rank: ['Varese', 'Como', 'Bellinzona', 'Locarno'].includes(name) ? 1 : 2, osm: `${r.osm_type}/${r.osm_id}` }, geometry: { type: 'Point', coordinates: round(c) } });
  }
  return out;
}

async function context() {
  const perimeter = JSON.parse((await import('node:fs')).readFileSync('data/geo/perimeter.json', 'utf8')).perimeter;
  const out: any[] = [];
  const lakes = [...(await ne('ne_10m_lakes.geojson')).features, ...(await ne('ne_10m_lakes_europe.geojson')).features];
  const seen = new Set<string>();
  for (const f of lakes) {
    if (!touches(f.geometry)) continue;
    const key = JSON.stringify(f.geometry.coordinates).slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    // i nomi di Natural Earth per questi laghi non sono affidabili: si deducono dalla posizione
    const pts: Pos[] = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates.flat(1)[0];
    const lon = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const name = lon < 8.8 ? 'Lago Maggiore' : lon > 9.05 ? 'Lago di Como' : 'Lago di Lugano';
    out.push({ type: 'Feature', properties: { k: 'lake', name }, geometry: roundGeom(f.geometry) });
  }
  for (const f of (await ne('ne_10m_rivers_lake_centerlines.geojson')).features) {
    const parts = clipLines(f.geometry);
    if (parts.length) out.push({ type: 'Feature', properties: { k: 'river', name: f.properties.name ?? '' }, geometry: { type: 'MultiLineString', coordinates: parts } });
  }
  for (const f of (await ne('ne_10m_admin_0_boundary_lines_land.geojson')).features) {
    const parts = clipLines(f.geometry, 0.3);
    if (parts.length) out.push({ type: 'Feature', properties: { k: 'border' }, geometry: { type: 'MultiLineString', coordinates: parts } });
  }
  out.push(...await towns(perimeter));
  mkdirSync('public/data', { recursive: true });
  writeFileSync('public/data/contesto.geojson', JSON.stringify({ type: 'FeatureCollection', attribution: 'Natural Earth (pubblico dominio); città: © OpenStreetMap contributors', features: out }));
  const count = (k: string) => out.filter((f) => f.properties.k === k).length;
  console.log(`Contesto: ${count('lake')} laghi, ${count('river')} fiumi, ${count('border')} tratti di confine, ${count('place')} città`);
  console.log('  laghi:', out.filter((f) => f.properties.k === 'lake').map((f) => f.properties.name).join(', '));
  console.log('  città:', out.filter((f) => f.properties.k === 'place').map((f) => f.properties.name).join(', '));
}

await terrain();
await context();
