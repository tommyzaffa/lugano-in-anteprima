/**
 * Testi dell'interfaccia. L'italiano è la lingua di prodotto; l'architettura
 * consente altre lingue aggiungendo un dizionario (qui un esempio parziale in inglese).
 */
const it = {
  'app.name': 'Lugano in anteprima',
  'app.promise': 'Racconta la giornata che vuoi vivere. Provala nella piccola Lugano. Poi esci davvero.',
  'home.plan': 'Organizza una giornata',
  'home.plan.sub': 'Modulo guidato, tre proposte, simulazione sulla mappa',
  'home.explore': 'Esplora liberamente',
  'home.explore.sub': 'Luoghi, orari, eventi e percorsi',
  'demo.badge': 'DEMO',
  'demo.text': 'Modalità dimostrativa: eventi e meteo sono esempi, i prezzi sono stime. Orari dei mezzi dall\'orario ufficiale statico, senza tempo reale.',
  'sim.play': 'Avvia', 'sim.pause': 'Pausa', 'sim.skipMove': 'Salta spostamento', 'sim.nextDecision': 'Prossima decisione', 'sim.summary': 'Vai al riepilogo',
  'sim.follow': 'Segui il gruppo', 'sim.free': 'Camera libera', 'sim.overview': 'Tutto il percorso',
};
const en: Partial<typeof it> = {
  'app.promise': 'Describe the day you want. Try it in tiny Lugano. Then go out for real.',
  'home.plan': 'Plan a day', 'home.explore': 'Explore freely',
};
const dicts: Record<string, Partial<typeof it>> = { it, en };
let lang = 'it';
export function setLang(l: string) { lang = dicts[l] ? l : 'it'; }
export function t(k: keyof typeof it): string { return (dicts[lang] as any)[k] ?? it[k]; }

export const MOODS: Record<string, string> = { chill: 'Chill', lively: 'Vivace', romantic: 'Romantica', cultural: 'Culturale', nature: 'Natura', views: 'Panorami', food: 'Gastronomia', adventure: 'Avventura leggera' };
export const MOOD_ICON: Record<string, string> = { chill: '☁︎', lively: '♫', romantic: '♡', cultural: '🏛', nature: '🌿', views: '⛰', food: '🍝', adventure: '🥾' };
export const OCCASIONS: Record<string, string> = { friends: 'Amici', date: 'Appuntamento', family: 'Famiglia', sightseeing: 'Visita turistica', birthday: 'Compleanno', guests: 'Ospiti', leisure: 'Tempo libero', custom: 'Altro' };
export const AVOID: Record<string, string> = { nightclub: 'Discoteche', noisy: 'Luoghi rumorosi', alcohol: 'Alcol', climbs: 'Salite ed escursioni', expensive: 'Posti costosi', crowds: 'Posti affollati', already_done: 'Cose già fatte', boats: 'Battelli', heights: 'Altezze' };
export const PACE: Record<string, string> = { relaxed: 'Rilassato', balanced: 'Equilibrato', intense: 'Intenso' };
export const CATEGORY: Record<string, string> = {
  park: 'Parco', museum: 'Museo', culture: 'Cultura', viewpoint: 'Belvedere', walk: 'Passeggiata', lido: 'Lido', lift: 'Impianto', restaurant: 'Ristorante', cafe: 'Caffè', bar: 'Bar',
  nightlife: 'Vita notturna', market: 'Mercato', show: 'Spettacoli', workshop: 'Laboratorio', seasonal: 'Stagionale', church: 'Chiesa', village: 'Borgo', hike: 'Escursione',
  playground: 'Giochi', gelato: 'Gelateria', summit: 'Vetta', attraction: 'Attrazione', pause: 'Pausa',
};
export const MODE: Record<string, string> = { walk: 'A piedi', hike: 'Escursione', bus: 'Bus', train: 'Treno', funicular: 'Funicolare', boat: 'Battello', cable_car: 'Funivia', wait: 'Attesa' };
export const MODE_ICON: Record<string, string> = { walk: '🚶', hike: '🥾', bus: '🚌', train: '🚆', funicular: '🚞', boat: '⛴', cable_car: '🚡', wait: '⏳' };
export const STATUS: Record<string, string> = { verified: 'verificato', official_import: 'dato ufficiale', editorial: 'redazione', osm: 'OpenStreetMap', estimate: 'stima', demo: 'dimostrativo', unknown: 'mancante' };
export const FEASIBILITY: Record<string, string> = { valid: 'Verificato sui dati disponibili', uncertain: 'Con dati da verificare', invalid: 'Non valido' };
export const AGE_BANDS = ['0-5', '6-11', '12-15', '16-17'] as const;
