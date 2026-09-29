/**
 * Fase 1 — Perimetro geografico verificabile.
 *
 * Risolve i riferimenti territoriali richiesti dal brief (§3.1) interrogando
 * OpenStreetMap: nessuna coordinata è scritta a mano. Calcola:
 *  - core:      bounding box stretto dei riferimenti;
 *  - perimeter: area di prodotto (core + margine), esplorabile fin dall'avvio;
 *  - buffer:    area esterna usata per dati e percorsi che escono e rientrano.
 *
 * Output: data/geo/perimeter.json (versionato, verificabile).
 */
import { writeFileSync } from 'node:fs';
import { overpass } from '../lib/overpass.ts';

interface RefSpec {
  key: string;
  label: string;
  /** selettore Overpass che deve restituire esattamente l'elemento di riferimento */
  selector: string;
  kind: string;
  /** comune/entità amministrativa indicativa; verificata poi per punto-in-poligono */
  note?: string;
}

// Area di ricerca generosa per i selettori (non è il perimetro).
const SEARCH = '45.90,8.85,46.10,9.10';

const REFS: RefSpec[] = [
  { key: 'bissone', label: "Bissone", selector: `node(32457650)`, kind: 'place' },
  { key: 'ponte-capriasca', label: "Ponte Capriasca", selector: `node(240023746)`, kind: 'place' },
  { key: 'savosa', label: "Savosa", selector: `node(240030301)`, kind: 'place' },
  { key: 'porza', label: "Porza", selector: `node(240037919)`, kind: 'place' },
  { key: 'magliaso', label: "Magliaso", selector: `node(240044243)`, kind: 'place' },
  { key: 'vezia', label: "Vezia", selector: `node(240048246)`, kind: 'place' },
  { key: 'bedano', label: "Bedano", selector: `node(240049575)`, kind: 'place' },
  { key: 'torricella-taverne', label: "Torricella-Taverne", selector: `node(240056519)`, kind: 'place' },
  { key: 'villa-luganese', label: "Villa Luganese", selector: `node(240062533)`, kind: 'place' },
  { key: 'cademario', label: "Cademario", selector: `node(240083175)`, kind: 'place' },
  { key: 'barbengo', label: "Barbengo", selector: `node(240097323)`, kind: 'place' },
  { key: 'origlio', label: "Origlio", selector: `node(240106810)`, kind: 'place' },
  { key: 'grancia', label: "Grancia", selector: `node(240112584)`, kind: 'place' },
  { key: 'vico-morcote', label: "Vico Morcote", selector: `node(240115987)`, kind: 'place' },
  { key: 'lamone', label: "Lamone", selector: `node(240126407)`, kind: 'place' },
  { key: 'carabbia', label: "Carabbia", selector: `node(240127658)`, kind: 'place' },
  { key: 'caslano', label: "Caslano", selector: `node(279734796)`, kind: 'place' },
  { key: 'arogno', label: "Arogno", selector: `node(279737582)`, kind: 'place' },
  { key: 'comano', label: "Comano", selector: `node(386235437)`, kind: 'place' },
  { key: 'pura', label: "Pura", selector: `node(392428791)`, kind: 'place' },
  { key: 'sonvico', label: "Sonvico", selector: `node(415631838)`, kind: 'place' },
  { key: 'cadempino', label: "Cadempino", selector: `node(437971566)`, kind: 'place' },
  { key: 'tesserete', label: "Tesserete", selector: `node(441785427)`, kind: 'place' },
  { key: 'manno', label: "Manno", selector: `node(442529652)`, kind: 'place' },
  { key: 'pazzallo', label: "Pazzallo", selector: `node(1656946258)`, kind: 'place' },
  { key: 'gravesano', label: "Gravesano", selector: `node(2268345523)`, kind: 'place' },
  { key: 'agno', label: "Agno", selector: `node(3161437126)`, kind: 'place' },
  { key: 'bioggio', label: "Bioggio", selector: `node(3503955029)`, kind: 'place' },
  { key: 'cureglia', label: "Cureglia", selector: `node(3506853552)`, kind: 'place' },
  { key: 'cadro', label: "Cadro", selector: `node(13075229509)`, kind: 'place' },
  { key: 'lugano-centro', label: 'Lugano (centro)', selector: `node(1376769426)`, kind: 'place' },
  { key: 'stazione', label: 'Stazione FFS di Lugano', selector: `node["railway"="station"]["name"="Lugano"](${SEARCH})`, kind: 'station' },
  { key: 'parco-ciani', label: 'Parco Ciani', selector: `way["leisure"="park"]["name"~"Ciani"](${SEARCH})`, kind: 'park' },
  { key: 'lac', label: 'LAC Lugano Arte e Cultura', selector: `nwr["name"~"^LAC"]["amenity"="arts_centre"](${SEARCH})`, kind: 'culture' },
  { key: 'molino-nuovo', label: 'Molino Nuovo', selector: `node(393185602)`, kind: 'place' },
  { key: 'viganello', label: 'Viganello', selector: `node(392442221)`, kind: 'place' },
  { key: 'cassarate', label: 'Cassarate', selector: `node(240125127)`, kind: 'place' },
  { key: 'pregassona', label: 'Pregassona', selector: `node(390040422)`, kind: 'place' },
  { key: 'castagnola', label: 'Castagnola', selector: `node(2247740482)`, kind: 'place' },
  { key: 'monte-bre', label: 'Monte Brè (vetta)', selector: `node(291524462)`, kind: 'peak' },
  { key: 'bre-paese', label: 'Brè sopra Lugano (paese)', selector: `node(832055733)`, kind: 'place' },
  { key: 'gandria', label: 'Gandria', selector: `node(20600198)`, kind: 'place' },
  { key: 'monte-boglia', label: 'Monte Boglia (vetta)', selector: `node(415867212)`, kind: 'peak' },
  { key: 'paradiso', label: 'Paradiso', selector: `node(240120177)`, kind: 'place' },
  { key: 'san-salvatore', label: 'Monte San Salvatore (vetta)', selector: `node(26863960)`, kind: 'peak' },
  { key: 'carona', label: 'Carona', selector: `node(240026247)`, kind: 'place' },
  { key: 'melide', label: 'Melide', selector: `node(32457646)`, kind: 'place' },
  { key: 'massagno', label: 'Massagno', selector: `node(2574329904)`, kind: 'place' },
  { key: 'breganzona', label: 'Breganzona', selector: `node(395304321)`, kind: 'place' },
  { key: 'sorengo', label: 'Sorengo', selector: `node(2570866824)`, kind: 'place' },
  { key: 'muzzano', label: 'Muzzano', selector: `node(240081060)`, kind: 'place' },
  { key: 'montagnola', label: "Montagnola (Collina d'Oro)", selector: `node(279808322)`, kind: 'place' },
  { key: 'gentilino', label: "Gentilino (Collina d'Oro)", selector: `node(575992088)`, kind: 'place' },
  { key: 'agra', label: "Agra (Collina d'Oro)", selector: `node(575994370)`, kind: 'place' },
  { key: 'canobbio', label: 'Canobbio', selector: `node(3487391675)`, kind: 'place' },
  { key: 'davesco', label: 'Davesco (Davesco-Soragno)', selector: `node(415299111)`, kind: 'place' },
  { key: 'soragno', label: 'Soragno (Davesco-Soragno)', selector: `node(415299107)`, kind: 'place' },
];

const M_PER_DEG_LAT = 111_320;
function expand(b: Bbox, meters: number): Bbox {
  const midLat = (b.south + b.north) / 2;
  const dLat = meters / M_PER_DEG_LAT;
  const dLon = meters / (M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180));
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  return { south: r(b.south - dLat), west: r(b.west - dLon), north: r(b.north + dLat), east: r(b.east + dLon) };
}
interface Bbox { south: number; west: number; north: number; east: number }

function center(el: any): [number, number] {
  if (el.lat != null) return [el.lon, el.lat];
  if (el.center) return [el.center.lon, el.center.lat];
  if (el.bounds) return [(el.bounds.minlon + el.bounds.maxlon) / 2, (el.bounds.minlat + el.bounds.maxlat) / 2];
  throw new Error('elemento senza coordinate ' + el.type + el.id);
}

async function main() {
  const q = `[out:json][timeout:90];\n` + REFS.map((r, i) => `${r.selector}->.r${i};`).join('\n') +
    '\n' + REFS.map((_, i) => `.r${i} out tags center;`).join('\n');
  // Una query per riferimento: gli elementi in output non portano il nome del set,
  // quindi eseguiamo query separate per associare in modo univoco.
  const resolved: any[] = [];
  let osmTimestamp = '';
  for (const ref of REFS) {
    const res = await overpass(`ref-${ref.key}`, `[out:json][timeout:60];\n${ref.selector};\nout tags center;`);
    osmTimestamp = res.osm3s?.timestamp_osm_base ?? osmTimestamp;
    const els = res.elements;
    if (els.length === 0) throw new Error(`Riferimento non trovato: ${ref.key}`);
    // Con più risultati (es. stazione con più nodi) scegliamo il primo e annotiamo il numero.
    const el = els[0];
    const [lon, lat] = center(el);
    resolved.push({
      key: ref.key,
      label: ref.label,
      kind: ref.kind,
      osm: `${el.type}/${el.id}`,
      osmName: el.tags?.name ?? null,
      lon: Math.round(lon * 1e6) / 1e6,
      lat: Math.round(lat * 1e6) / 1e6,
      ele: el.tags?.ele ? Number(el.tags.ele) : null,
      candidates: els.length,
    });
  }
  void q;
  const core: Bbox = {
    south: Math.min(...resolved.map((r) => r.lat)),
    north: Math.max(...resolved.map((r) => r.lat)),
    west: Math.min(...resolved.map((r) => r.lon)),
    east: Math.max(...resolved.map((r) => r.lon)),
  };
  const PERIMETER_MARGIN_M = 1500;
  const BUFFER_MARGIN_M = 2500;
  const perimeter = expand(core, PERIMETER_MARGIN_M);
  const buffer = expand(perimeter, BUFFER_MARGIN_M);

  // Verifica: ogni riferimento dentro il perimetro con almeno 1 km di margine.
  for (const r of resolved) {
    const inside = r.lat > perimeter.south && r.lat < perimeter.north && r.lon > perimeter.west && r.lon < perimeter.east;
    if (!inside) throw new Error(`Riferimento fuori perimetro: ${r.key}`);
  }
  const widthKm = ((perimeter.east - perimeter.west) * M_PER_DEG_LAT * Math.cos((((perimeter.south + perimeter.north) / 2) * Math.PI) / 180)) / 1000;
  const heightKm = ((perimeter.north - perimeter.south) * M_PER_DEG_LAT) / 1000;

  const out = {
    description: 'Perimetro di prodotto di «Lugano in anteprima». Copertura territoriale: include comuni distinti (non sono tutti quartieri del Comune di Lugano).',
    crs: 'EPSG:4326 (WGS84, gradi decimali). Margini espressi in metri e convertiti con approssimazione sferica locale.',
    generatedAt: new Date().toISOString(),
    source: { name: 'OpenStreetMap via Overpass API', license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors', osmTimestamp },
    margins: { perimeterMeters: PERIMETER_MARGIN_M, bufferMeters: BUFFER_MARGIN_M },
    core,
    perimeter,
    buffer,
    sizeKm: { width: Math.round(widthKm * 10) / 10, height: Math.round(heightKm * 10) / 10 },
    polygon: {
      type: 'Polygon',
      coordinates: [[
        [perimeter.west, perimeter.south], [perimeter.east, perimeter.south],
        [perimeter.east, perimeter.north], [perimeter.west, perimeter.north], [perimeter.west, perimeter.south],
      ]],
    },
    references: resolved,
  };
  writeFileSync('data/geo/perimeter.json', JSON.stringify(out, null, 2));
  console.log('Perimetro:', perimeter, `${out.sizeKm.width}×${out.sizeKm.height} km`);
  console.log('Buffer:', buffer);
}

main().catch((e) => { console.error(e); process.exit(1); });
