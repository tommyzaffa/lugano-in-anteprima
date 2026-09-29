import { useSyncExternalStore } from 'react';
import messages from './locales/messages.json';
export const LANGUAGES = ['it', 'en', 'fr', 'de'] as const;
export type Locale = typeof LANGUAGES[number];
export function detectLocale(languages: readonly string[]): Locale {
  for (const value of languages) { const base = value.toLowerCase().split(/[-_]/)[0]; if (LANGUAGES.includes(base as Locale)) return base as Locale; }
  return 'en';
}
function initialLocale(): Locale {
  try { const saved = localStorage.getItem('lia.language'); if (LANGUAGES.includes(saved as Locale)) return saved as Locale; } catch { /* private browsing */ }
  return detectLocale(typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);
}
let locale: Locale = initialLocale();
const listeners = new Set<() => void>();
export const getLocale = () => locale;
export function setLocale(value: string) {
  locale = LANGUAGES.includes(value as Locale) ? value as Locale : 'en';
  try { localStorage.setItem('lia.language', locale); } catch { /* storage optional */ }
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  for (const listener of listeners) listener();
}
export function useLocale() { return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, getLocale, () => 'en' as Locale); }
if (typeof document !== 'undefined') document.documentElement.lang = locale;
const catalogs = messages as unknown as Record<string, [string, string, string]>;
const index = { en: 0, fr: 1, de: 2 } as const;
const patterns = Object.entries(catalogs).filter(([s]) => /\{\d+\}/.test(s)).map(([source, translations]) => {
  const slots: number[] = [];
  const escaped = source.split(/(\{\d+\})/).map((part) => /^\{\d+\}$/.test(part) ? (slots.push(Number(part.slice(1, -1))), '(.*?)') : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
  return { regex: new RegExp(`^${escaped}$`, 's'), slots, translations };
});
const cache = new Map<string, string>();
export function translate(text: string, lang: Locale = locale, depth = 0): string {
  if (lang === 'it' || !text || depth > 4) return text;
  const trimmed = text.trim();
  const direct = catalogs[trimmed]?.[index[lang]];
  if (direct != null) return text.replace(trimmed, () => direct);
  const key = `${lang}:${text}`;
  if (cache.has(key)) return cache.get(key)!;
  let result = text;
  for (const { regex, slots, translations } of patterns) {
    const match = regex.exec(trimmed);
    if (!match) continue;
    result = text.replace(trimmed, () => translations[index[lang]].replace(/\{(\d+)\}/g, (_, n) => translate(match[slots.indexOf(Number(n)) + 1] ?? '', lang, depth + 1)));
    break;
  }
  if (result === text && / · |\n/.test(text)) result = text.split(/( · |\n)/).map((s) => translate(s, lang, depth + 1)).join('');
  if (cache.size >= 2500) cache.clear();
  cache.set(key, result);
  return result;
}
/** Localize rendered text only. React nodes, numbers and control values are untouched. */
export function tx<T>(value: T): T {
  if (typeof value === 'string') return translate(value) as T;
  if (Array.isArray(value)) return value.map((v) => tx(v)) as T;
  return value;
}
