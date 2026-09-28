/**
 * Client minimale per l'Overpass API di OpenStreetMap, con cache su disco.
 * I dati OSM sono © OpenStreetMap contributors, licenza ODbL.
 * Le risposte grezze finiscono in data/raw/osm (non versionate).
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const RAW_OSM_DIR = join(process.cwd(), 'data', 'raw', 'osm');
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = 'LuganoInAnteprima-dev/0.1 (import editoriale locale; contatto: sviluppo locale)';

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: ({ lat: number; lon: number } | null)[];
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[]; lat?: number; lon?: number }[];
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
}

export interface OverpassResult {
  osm3s?: { timestamp_osm_base?: string; copyright?: string };
  elements: OverpassElement[];
}

export async function overpass(name: string, query: string, opts: { refresh?: boolean } = {}): Promise<OverpassResult> {
  mkdirSync(RAW_OSM_DIR, { recursive: true });
  const file = join(RAW_OSM_DIR, `${name}.json`);
  if (!opts.refresh && existsSync(file)) {
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const t0 = Date.now();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
      const text = await res.text();
      const json = JSON.parse(text) as OverpassResult;
      if ((json as any).remark && String((json as any).remark).includes('error')) {
        throw new Error('Overpass remark: ' + (json as any).remark);
      }
      writeFileSync(file, text);
      console.log(`  ✓ ${name}: ${json.elements.length} elementi, ${(text.length / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      return json;
    } catch (err) {
      lastErr = err;
      console.warn(`  ! ${name} tentativo ${attempt + 1} fallito: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export function bboxString(b: { south: number; west: number; north: number; east: number }): string {
  return `${b.south},${b.west},${b.north},${b.east}`;
}
