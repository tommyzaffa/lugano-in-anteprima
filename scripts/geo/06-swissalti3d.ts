/**
 * Fase 1b — Terreno di dettaglio svizzero.
 * Scarica swissALTI3D (swisstopo, OGD, risoluzione 2 m, LV95 / EPSG:2056) dal
 * catalogo STAC per l'area buffer e lo fonde nei tile Terrarium locali:
 * ogni pixel riceve la media dei punti swissALTI3D che cadono nella sua
 * impronta; dove il dato svizzero manca (Italia, Campione, bordi) resta il
 * valore originale di Terrain Tiles (SRTM e altre fonti).
 *
 * Idempotente: i tile originali sono conservati in data/raw/terrain-srtm e ogni
 * esecuzione riparte da quelli.
 *
 * Conversione WGS84 → LV95 con le formule approssimate ufficiali di swisstopo
 * (precisione ~1 m, sufficiente per un modello a 2 m ricampionato a ≥ 6 m).
 * Attribuzione richiesta: «© swisstopo».
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { PNG } from 'pngjs';
import { fromArrayBuffer } from 'geotiff';

const perimeter = JSON.parse(readFileSync('data/geo/perimeter.json', 'utf8'));
const RAW = 'data/raw/swissalti3d';
const SRTM = 'data/raw/terrain-srtm';
const OUT = 'public/terrain';
const STAC = 'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d/items';
const NODATA = -9999;

/** WGS84 (gradi) → LV95 (m), formule approssimate swisstopo. */
export function wgs84ToLv95(lon: number, lat: number): [number, number] {
  const p = (lat * 3600 - 169028.66) / 10000;
  const l = (lon * 3600 - 26782.5) / 10000;
  const e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l * l * l;
  const n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p * p * p;
  return [e, n];
}

interface Tile { e0: number; n1: number; res: number; w: number; h: number; data: Float32Array }

async function listItems(): Promise<Map<string, { href: string; year: number }>> {
  const b = perimeter.buffer;
  const m = 0.03; // copre anche l'anello di tile attorno all'area
  let url: string | null = `${STAC}?bbox=${b.west - m},${b.south - m},${b.east + m},${b.north + m}&limit=100`;
  const latest = new Map<string, { href: string; year: number }>();
  while (url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`STAC ${res.status}`);
    const d: any = await res.json();
    for (const f of d.features) {
      const key = String(f.id).replace(/^swissalti3d_\d{4}_/, '');
      const year = Number(String(f.id).match(/_(\d{4})_/)?.[1] ?? 0);
      const asset: any = Object.values(f.assets).find((a: any) => a['eo:gsd'] === 2 && String(a.type).includes('geotiff'));
      if (!asset) continue;
      const prev = latest.get(key);
      if (!prev || prev.year < year) latest.set(key, { href: asset.href, year });
    }
    url = d.links?.find((l: any) => l.rel === 'next')?.href ?? null;
  }
  return latest;
}

async function download(items: Map<string, { href: string; year: number }>) {
  mkdirSync(RAW, { recursive: true });
  const jobs = [...items.values()];
  let done = 0, skipped = 0;
  const worker = async () => {
    while (jobs.length) {
      const j = jobs.shift()!;
      const file = join(RAW, j.href.split('/').pop()!);
      if (existsSync(file)) { skipped++; continue; }
      for (let a = 0; a < 3; a++) {
        try {
          const res = await fetch(j.href, { signal: AbortSignal.timeout(90000) });
          if (!res.ok) throw new Error(String(res.status));
          writeFileSync(file, Buffer.from(await res.arrayBuffer()));
          done++;
          break;
        } catch (e) { if (a === 2) console.warn('  ! fallito', file, (e as Error).message); }
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`swissALTI3D: ${items.size} tile (scaricati ${done}, già presenti ${skipped})`);
}

async function loadTiles(): Promise<Map<string, Tile>> {
  const tiles = new Map<string, Tile>();
  for (const f of readdirSync(RAW).filter((x) => x.endsWith('.tif'))) {
    const buf = readFileSync(join(RAW, f));
    const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const img = await tiff.getImage();
    const [e0, , , n1] = img.getBoundingBox();
    const w = img.getWidth(), h = img.getHeight();
    const [band] = (await img.readRasters()) as unknown as Float32Array[];
    const res = (img.getBoundingBox()[2] - e0) / w;
    tiles.set(`${Math.floor(e0 / 1000)}-${Math.floor((n1 - 1) / 1000)}`, { e0, n1, res, w, h, data: Float32Array.from(band) });
  }
  return tiles;
}

function makeSampler(tiles: Map<string, Tile>) {
  return (e: number, n: number): number => {
    const t = tiles.get(`${Math.floor(e / 1000)}-${Math.floor(n / 1000)}`);
    if (!t) return NaN;
    // centri dei pixel a (i+0.5)*res; interpolazione bilineare dentro il tile
    const fx = Math.min(t.w - 1, Math.max(0, (e - t.e0) / t.res - 0.5));
    const fy = Math.min(t.h - 1, Math.max(0, (t.n1 - n) / t.res - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(t.w - 1, x0 + 1), y1 = Math.min(t.h - 1, y0 + 1);
    const ax = fx - x0, ay = fy - y0;
    const v = (x: number, y: number) => t.data[y * t.w + x];
    const a = v(x0, y0), b = v(x1, y0), c = v(x0, y1), d = v(x1, y1);
    if (a <= NODATA || b <= NODATA || c <= NODATA || d <= NODATA) return NaN;
    return a * (1 - ax) * (1 - ay) + b * ax * (1 - ay) + c * (1 - ax) * ay + d * ax * ay;
  };
}

const tile2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tile2lat = (y: number, z: number) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

function fuse(sample: (e: number, n: number) => number) {
  if (!existsSync(SRTM)) { cpSync(OUT, SRTM, { recursive: true }); console.log(`Copia di sicurezza dei tile originali in ${SRTM}`); }
  let tilesChanged = 0, pixelsChanged = 0, pixelsTotal = 0;
  for (const z of readdirSync(SRTM).filter((d) => /^\d+$/.test(d)).map(Number).sort((a, b) => a - b)) {
    const pxMeters = (40075016.7 * Math.cos((46 * Math.PI) / 180)) / 2 ** z / 256;
    const k = Math.max(1, Math.min(6, Math.round(pxMeters / 3)));
    for (const x of readdirSync(join(SRTM, String(z)))) {
      for (const f of readdirSync(join(SRTM, String(z), x)).filter((q) => q.endsWith('.png'))) {
        const y = Number(f.replace('.png', ''));
        const src = join(SRTM, String(z), x, f);
        const png = PNG.sync.read(readFileSync(src));
        let changed = 0;
        for (let j = 0; j < 256; j++) {
          for (let i = 0; i < 256; i++) {
            let sum = 0, cnt = 0;
            for (let sj = 0; sj < k; sj++) {
              const lat = tile2lat(Number(y) + (j + (sj + 0.5) / k) / 256, z);
              for (let si = 0; si < k; si++) {
                const lon = tile2lon(Number(x) + (i + (si + 0.5) / k) / 256, z);
                const [e, n] = wgs84ToLv95(lon, lat);
                const v = sample(e, n);
                if (Number.isFinite(v)) { sum += v; cnt++; }
              }
            }
            pixelsTotal++;
            if (cnt < k * k * 0.6) continue;
            const v = sum / cnt + 32768;
            const o = (j * 256 + i) * 4;
            png.data[o] = Math.floor(v / 256);
            png.data[o + 1] = Math.floor(v) % 256;
            png.data[o + 2] = Math.floor((v - Math.floor(v)) * 256);
            png.data[o + 3] = 255;
            changed++;
          }
        }
        const dst = join(OUT, String(z), x, f);
        mkdirSync(dirname(dst), { recursive: true });
        writeFileSync(dst, changed ? PNG.sync.write(png) : readFileSync(src));
        if (changed) tilesChanged++;
        pixelsChanged += changed;
      }
    }
    console.log(`  z${z}: campioni per pixel ${k}×${k}`);
  }
  console.log(`Tile aggiornati: ${tilesChanged}; pixel con swissALTI3D: ${(100 * pixelsChanged / pixelsTotal).toFixed(1)}%`);
}

async function main() {
  const items = await listItems();
  await download(items);
  const t0 = Date.now();
  const tiles = await loadTiles();
  console.log(`Caricati ${tiles.size} tile swissALTI3D in ${Date.now() - t0} ms`);
  fuse(makeSampler(tiles));
  const meta = JSON.parse(readFileSync(join(OUT, 'tiles.json'), 'utf8'));
  meta.attribution = 'swissALTI3D © swisstopo (territorio svizzero, 2 m); altrove Terrain Tiles (Mapzen/AWS Open Data): SRTM, GMTED2010, ETOPO1 e altre fonti';
  meta.swissalti3d = { tiles: tiles.size, years: [...new Set([...items.values()].map((i) => i.year))].sort(), fusedAt: new Date().toISOString() };
  writeFileSync(join(OUT, 'tiles.json'), JSON.stringify(meta, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
