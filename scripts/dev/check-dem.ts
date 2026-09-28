// Confronto delle quote di vette note (OSM tag ele) fra i tile originali e quelli fusi con swissALTI3D.
import { readFileSync } from 'node:fs';
import { Dem } from '../lib/dem.ts';
const old = new Dem('data/raw/terrain-srtm'), cur = new Dem('public/terrain');
const peaks = [
  ['Monte San Salvatore', 8.947302, 45.977112, 912],
  ['Monte Brè', 8.98741, 46.009085, 925],
  ['Monte Boglia', 9.0076, 46.0298, 1516],
  ['Lago (Paradiso)', 8.9500, 45.9900, 271],
  ['Stazione FFS', 8.9468, 46.0055, 335],
];
for (const [name, lon, lat, ele] of peaks as [string, number, number, number][]) {
  const a = old.sample(lon, lat), b = cur.sample(lon, lat);
  console.log(`${name.padEnd(22)} rif ${String(ele).padStart(5)}  SRTM ${a.toFixed(0).padStart(5)} (${(a - ele).toFixed(0)})  fuso ${b.toFixed(0).padStart(5)} (${(b - ele).toFixed(0)})`);
}
