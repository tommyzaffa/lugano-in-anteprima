/** Display labels use the shared translation catalog at the rendering boundary. */
export { setLocale as setLang } from './locale.ts';
export const MOODS: Record<string, string> = { chill: 'Chill', lively: 'Vivace', romantic: 'Romantica', cultural: 'Culturale', nature: 'Natura', views: 'Panorami', food: 'Gastronomia', adventure: 'Avventura leggera' };
export const MOOD_ICON: Record<string, string> = { chill: '☁︎', lively: '♫', romantic: '♡', cultural: '🏛', nature: '🌿', views: '⛰', food: '🍝', adventure: '🥾' };
export const OCCASIONS: Record<string, string> = { friends: 'Amici', date: 'Appuntamento', family: 'Famiglia', sightseeing: 'Visita turistica', birthday: 'Compleanno', guests: 'Ospiti', leisure: 'Tempo libero', custom: 'Altro' };
export const AVOID: Record<string, string> = { nightclub: 'Discoteche', noisy: 'Luoghi rumorosi', alcohol: 'Alcol', climbs: 'Salite ed escursioni', expensive: 'Posti costosi', crowds: 'Posti affollati', already_done: 'Posti già visitati', boats: 'Battelli', heights: 'Altezze' };
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
