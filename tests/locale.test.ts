import { afterEach, expect, it, vi } from 'vitest';
import { detectLocale, setLocale, getLocale, translate, tx } from '../src/client/locale.ts';
import messages from '../src/client/locales/messages.json';
afterEach(() => { vi.unstubAllGlobals(); setLocale('en'); });
it('selects supported browser preferences including regional variants, with English fallback', () => {
  expect(detectLocale(['fr-CH', 'en-US'])).toBe('fr');
  expect(detectLocale(['DE_ch'])).toBe('de');
  expect(detectLocale(['it-CH'])).toBe('it');
  expect(detectLocale(['es-ES', 'de-DE'])).toBe('de');
  expect(detectLocale(['es-ES'])).toBe('en');
  expect(detectLocale([])).toBe('en');
});
it('persists manual selection and updates document language', () => {
  const setItem = vi.fn();
  const document = { documentElement: { lang: '' } };
  vi.stubGlobal('localStorage', { setItem }); vi.stubGlobal('document', document);
  setLocale('fr');
  expect(getLocale()).toBe('fr'); expect(document.documentElement.lang).toBe('fr');
  expect(setItem).toHaveBeenCalledWith('lia.language', 'fr');
  expect(tx('Esplora')).toBe('Explorer');
  setLocale('unsupported'); expect(getLocale()).toBe('en');
});
it('all translations preserve interpolation slots', () => {
  const slots = (s: string) => [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
  for (const [source, translations] of Object.entries(messages)) {
    expect(translations).toHaveLength(3);
    for (const value of translations) { expect(value.trim().length).toBeGreaterThan(0); expect(slots(value), source).toEqual(slots(source)); }
  }
});
it('keeps source content and React nodes intact, translates compound labels', () => {
  expect(translate('Museo Hermann Hesse', 'fr')).toBe('Museo Hermann Hesse');
  expect(translate('  Esplora  ', 'en')).toBe('  Explore  ');
  expect(translate('Esplora · Eventi', 'en')).toBe('Explore · Events');
  expect(translate('Esplora', 'it')).toBe('Esplora');
  const node = { type: 'div', props: { children: 'Esplora' } }; expect(tx(node)).toBe(node);
});
