/**
 * Fase 1 — Terreno.
 * Scarica i tile altimetrici "Terrarium" (Terrain Tiles, AWS Open Data / Mapzen)
 * per l'area buffer e li serve in locale da public/terrain/{z}/{x}/{y}.png.
 *
 * Codifica Terrarium: quota (m) = R*256 + G + B/256 - 32768.
 * Fonti del dataset (attribuzione richiesta): SRTM, GMTED2010, ETOPO1, NED, ecc.
 * Vedi https://github.com/tilezen/joerd/blob/master/docs/attribution.md
 *
 * Per un dettaglio superiore in territorio svizzero è predisposto l'upgrade verso
 * swissALTI3D (swisstopo, OGD) — vedi docs/FONTI.md.
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { tilesInBbox } from '../lib/tiles.ts';

const perimeter = JSON.parse(readFileSync('data/geo/perimeter.json', 'utf8'));
const MIN_Z = 8;
const MAX_Z = 14;
const URL = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

async function main() {
  const jobs: { z: number; x: number; y: number }[] = [];
  for (let z = MIN_Z; z <= MAX_Z; z++) {
    for (const t of tilesInBbox(perimeter.buffer, z)) jobs.push({ z, ...t });
  }
  console.log(`Tile terreno da scaricare: ${jobs.length}`);
  let done = 0, skipped = 0;
  const worker = async () => {
    while (jobs.length) {
      const j = jobs.shift()!;
      const file = `public/terrain/${j.z}/${j.x}/${j.y}.png`;
      if (existsSync(file)) { skipped++; continue; }
      mkdirSync(dirname(file), { recursive: true });
      for (let a = 0; a < 3; a++) {
        try {
          const res = await fetch(URL(j.z, j.x, j.y), { signal: AbortSignal.timeout(30000) });
          if (!res.ok) throw new Error(String(res.status));
          writeFileSync(file, Buffer.from(await res.arrayBuffer()));
          done++;
          break;
        } catch (e) {
          if (a === 2) console.warn('  ! fallito', file, (e as Error).message);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  writeFileSync('public/terrain/tiles.json', JSON.stringify({
    tilejson: '3.0.0',
    name: 'Terrarium — area Lugano in anteprima',
    encoding: 'terrarium',
    minzoom: MIN_Z,
    maxzoom: MAX_Z,
    bounds: [perimeter.buffer.west, perimeter.buffer.south, perimeter.buffer.east, perimeter.buffer.north],
    attribution: 'Terrain Tiles (Mapzen/AWS Open Data): SRTM, GMTED2010, ETOPO1 e altre fonti',
    fetchedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`Scaricati ${done}, già presenti ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
