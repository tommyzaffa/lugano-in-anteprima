/**
 * Controllo dei dati indipendente dalla data: si esegue anche dopo ogni aggiornamento
 * automatico (orario, mappa, eventi) prima di pubblicarlo. Usa un giorno coperto dall'orario
 * in uso, qualunque sia l'anno orario importato.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { DateTime } from 'luxon';
import { DataStore } from '../src/server/data.ts';
import { planAlternatives } from '../src/server/planner/index.ts';
import { GroupRequest } from '../src/shared/types.ts';
import { TZ } from '../src/shared/time.ts';

let data: DataStore;
let day: string;
beforeAll(() => {
  data = new DataStore('data', { events: 'auto' }); data.load();
  const { start, end } = data.transit.feedRange;
  const iso = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  // un sabato fra 3 e 10 giorni da oggi, se coperto dall'orario; altrimenti un sabato a metà del periodo
  let d = DateTime.now().setZone(TZ).plus({ days: 3 });
  while (d.weekday !== 6) d = d.plus({ days: 1 });
  day = d.toFormat('yyyy-MM-dd');
  if (!data.transit.covers(day)) {
    let m = DateTime.fromISO(iso(start), { zone: TZ }).plus({ days: Math.floor(DateTime.fromISO(iso(end)).diff(DateTime.fromISO(iso(start)), 'days').days / 2) });
    while (m.weekday !== 6) m = m.plus({ days: 1 });
    day = m.toFormat('yyyy-MM-dd');
  }
});

const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short', tone: '#f0cfa8' };
const req = (p: Record<string, unknown>) => GroupRequest.parse({
  date: day, start: { kind: 'stop', label: 'Stazione FFS di Lugano', lon: 8.946849, lat: 46.005499 }, end: { mode: 'same' },
  occasion: 'leisure', budget: { per: 'person', strict: false }, people: [0, 1].map((i) => ({ id: `p${i}`, name: `P${i}`, kind: 'adult', avatar: av, interests: [] })),
  startTime: '09:30', endTime: '18:00', ...p,
});

describe('dati pubblicati', () => {
  it('catalogo, orario e grafo sono coerenti', () => {
    expect(data.places.size).toBeGreaterThan(50);
    expect(data.transit.d.trips.length).toBeGreaterThan(1000);
    expect(data.transit.covers(day)).toBe(true);
    for (const ev of data.events.values()) expect(data.places.has(ev.placeId)).toBe(true);
  });
  it('una giornata tipo produce proposte valide con i mezzi dell\'orario ufficiale', async () => {
    const r = await planAlternatives(req({ moods: ['views', 'nature'], pace: 'intense' }), { data });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.alternatives.length).toBeGreaterThanOrEqual(2);
    const rides = r.alternatives.flatMap((p) => p.trips.flatMap((t) => t.legs)).filter((l) => l.transit);
    expect(rides.length).toBeGreaterThan(0);
    for (const p of r.alternatives) expect(p.checks.find((c) => c.id === 'transit')?.status).not.toBe('violated');
  });
  it('una serata in centro produce proposte', async () => {
    const people = [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, kind: 'adult', avatar: av, interests: [] }));
    const r = await planAlternatives(req({ people, startTime: '18:30', endTime: '23:30', occasion: 'friends', moods: ['chill', 'lively'] }), { data });
    expect(r.status).toBe('ok');
  });
});
