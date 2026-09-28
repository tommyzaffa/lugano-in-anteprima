/**
 * Import degli eventi reali (Lugano Eventi) su un campione vero dell'API: nessuna chiamata di rete.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { convert, nameSimilarity, plainText, type ApiDay } from '../scripts/data/fetch-events.ts';

const days: ApiDay[] = JSON.parse(readFileSync('tests/fixtures/lugano-eventi-sample.json', 'utf8'));
const catalog = JSON.parse(readFileSync('data/build/catalog.json', 'utf8')).places;
const perimeter = JSON.parse(readFileSync('data/geo/perimeter.json', 'utf8')).perimeter;
const r = convert(days, catalog, perimeter, '2026-09-29T04:00:00.000Z', { from: '2026-09-29', to: '2026-10-05' });
const byId = (id: number) => r.events.find((e) => e.id === `le-${id}`);

describe('import eventi Lugano Eventi', () => {
  it('un concerto al LAC è abbinato al luogo del catalogo, con orario di Zurigo e link alla scheda', () => {
    const e = byId(31402)!;
    expect(e.placeId).toBe('lac');
    expect(e.category).toBe('concert');
    expect(e.sessions).toHaveLength(1);
    expect(e.sessions[0].start).toBe('2026-10-01T20:00:00+02:00');
    expect(e.url).toBe('https://luganoeventi.ch/it/eventi/31402/' + e.url!.split('/')[6] + '/');
    expect(e.demo).toBe(false);
    expect(e.evidence[0].status).toBe('official_import');
  });
  it('mercato ricorrente: appuntamento con inizio e fine, sede nuova con le coordinate della fonte', () => {
    const e = byId(977)!;
    expect(e.category).toBe('market');
    expect(e.sessions[0]).toMatchObject({ start: '2026-09-29T07:30:00+02:00', end: '2026-09-29T14:30:00+02:00' });
    expect(e.prices[0].unit).toBe('free');
    const v = r.venues.find((x) => x.id === e.placeId)!;
    expect(v.plannable).toBe('events');
    expect(v.tags).toContain('sede-eventi');
  });
  it('una mostra a giornata intera diventa «in corso», senza appuntamenti inventati', () => {
    const e = byId(29309)!;
    expect(e.sessions).toHaveLength(0);
    expect(e.ongoing).toEqual({ from: '2025-12-05', to: '2027-01-08' });
  });
  it('il Municipio non viene confuso con il ristorante accanto, né la Sala Boccadoro con il caffè', () => {
    expect(byId(29309)!.placeId).not.toBe('ristorante-olimpia');
    expect(byId(28725)!.placeId).not.toBe('caffe-boccadoro');
    expect(nameSimilarity('Biblioteca Cantonale di Lugano', 'Museo cantonale di storia naturale').share).toBe(0);
    expect(nameSimilarity('MASI - Museo d’arte della Svizzera italiana - Palazzo Reali', 'MASI Palazzo Reali').share).toBe(1);
  });
  it('fuori dall\'area della mappa e congressi professionali non entrano', () => {
    expect(byId(11563)).toBeUndefined(); // Mendrisio
    expect(byId(22691)).toBeUndefined(); // Isole di Brissago
    expect(byId(32171)).toBeUndefined(); // congresso
    expect(r.stats.esclusi).toBe(1);
  });
  it('testi: HTML e entità ripuliti e accorciati', () => {
    expect(plainText('<p>Caff&egrave; &amp; musica&#8217;s<br>sera</p>')).toBe('Caffè & musica’s sera');
    expect(plainText('parola '.repeat(80), 40).length).toBeLessThanOrEqual(40);
  });
  it('doppioni della fonte (stessa sede e ora, titolo contenuto nell\'altro): ne resta uno', () => {
    const base = days.flatMap((d) => d.events).find((e) => e.id === 31402)!;
    const dup = { ...base, id: 999999, texts: { ...base.texts, title: base.texts.title.split(' / ')[0], intro: '' } };
    const r2 = convert([{ date: days[0].date, events: [base, dup] }], catalog, perimeter, '2026-09-29T04:00:00.000Z', { from: '2026-09-29', to: '2026-10-05' });
    expect(r2.events).toHaveLength(1);
    expect(r2.events[0].id).toBe('le-31402');
  });
});
