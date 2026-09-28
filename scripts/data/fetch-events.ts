/**
 * Import degli eventi reali da Lugano Eventi (calendario ufficiale della Città di Lugano,
 * luganoeventi.ch), tramite l'API JSON pubblica usata dal sito stesso.
 *
 * - Finestra: da oggi a 35 giorni, richieste settimanali in sequenza (5 richieste).
 * - Solo eventi dentro il perimetro della mappa; congressi professionali esclusi.
 * - Sedi: abbinate ai luoghi del catalogo se vicine e con nome compatibile, altrimenti
 *   «sedi di eventi» con le coordinate fornite dalla fonte (pianificabili solo tramite evento).
 * - Mostre di lunga durata: «in corso» (visitabili negli orari della sede), non appuntamenti.
 * - Si conservano titolo, breve testo, categoria, date, sede, gratuità, link alla scheda
 *   ufficiale e la data di acquisizione; nessuna immagine.
 *
 * Output: data/build/events-live.json (letto dal server all'avvio).
 * Uso: npm run data:events
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { CatalogEvent, Place } from '../../src/shared/types.ts';

const TZ = 'Europe/Zurich';
const API = 'https://luganoeventi.ch/wp-json/v4/lugano-event/calendar';
const UA = 'LuganoInAnteprima/0.1 (+https://github.com/tommyzaffa/lugano-in-anteprima; prototipo, import giornaliero)';
const DAYS = 35;
export const SOURCE_ID = 'lugano-eventi';

// ------------------------------------------------------------------ conversione (pura, testata)
interface ApiLocation { id: number; name: string; latitude?: string | null; longitude?: string | null; address?: string; city?: { name?: string } | null; quarter?: { name?: string } | null }
interface ApiDate { id: number; location?: ApiLocation | null; alternativeLocation?: ApiLocation | null; allDay?: boolean; startDate?: string | null; startTime?: string | null; endDate?: string | null; endTime?: string | null }
export interface ApiEvent {
  id: number; status?: string; free?: boolean; bookable?: boolean; firstDay?: string | null; lastDay?: string | null; recommendedAge?: number | null;
  categories: { id: number; name: string }[];
  texts: { title: string; slug: string; intro?: string; pricing?: string };
  dates: ApiDate[];
  changes?: unknown[];
}
export interface ApiDay { date: string; events: ApiEvent[] }

type Cat = CatalogEvent['category'];
const CATEGORY: Record<string, Cat> = {
  Musica: 'concert', Mercati: 'market', Teatro: 'show', Danza: 'show', 'Feste popolari': 'festival', Food: 'festival',
  Laboratori: 'workshop', Family: 'workshop', Talks: 'show', Arte: 'exhibition', Cinema: 'cinema', Sport: 'sport', Fiere: 'market', Altro: 'show',
};
const MOODS: Record<string, CatalogEvent['moods']> = {
  Musica: ['lively', 'cultural'], Mercati: ['lively', 'food'], Teatro: ['cultural'], Danza: ['cultural'], 'Feste popolari': ['lively', 'food'],
  Food: ['food', 'lively'], Laboratori: ['cultural'], Family: [], Talks: ['cultural'], Arte: ['cultural'], Cinema: ['cultural', 'chill'], Sport: ['adventure'],
};
const INDOOR = new Set(['Teatro', 'Danza', 'Talks', 'Arte', 'Cinema', 'Laboratori']);
const SKIP = new Set(['Congressi']);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—', egrave: 'è', eacute: 'é', agrave: 'à', ograve: 'ò', ugrave: 'ù', igrave: 'ì' };
export function plainText(html: string | undefined, max = 240): string {
  const t = (html ?? '')
    .replace(/<br\s*\/?>|<\/p>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[​ ]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
}

const zurich = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' }).setZone(TZ);
const toIso = (d: DateTime) => d.toISO({ suppressMilliseconds: true })!;
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const STOP = new Set(['della', 'delle', 'dello', 'degli', 'museo', 'lugano', 'the', 'via', 'piazza', 'centro', 'sala', 'aula']);
// parole troppo comuni per identificare una sede da sole
const GENERIC = new Set(['cantonale', 'comunale', 'villa', 'parco', 'teatro', 'chiesa', 'galleria', 'gallery', 'biblioteca', 'casa', 'spazio', 'studio', 'hotel', 'ristorante', 'caffe', 'bar', 'cinema', 'collezione', 'fondazione', 'arte', 'art', 'contemporanea', 'cultura', 'culture', 'svizzera', 'italiana', 'palazzo', 'hall', 'atelier', 'campus', 'scuola', 'istituto', 'associazione']);
const words = (s: string) => new Set(s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)));
// una sede di eventi non si abbina a bar, ristoranti e simili (orari e natura diversi)
const NOT_VENUE = new Set(['restaurant', 'cafe', 'bar', 'gelato', 'nightlife']);

/** Somiglianza fra nomi: quota di parole in comune (sul nome più corto) e indice di Jaccard; 0 senza parole distintive in comune. */
export function nameSimilarity(a: string, b: string): { share: number; jaccard: number } {
  const A = words(a), B = words(b);
  const common = [...A].filter((x) => B.has(x));
  if (!A.size || !B.size || !common.some((x) => !GENERIC.has(x))) return { share: 0, jaccard: 0 };
  return { share: common.length / Math.min(A.size, B.size), jaccard: common.length / new Set([...A, ...B]).size };
}

function distM(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const dx = (a.lon - b.lon) * 77_000, dy = (a.lat - b.lat) * 111_000;
  return Math.hypot(dx, dy);
}

export interface ImportResult {
  source: { id: string; name: string; url: string; fetchedAt: string; windowFrom: string; windowTo: string; license: string };
  venues: Place[];
  events: CatalogEvent[];
  stats: Record<string, number>;
}

/** Converte le giornate dell'API in eventi del catalogo e sedi, abbinando le sedi ai luoghi esistenti. */
export function convert(days: ApiDay[], catalog: Place[], bbox: { south: number; west: number; north: number; east: number }, fetchedAt: string, window: { from: string; to: string }): ImportResult {
  const stats: Record<string, number> = { occorrenze: 0, fuoriArea: 0, senzaCoordinate: 0, esclusi: 0, sediCatalogo: 0, sediNuove: 0, mostreInCorso: 0 };
  const today = fetchedAt.slice(0, 10);
  const ev = (field: string, url?: string, note?: string) => ({ field, sourceId: SOURCE_ID, status: 'official_import' as const, observedAt: today, lastCheckedAt: today, url, note });
  const venueById = new Map<number, string>();
  const venues = new Map<string, Place>();
  const byEvent = new Map<number, { e: ApiEvent; dates: Map<number, ApiDate> }>();
  for (const d of days) for (const e of d.events) {
    const g = byEvent.get(e.id) ?? { e, dates: new Map() };
    for (const x of e.dates) g.dates.set(x.id, x);
    byEvent.set(e.id, g);
  }

  const inside = (lat: number, lon: number) => lat >= bbox.south && lat <= bbox.north && lon >= bbox.west && lon <= bbox.east;
  function placeFor(loc: ApiLocation, cat: string): string | null {
    const known = venueById.get(loc.id);
    if (known) return known;
    const lat = Number(loc.latitude), lon = Number(loc.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) { stats.senzaCoordinate++; return null; }
    if (!inside(lat, lon)) { stats.fuoriArea++; return null; }
    // luogo del catalogo vicino (entro 200 m) con una parola distintiva del nome in comune
    let best: { id: string; share: number; jaccard: number; d: number } | null = null;
    for (const p of catalog) {
      if (NOT_VENUE.has(p.category)) continue;
      const d = Math.min(distM(p, { lon, lat }), distM(p.entrance, { lon, lat }));
      if (d > 200) continue;
      const sim = nameSimilarity(loc.name, p.name);
      if (sim.share < 0.5) continue;
      if (!best || sim.share > best.share || (sim.share === best.share && (sim.jaccard > best.jaccard || (sim.jaccard === best.jaccard && d < best.d)))) best = { id: p.id, ...sim, d };
    }
    if (best) { venueById.set(loc.id, best.id); stats.sediCatalogo++; return best.id; }
    const id = `le-${loc.id}-${slug(loc.name) || 'sede'}`;
    const city = loc.city?.name ?? 'Lugano';
    venues.set(id, Place.parse({
      id, name: loc.name, category: cat === 'Cinema' || cat === 'Teatro' || cat === 'Danza' ? 'show' : cat === 'Mercati' ? 'market' : 'culture',
      lon, lat, entrance: { lon, lat, source: 'editorial', note: 'Coordinate della sede fornite da Lugano Eventi' },
      municipality: { name: city, country: 'CH' }, area: [loc.quarter?.name, loc.address].filter(Boolean).join(', ') || undefined,
      description: `Sede di eventi del calendario Lugano Eventi${loc.address ? ` (${loc.address})` : ''}.`,
      tags: ['sede-eventi'], moods: [], visit: { min: 30, typical: 90, max: 180 },
      booking: { required: 'unknown' },
      accessibility: { wheelchair: 'unknown', stroller: 'unknown', stairs: 'unknown', evidence: ev('accessibility', undefined, 'Accessibilità non indicata dalla fonte.') },
      suitability: { occasions: [], weather: 'any', indoor: INDOOR.has(cat), habitualAtmosphere: 'unknown', noise: 'unknown', alcohol: 'none' },
      plannable: 'events', evidence: [ev('coordinates', 'https://luganoeventi.ch', 'Sede indicata dal calendario ufficiale')], sources: [SOURCE_ID],
    }));
    venueById.set(loc.id, id);
    stats.sediNuove++;
    return id;
  }

  const events: CatalogEvent[] = [];
  for (const { e, dates } of byEvent.values()) {
    const catNames = e.categories.map((c) => c.name);
    if (catNames.some((c) => SKIP.has(c))) { stats.esclusi++; continue; }
    const main = catNames.find((c) => CATEGORY[c] && c !== 'Altro' && c !== 'Family') ?? catNames[0] ?? 'Altro';
    const url = `https://luganoeventi.ch/it/eventi/${e.id}/${e.texts.slug}/`;
    const status = /cancel|annull/i.test(e.status ?? '') ? 'cancelled' : /postpon|rinvi/i.test(e.status ?? '') ? 'postponed' : /sold|esaur/i.test(e.status ?? '') ? 'sold_out' : 'scheduled';
    const spanDays = e.firstDay && e.lastDay ? (Date.parse(e.lastDay) - Date.parse(e.firstDay)) / 86_400_000 : 0;
    const all = [...dates.values()];
    // «in corso» (mostre, esposizioni): giornate intere su più giorni, oppure presenza quasi quotidiana
    // senza orario di fine. Corsi settimanali e film restano appuntamenti con il loro orario.
    const localDays = [...new Set(all.map((x) => zurich((x.allDay ? x.startDate : x.startTime ?? x.startDate) ?? e.firstDay ?? '').toFormat('yyyy-MM-dd')))].sort();
    const covered = localDays.length / ((Date.parse(localDays[localDays.length - 1]) - Date.parse(localDays[0])) / 86_400_000 + 1);
    const ongoing = main !== 'Cinema' && covered >= 0.5 && ((all.every((x) => x.allDay) && spanDays > 2) || (localDays.length >= 5 && all.every((x) => !x.endTime)));
    // sede: la più frequente fra le date importate
    const locCount = new Map<number, { loc: ApiLocation; n: number }>();
    for (const x of all) { const l = x.alternativeLocation ?? x.location; if (l) locCount.set(l.id, { loc: l, n: (locCount.get(l.id)?.n ?? 0) + 1 }); }
    const loc = [...locCount.values()].sort((a, b) => b.n - a.n)[0]?.loc;
    if (!loc) { stats.senzaCoordinate++; continue; }
    const placeId = placeFor(loc, main);
    if (!placeId) continue;
    const sessions = ongoing ? [] : all
      .filter((x) => (x.alternativeLocation ?? x.location)?.id === loc.id && (x.startTime || x.startDate))
      .map((x) => {
        const timed = !x.allDay && !!x.startTime;
        const start = timed ? zurich(x.startTime!) : zurich(x.startDate!).startOf('day').set({ hour: 10 });
        const end = timed && x.endTime ? zurich(x.endTime) : null;
        return { id: `le-${x.id}`, start: toIso(start), end: end && end > start ? toIso(end) : undefined, timeUncertain: !timed || undefined, status };
      })
      .sort((a, b) => a.start.localeCompare(b.start));
    stats.occorrenze += sessions.length;
    if (ongoing) stats.mostreInCorso++;
    if (!ongoing && !sessions.length) continue;
    const pricing = plainText(e.texts.pricing, 120);
    events.push(CatalogEvent.parse({
      id: `le-${e.id}`,
      title: plainText(e.texts.title, 120),
      placeId,
      description: plainText(e.texts.intro),
      category: CATEGORY[main] ?? 'show',
      tags: [...new Set([...catNames.map((c) => slug(c)), ...(e.free ? ['gratuito'] : [])])],
      moods: [...new Set(catNames.flatMap((c) => MOODS[c] ?? []))],
      prices: e.free
        ? [{ id: `le-${e.id}-free`, label: 'Entrata libera', min: 0, max: 0, unit: 'free', status: 'known', evidence: ev('price', url, 'Gratuito secondo Lugano Eventi') }]
        : [{ id: `le-${e.id}-p`, label: 'Biglietto', unit: 'person', status: 'unknown', evidence: ev('price', url, pricing || 'Prezzo indicato sulla scheda ufficiale') }],
      booking: { required: e.bookable ? 'recommended' : 'unknown', url },
      sessions,
      ongoing: ongoing && e.firstDay && e.lastDay ? { from: zurich(e.firstDay).toFormat('yyyy-MM-dd'), to: zurich(e.lastDay).toFormat('yyyy-MM-dd') } : undefined,
      url,
      suitability: {
        occasions: catNames.includes('Family') ? ['family', 'leisure'] : ['friends', 'leisure', 'sightseeing', 'guests'],
        minAge: e.recommendedAge ?? undefined, indoor: INDOOR.has(main), noise: 'unknown', alcohol: 'none',
      },
      demo: false,
      evidence: [ev('event', url, 'Calendario ufficiale Lugano Eventi (Città di Lugano)')],
    }));
  }
  // doppioni della fonte (stessa sede, stesso primo orario, un titolo che contiene l'altro): resta il più completo
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9àèéìòù]+/g, ' ').trim();
  const kept: CatalogEvent[] = [];
  for (const e of events.sort((a, b) => b.description.length - a.description.length)) {
    const first = e.sessions[0]?.start ?? e.ongoing?.from;
    const dup = kept.find((k) => k.placeId === e.placeId && (k.sessions[0]?.start ?? k.ongoing?.from) === first && (norm(k.title).startsWith(norm(e.title)) || norm(e.title).startsWith(norm(k.title))));
    if (dup) { stats.doppioni = (stats.doppioni ?? 0) + 1; continue; }
    kept.push(e);
  }
  events.length = 0;
  events.push(...kept.sort((a, b) => a.title.localeCompare(b.title, 'it')));
  return {
    source: { id: SOURCE_ID, name: 'Lugano Eventi (Città di Lugano)', url: 'https://luganoeventi.ch', fetchedAt, windowFrom: window.from, windowTo: window.to, license: 'Dati del calendario pubblico; ogni evento rimanda alla scheda ufficiale' },
    venues: [...venues.values()], events, stats,
  };
}

// ------------------------------------------------------------------ esecuzione
async function main() {
  const catalog = JSON.parse(readFileSync('data/build/catalog.json', 'utf8'));
  const perimeter = JSON.parse(readFileSync('data/geo/perimeter.json', 'utf8'));
  const start = DateTime.now().setZone(TZ).startOf('day');
  const days: ApiDay[] = [];
  for (let w = 0; w < DAYS / 7; w++) {
    const a = start.plus({ days: w * 7 }), b = a.plus({ days: 6 }).endOf('day');
    const url = `${API}?startDate=${encodeURIComponent(toIso(a))}&endDate=${encodeURIComponent(b.set({ millisecond: 0 }).toISO({ suppressMilliseconds: true })!)}&wpml_language=it`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Lugano Eventi ${res.status} per ${a.toFormat('yyyy-MM-dd')}`);
    const chunk = (await res.json()) as ApiDay[];
    if (!Array.isArray(chunk)) throw new Error('Risposta inattesa da Lugano Eventi');
    days.push(...chunk);
    console.log(`  settimana dal ${a.toFormat('yyyy-MM-dd')}: ${chunk.reduce((n, d) => n + d.events.length, 0)} occorrenze`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  const r = convert(days, catalog.places, perimeter.perimeter, new Date().toISOString(), { from: start.toFormat('yyyy-MM-dd'), to: start.plus({ days: DAYS - 1 }).toFormat('yyyy-MM-dd') });
  if (r.events.length < 10) throw new Error(`Solo ${r.events.length} eventi importati: import sospetto, dati precedenti mantenuti.`);
  writeFileSync('data/build/events-live.json', JSON.stringify(r));
  console.log(`✓ ${r.events.length} eventi (${r.stats.mostreInCorso} mostre in corso), ${r.venues.length} sedi nuove; statistiche ${JSON.stringify(r.stats)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
