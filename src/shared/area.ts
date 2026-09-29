import type { GroupRequest } from './types.ts';

export interface MapArea { id: string; label: string; lon: number; lat: number }
export function distanceKm(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
/** Stops must remain inside the chosen area. Transfers may cross its boundary. */
export function inArea(point: { lon: number; lat: number }, area: GroupRequest['area']): boolean {
  return !area || distanceKm(point, area.center) <= area.radiusKm;
}
export interface AreaAdvice {
  label: string;
  radiusKm: number;
  activities: number;
  events: number;
  alternatives: { label: string; distanceKm: number; activities: number; events: number; area: NonNullable<GroupRequest['area']> }[];
}
