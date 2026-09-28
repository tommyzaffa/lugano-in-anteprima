/** Utility per griglie di tile Web Mercator (EPSG:3857, schema XYZ). */
export function lon2tile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
export function lat2tile(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}
export function tile2lon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}
export function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
export interface Bbox { south: number; west: number; north: number; east: number }
export function tilesInBbox(b: Bbox, z: number): { x: number; y: number }[] {
  const x0 = lon2tile(b.west, z), x1 = lon2tile(b.east, z);
  const y0 = lat2tile(b.north, z), y1 = lat2tile(b.south, z);
  const out: { x: number; y: number }[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ x, y });
  return out;
}
