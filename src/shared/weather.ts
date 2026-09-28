/**
 * Sintesi del meteo sulla fascia oraria del programma (non sull'intera previsione scaricata).
 * Codici meteo WMO come in Open-Meteo: 0 sereno, 1–3 nuvoloso, 45–48 nebbia, 51–67 pioggia,
 * 71–77 neve, 80–82 rovesci, 95–99 temporale.
 */
import type { WeatherSnapshot } from './types.ts';

export interface WeatherWindow {
  minC: number | null;
  maxC: number | null;
  rainHours: number;
  /** icona e parola brevi per l'interfaccia */
  icon: string;
  label: string;
}

export function weatherWindow(w: WeatherSnapshot | null | undefined, startMs: number, endMs: number): WeatherWindow | null {
  if (!w || !w.hours.length || (w.status !== 'live' && w.status !== 'demo')) return null;
  const hrs = w.hours.filter((h) => { const t = Date.parse(h.time); return t >= startMs - 3_600_000 && t <= endMs; });
  if (!hrs.length) return null;
  const temps = hrs.map((h) => h.tempC).filter((x): x is number => x != null);
  const rainHours = hrs.filter((h) => (h.precipProb ?? 0) >= 60 || (h.precipMm ?? 0) >= 1).length;
  const codes = hrs.map((h) => h.code ?? 0);
  const worst = Math.max(...codes);
  const cloudy = codes.filter((c) => c >= 2 && c <= 3).length > hrs.length / 2;
  const [icon, label] = worst >= 95 ? ['⛈', 'temporali'] : worst >= 71 && worst <= 77 ? ['❄', 'neve']
    : rainHours ? ['☂', rainHours >= hrs.length / 2 ? 'pioggia' : 'possibile pioggia']
    : worst >= 45 && worst <= 48 ? ['🌫', 'nebbia'] : cloudy ? ['☁', 'nuvoloso'] : ['☀', 'sereno'];
  return { minC: temps.length ? Math.round(Math.min(...temps)) : null, maxC: temps.length ? Math.round(Math.max(...temps)) : null, rainHours, icon, label };
}
