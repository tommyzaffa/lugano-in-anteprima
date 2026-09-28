/**
 * Stato delle integrazioni (tabella richiesta dal brief §16): implementata,
 * configurabile, dimostrativa, da verificare o bloccata.
 */
import { config, aiConfigured } from './config.ts';
import type { EventsSource } from './data.ts';

export type IntegrationStatus = 'implementata' | 'configurabile' | 'dimostrativa' | 'da verificare' | 'bloccata';
export interface Integration { id: string; name: string; status: IntegrationStatus; active: boolean; detail: string; activation: string }

export function integrations(events?: EventsSource): Integration[] {
  const live = events?.kind === 'live';
  return [
    { id: 'osm', name: 'OpenStreetMap — base geografica, POI, rete pedonale', status: 'implementata', active: true, detail: 'Import editoriale da estratti Geofabrik (CH + IT nord-ovest), tile vettoriali generati in locale. Nessun uso dei server pubblici di tile.', activation: 'npm run data:osm (vedi docs/DATI.md) per aggiornare l\'estratto.' },
    { id: 'terrain', name: 'Terreno — Terrain Tiles (AWS Open Data)', status: 'implementata', active: true, detail: 'Tile Terrarium z8–14 scaricati una volta e serviti in locale; fuori dalla Svizzera quote a ~30 m.', activation: 'npm run data:terrain' },
    { id: 'swisstopo', name: 'swisstopo swissALTI3D (quote di dettaglio)', status: 'implementata', active: true, detail: '397 celle da 2 m (LV95) scaricate dal catalogo STAC e fuse nei tile Terrarium sul territorio svizzero; vette entro pochi metri dalle quote ufficiali.', activation: 'npm run data:terrain-ch (dopo data:terrain), poi npm run data:graphs' },
    { id: 'gtfs', name: 'Orario ufficiale svizzero (GTFS statico)', status: 'implementata', active: true, detail: 'Import filtrato sull\'area: bus TPL/ARL/PostAuto, treni, funicolari, battelli SNL. Orario pianificato, non real time.', activation: 'npm run data:gtfs (scarica il feed dell\'anno orario e ricostruisce la rete).' },
    { id: 'ojp', name: 'Open Journey Planner 2.0 (opentransportdata.swiss)', status: config.transitLive.ojpToken ? 'configurabile' : 'da verificare', active: !!config.transitLive.ojpToken, detail: 'Adattatore TripRequest implementato (src/server/adapters/ojp.ts) ma non verificato live: richiede una chiave personale.', activation: 'Registrarsi sull\'API Manager di opentransportdata.swiss, impostare OJP_API_KEY e TRANSIT_LIVE_PROVIDER=ojp.' },
    { id: 'realtime', name: 'Perturbazioni in tempo reale (GTFS-RT / SIRI-SX)', status: 'bloccata', active: false, detail: 'Non integrato: richiede chiave e verifica delle condizioni. Il sistema non inventa perturbazioni.', activation: 'Richiedere accesso su opentransportdata.swiss; implementare l\'adattatore previsto in docs/INTEGRAZIONI.md.' },
    { id: 'events-lugano', name: 'Lugano Eventi — calendario cittadino', status: live ? 'implementata' : 'configurabile', active: live, detail: live ? `Import giornaliero dall'API JSON pubblica del sito (ultimo: ${events!.fetchedAt?.slice(0, 10)}, eventi fino al ${events!.windowTo}): titolo, breve testo, date, sede con coordinate, gratuità e link alla scheda ufficiale; nessuna immagine. Riuso da concordare con la Città per un servizio pubblico.` : 'Import predisposto (scripts/data/fetch-events.ts): in assenza del file importato si usano le fixture dimostrative.', activation: 'npm run data:events (automatico ogni giorno con GitHub Actions).' },
    { id: 'events-region', name: 'Lugano Region — agenda turistica', status: 'da verificare', active: false, detail: 'Molti eventi della regione sono già nel calendario di Lugano Eventi; un import separato non è necessario per la demo.', activation: 'Accordo con Lugano Region se servono contenuti turistici aggiuntivi.' },
    { id: 'weather', name: 'Meteo — Open-Meteo (modelli MeteoSvizzera)', status: config.weather.provider === 'open-meteo' ? 'implementata' : config.weather.provider === 'demo' ? 'dimostrativa' : 'configurabile', active: config.weather.provider === 'open-meteo', detail: 'Previsioni orarie fino a 14 giorni. Gratuito solo per uso non commerciale: per il servizio pubblico valutare abbonamento o MeteoSvizzera OGD.', activation: 'WEATHER_PROVIDER=open-meteo (live) · demo (fixture) · none.' },
    { id: 'ai', name: 'AI — Claude (Anthropic)', status: aiConfigured() ? 'configurabile' : 'configurabile', active: aiConfigured(), detail: aiConfigured() ? `Attiva con ${config.ai.anthropicModel}: interpretazione, proposte e battute validate dal pianificatore.` : 'Non configurata: le proposte vengono dal pianificatore deterministico (non «AI live»).', activation: 'AI_PROVIDER=anthropic e ANTHROPIC_API_KEY (o profilo ant auth login); limiti con AI_DAILY_TOKEN_BUDGET.' },
    { id: 'booking', name: 'Prenotazioni, biglietterie, MyLugano', status: 'bloccata', active: false, detail: 'Nessuna integrazione promessa senza accessi e accordi verificati. L\'app non prenota né acquista.', activation: 'Richiede accordi con gli operatori.' },
  ];
}
