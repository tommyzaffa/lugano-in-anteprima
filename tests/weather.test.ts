/**
 * Meteo reale (Open-Meteo) con risposta simulata: nessuna chiamata di rete nei test.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DateTime } from 'luxon';
import { openMeteo, weatherFor } from '../src/server/adapters/weather.ts';
import { weatherWindow } from '../src/shared/weather.ts';
import { config } from '../src/server/config.ts';
import { TZ } from '../src/shared/types.ts';

const day = DateTime.now().setZone(TZ).plus({ days: 1 }).toFormat('yyyy-MM-dd');
const next = DateTime.fromISO(day, { zone: TZ }).plus({ days: 1 }).toFormat('yyyy-MM-dd');
// 48 ore: asciutto il giorno richiesto, pioggia la notte seguente dopo le 02:00
const times = [...Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, '0')}:00`), ...Array.from({ length: 24 }, (_, h) => `${next}T${String(h).padStart(2, '0')}:00`)];
const body = {
  hourly: {
    time: times,
    temperature_2m: times.map((_, i) => 10 + (i % 24) / 2),
    precipitation: times.map((_, i) => (i >= 26 ? 2 : 0)),
    precipitation_probability: times.map((_, i) => (i >= 26 ? 90 : 5)),
    weather_code: times.map((_, i) => (i >= 26 ? 63 : 1)),
  },
};

const original = config.weather.provider;
afterEach(() => { vi.unstubAllGlobals(); config.weather.provider = original; });

describe('meteo Open-Meteo', () => {
  it('chiede la giornata a Zurigo senza dati personali e interpreta le ore locali', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const snap = await openMeteo.forecast(day);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('timezone')).toBe('Europe/Zurich');
    expect(url.searchParams.get('start_date')).toBe(day);
    expect(url.searchParams.get('latitude')).toBe('46.004');
    expect(snap.status).toBe('live');
    expect(snap.hours).toHaveLength(48);
    // le 14:00 locali sono le 14:00 di Zurigo, qualunque sia il fuso del processo
    expect(DateTime.fromISO(snap.hours[14].time).setZone(TZ).hour).toBe(14);
    // la sintesi riguarda solo la giornata richiesta, asciutta
    expect(snap.summary).toBe('Nessuna pioggia significativa prevista');
  });
  it('la sintesi sulla fascia del programma distingue giorno asciutto e notte piovosa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    const snap = await openMeteo.forecast(day);
    const at = (d: string, h: number) => DateTime.fromISO(d, { zone: TZ }).set({ hour: h }).toMillis();
    const dayWin = weatherWindow(snap, at(day, 10), at(day, 18))!;
    expect(dayWin.rainHours).toBe(0);
    expect(dayWin.label).toBe('sereno');
    expect(dayWin.minC).toBe(15);
    const nightWin = weatherWindow(snap, at(day, 20), at(next, 4))!;
    expect(nightWin.rainHours).toBeGreaterThan(0);
    expect(nightWin.icon).toBe('☂');
  });
  it('oltre l\'orizzonte non inventa: nessuna richiesta e stato dichiarato', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const far = DateTime.now().setZone(TZ).plus({ days: 30 }).toFormat('yyyy-MM-dd');
    const snap = await openMeteo.forecast(far);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.status).toBe('out_of_horizon');
    expect(weatherWindow(snap, 0, Date.now())).toBeNull();
  });
  it('servizio non raggiungibile: stato «non disponibile», mai una previsione inventata', async () => {
    config.weather.provider = 'open-meteo';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rete assente'); }));
    const snap = await weatherFor({ date: next });
    expect(snap?.status).toBe('unavailable');
    expect(snap?.hours).toEqual([]);
  });
});
