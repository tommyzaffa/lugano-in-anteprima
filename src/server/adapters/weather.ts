/**
 * Adattatore meteo.
 *  - open-meteo: previsioni orarie (modelli MeteoSvizzera ICON-CH via Open-Meteo),
 *    orizzonte massimo 16 giorni; gratuito per uso non commerciale (vedi docs).
 *  - demo: fixture deterministica, dichiarata come tale.
 *  - none: meteo non considerato.
 * Nessun dato personale viene inviato: solo le coordinate del centro di Lugano.
 */
import { DateTime } from 'luxon';
import type { WeatherSnapshot, GroupRequest } from '../../shared/types.ts';
import { TZ } from '../../shared/types.ts';
import { config } from '../config.ts';

const cache = new Map<string, { at: number; snap: WeatherSnapshot }>();
const HORIZON_DAYS = 14;

export interface WeatherProvider { name: string; forecast(date: string): Promise<WeatherSnapshot> }

export const demoWeather: WeatherProvider = {
  name: 'demo',
  async forecast(date: string) {
    // fixture: giornate asciutte, tranne i giorni del mese divisibili per 7 (pioggia dimostrativa nel pomeriggio)
    const day = Number(date.slice(8, 10));
    const rainy = day % 7 === 0;
    const hours = Array.from({ length: 24 }, (_, h) => ({
      time: DateTime.fromISO(date, { zone: TZ }).set({ hour: h }).toISO()!,
      tempC: Math.round((12 + 7 * Math.sin(((h - 8) / 24) * Math.PI * 2)) * 10) / 10,
      precipMm: rainy && h >= 13 && h <= 19 ? 1.8 : 0,
      precipProb: rainy && h >= 13 && h <= 19 ? 80 : 10,
      code: rainy && h >= 13 && h <= 19 ? 61 : 1,
    }));
    return { source: 'Fixture meteo dimostrativa', status: 'demo', fetchedAt: new Date().toISOString(), horizonDays: HORIZON_DAYS, hours, summary: rainy ? 'Pioggia nel pomeriggio (dimostrativa)' : 'Prevalentemente sereno (dimostrativo)', note: 'Dato inventato per la demo: non è una previsione.' };
  },
};

export const openMeteo: WeatherProvider = {
  name: 'open-meteo',
  async forecast(date: string) {
    const today = DateTime.now().setZone(TZ).startOf('day');
    const target = DateTime.fromISO(date, { zone: TZ });
    const days = target.diff(today, 'days').days;
    if (days > HORIZON_DAYS || days < -1) {
      return { source: 'Open-Meteo (MeteoSvizzera ICON-CH)', status: 'out_of_horizon', fetchedAt: new Date().toISOString(), horizonDays: HORIZON_DAYS, hours: [], note: `Previsioni disponibili solo fino a ${HORIZON_DAYS} giorni.` };
    }
    const url = new URL(config.weather.openMeteoUrl);
    url.searchParams.set('latitude', '46.004');
    url.searchParams.set('longitude', '8.951');
    url.searchParams.set('hourly', 'temperature_2m,precipitation,precipitation_probability,weather_code');
    url.searchParams.set('timezone', 'Europe/Zurich');
    url.searchParams.set('start_date', date);
    url.searchParams.set('end_date', target.plus({ days: 1 }).toFormat('yyyy-MM-dd'));
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const j: any = await res.json();
    const h = j.hourly ?? {};
    const hours = (h.time ?? []).map((t: string, i: number) => ({
      time: DateTime.fromISO(t, { zone: TZ }).toISO()!,
      tempC: h.temperature_2m?.[i] ?? null,
      precipMm: h.precipitation?.[i] ?? null,
      precipProb: h.precipitation_probability?.[i] ?? null,
      code: h.weather_code?.[i] ?? null,
    }));
    const rainHours = hours.filter((x: any) => (x.precipProb ?? 0) >= 60 || (x.precipMm ?? 0) >= 1).length;
    return {
      source: 'Open-Meteo (modelli MeteoSvizzera ICON-CH e globali)', status: 'live', fetchedAt: new Date().toISOString(), horizonDays: HORIZON_DAYS, hours,
      summary: rainHours ? `Possibile pioggia (${rainHours} ore con probabilità elevata)` : 'Nessuna pioggia significativa prevista',
      note: `Previsione a ${Math.max(0, Math.round(days))} giorni: l'affidabilità diminuisce con l'orizzonte.`,
    };
  },
};

export function weatherProvider(): WeatherProvider | null {
  if (config.weather.provider === 'open-meteo') return openMeteo;
  if (config.weather.provider === 'demo') return demoWeather;
  return null;
}

export async function weatherFor(req: Pick<GroupRequest, 'date'>, onHealth?: (status: string, detail: string) => void): Promise<WeatherSnapshot | null> {
  const p = weatherProvider();
  if (!p) return null;
  const key = `${p.name}:${req.date}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 3 * 3600_000) return hit.snap;
  try {
    const snap = await p.forecast(req.date);
    cache.set(key, { at: Date.now(), snap });
    onHealth?.('ok', `${p.name}: ${snap.status}`);
    return snap;
  } catch (e) {
    onHealth?.('error', `${p.name}: ${(e as Error).message}`);
    const stale = hit?.snap;
    if (stale) return { ...stale, note: `${stale.note ?? ''} Dato non aggiornato: fonte non raggiungibile (ultimo aggiornamento ${stale.fetchedAt}).`.trim() };
    return { source: p.name, status: 'unavailable', fetchedAt: new Date().toISOString(), horizonDays: HORIZON_DAYS, hours: [], note: 'Servizio meteo non raggiungibile.' };
  }
}
