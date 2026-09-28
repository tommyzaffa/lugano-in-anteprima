/**
 * Stato delle integrazioni (tabella richiesta dal brief §16): implementata,
 * configurabile, dimostrativa, da verificare o bloccata.
 */
import { config, aiConfigured } from './config.ts';

export type IntegrationStatus = 'implementata' | 'configurabile' | 'dimostrativa' | 'da verificare' | 'bloccata';
export interface Integration { id: string; name: string; status: IntegrationStatus; active: boolean; detail: string; activation: string }

export function integrations(): Integration[] {
  return [
    { id: 'osm', name: 'OpenStreetMap — base geografica, POI, rete pedonale', status: 'implementata', active: true, detail: 'Import editoriale da estratti Geofabrik (CH + IT nord-ovest), tile vettoriali generati in locale. Nessun uso dei server pubblici di tile.', activation: 'npm run data:osm (vedi docs/DATI.md) per aggiornare l\'estratto.' },
    { id: 'terrain', name: 'Terreno — Terrain Tiles (AWS Open Data)', status: 'implementata', active: true, detail: 'Tile Terrarium z8–14 scaricati una volta e serviti in locale; quote per rilievo 3D e dislivelli (stima ~30 m).', activation: 'npm run data:terrain' },
    { id: 'swisstopo', name: 'swisstopo swissALTI3D (quote di dettaglio)', status: 'da verificare', active: false, detail: 'Dati OGD disponibili via STAC; conversione LV95→Web Mercator non ancora implementata.', activation: 'Predisporre scripts/geo/swissalti3d (backlog): scaricare le celle 2 m del perimetro e generare tile Terrarium.' },
    { id: 'gtfs', name: 'Orario ufficiale svizzero (GTFS statico)', status: 'implementata', active: true, detail: 'Import filtrato sull\'area: bus TPL/ARL/PostAuto, treni, funicolari, battelli SNL. Orario pianificato, non real time.', activation: 'npm run data:gtfs (scarica il feed dell\'anno orario e ricostruisce la rete).' },
    { id: 'ojp', name: 'Open Journey Planner 2.0 (opentransportdata.swiss)', status: config.transitLive.ojpToken ? 'configurabile' : 'da verificare', active: !!config.transitLive.ojpToken, detail: 'Adattatore TripRequest implementato (src/server/adapters/ojp.ts) ma non verificato live: richiede una chiave personale.', activation: 'Registrarsi sull\'API Manager di opentransportdata.swiss, impostare OJP_API_KEY e TRANSIT_LIVE_PROVIDER=ojp.' },
    { id: 'realtime', name: 'Perturbazioni in tempo reale (GTFS-RT / SIRI-SX)', status: 'bloccata', active: false, detail: 'Non integrato: richiede chiave e verifica delle condizioni. Il sistema non inventa perturbazioni.', activation: 'Richiedere accesso su opentransportdata.swiss; implementare l\'adattatore previsto in docs/INTEGRAZIONI.md.' },
    { id: 'events-lugano', name: 'Lugano Eventi — calendario cittadino', status: 'da verificare', active: false, detail: 'Nessuna API pubblica verificata e diritti di riuso non chiariti. In demo: fixture dichiarate.', activation: 'Accordo con la Città per un feed (ICS/JSON) e import editoriale con fonte e data.' },
    { id: 'events-region', name: 'Lugano Region — agenda turistica', status: 'da verificare', active: false, detail: 'Come sopra: serve accordo sui contenuti.', activation: 'Accordo con Lugano Region; l\'import editoriale è predisposto (data/catalog/events.yaml).' },
    { id: 'weather', name: 'Meteo — Open-Meteo (modelli MeteoSvizzera)', status: config.weather.provider === 'open-meteo' ? 'implementata' : config.weather.provider === 'demo' ? 'dimostrativa' : 'configurabile', active: config.weather.provider === 'open-meteo', detail: 'Previsioni orarie fino a 14 giorni. Gratuito solo per uso non commerciale: per il servizio pubblico valutare abbonamento o MeteoSvizzera OGD.', activation: 'WEATHER_PROVIDER=open-meteo (live) · demo (fixture) · none.' },
    { id: 'ai', name: 'AI — Claude (Anthropic)', status: aiConfigured() ? 'configurabile' : 'configurabile', active: aiConfigured(), detail: aiConfigured() ? `Attiva con ${config.ai.anthropicModel}: interpretazione, proposte e battute validate dal pianificatore.` : 'Non configurata: le proposte vengono dal pianificatore deterministico (non «AI live»).', activation: 'AI_PROVIDER=anthropic e ANTHROPIC_API_KEY (o profilo ant auth login); limiti con AI_DAILY_TOKEN_BUDGET.' },
    { id: 'booking', name: 'Prenotazioni, biglietterie, MyLugano', status: 'bloccata', active: false, detail: 'Nessuna integrazione promessa senza accessi e accordi verificati. L\'app non prenota né acquista.', activation: 'Richiede accordi con gli operatori.' },
  ];
}
