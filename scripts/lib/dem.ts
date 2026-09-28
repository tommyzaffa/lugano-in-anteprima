/**
 * Campionatore altimetrico dai tile Terrarium locali (public/terrain).
 * Interpolazione bilineare; quote in metri sul livello del mare.
 * Le quote servono a stimare dislivelli; non sono misure ufficiali.
 */
import { readFileSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';

export class Dem {
  private cache = new Map<string, Float32Array | null>();
  private dir: string;
  private z: number;
  constructor(dir = 'public/terrain', z = 14) { this.dir = dir; this.z = z; }

  private tile(x: number, y: number): Float32Array | null {
    const key = `${x}/${y}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const file = `${this.dir}/${this.z}/${x}/${y}.png`;
    let data: Float32Array | null = null;
    if (existsSync(file)) {
      const png = PNG.sync.read(readFileSync(file));
      data = new Float32Array(png.width * png.height);
      for (let i = 0; i < png.width * png.height; i++) {
        const r = png.data[i * 4], g = png.data[i * 4 + 1], b = png.data[i * 4 + 2];
        data[i] = r * 256 + g + b / 256 - 32768;
      }
    }
    this.cache.set(key, data);
    return data;
  }

  /** Quota in metri (NaN se fuori copertura). */
  sample(lon: number, lat: number): number {
    const n = 2 ** this.z;
    const xf = ((lon + 180) / 360) * n;
    const r = (lat * Math.PI) / 180;
    const yf = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
    const px = xf * 256 - 0.5, py = yf * 256 - 0.5;
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const fx = px - x0, fy = py - y0;
    const v = (gx: number, gy: number) => {
      const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256);
      const t = this.tile(tx, ty);
      if (!t) return NaN;
      return t[(gy - ty * 256) * 256 + (gx - tx * 256)];
    };
    const a = v(x0, y0), b = v(x0 + 1, y0), c = v(x0, y0 + 1), d = v(x0 + 1, y0 + 1);
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  }
}

export function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371008.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
