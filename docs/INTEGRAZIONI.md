# Integrazioni

Stato al 28 settembre 2026. Legenda: **implementata** (attiva e verificata), **configurabile** (codice pronto, si attiva con una variabile), **dimostrativa** (fixture dichiarata), **da verificare** (serve un accesso o un controllo non ancora fatto), **bloccata** (servono accordi o condizioni non disponibili).

| Integrazione | Stato | Cosa fa oggi | Per attivarla / completarla |
|---|---|---|---|
| OpenStreetMap (base geografica, POI, rete pedonale) | implementata | Estratti Geofabrik CH + IT nord-ovest del 27.09.2026, tile e grafi generati in locale | `npm run data:osm && npm run data:build` per aggiornare. Per la produzione: aggiornamento periodico (es. settimanale) e verifica differenze |
| Terreno (Terrain Tiles, AWS Open Data) | implementata | Rilievo 3D, ombreggiatura, curve di livello, dislivelli stimati fuori dalla Svizzera (~30 m) | `npm run data:terrain` |
| swisstopo swissALTI3D | implementata | Quote a 2 m fuse nei tile sul territorio svizzero: rilievo nitido, curve di livello e dislivelli dei percorsi più precisi (vette entro 3 m dalle quote ufficiali) | `npm run data:terrain-ch && npm run data:graphs`; aggiornare quando swisstopo pubblica una nuova campagna |
| Orario ufficiale GTFS (opentransportdata.swiss) | implementata | Bus TPL/ARL/PostAuto, treni FFS/FLP, funicolari (Città–Stazione, Monte Brè, San Salvatore), battelli SNL; calendari, eccezioni, cadenze | `npm run data:gtfs && npm run data:transit`. Aggiornare a ogni cambio d'orario (dicembre) e con le versioni intermedie del feed |
| Open Journey Planner 2.0 | da verificare | Adattatore `src/server/adapters/ojp.ts` (TripRequest XML, parsing risposte) **non verificato live** | Registrarsi all'API Manager di opentransportdata.swiss, ottenere la chiave, impostare `TRANSIT_LIVE_PROVIDER=ojp` e `OJP_API_KEY`; poi verificare lo schema delle risposte e collegarlo al controllo «verifica live» del riepilogo |
| Perturbazioni in tempo reale (GTFS-RT, SIRI-SX) | bloccata | Nessuna: l'app dichiara che non ci sono dati in tempo reale e non inventa perturbazioni | Richiedere accesso e verificare condizioni; implementare adattatore con orario di aggiornamento |
| Lugano Eventi (calendario cittadino) | da verificare | Nessuna importazione: il sito pubblico non implica un'API né diritti di riuso | Accordo con la Città per un feed (ICS/JSON) o un import editoriale con fonte e data; il modello `CatalogEvent` è pronto |
| Lugano Region (agenda turistica) | da verificare | Come sopra | Accordo sui contenuti con Lugano Region |
| Eventi dimostrativi | dimostrativa | 14 fixture in `data/catalog/events.yaml` per i casi di calendario | Sostituire con fonti autorizzate |
| Meteo — Open-Meteo (modelli MeteoSvizzera) | configurabile | Con `WEATHER_PROVIDER=open-meteo`: previsioni orarie fino a 14 giorni, cache 3 h, stato di salute nel pannello | Gratuito solo per uso non commerciale: per un servizio pubblico valutare l'abbonamento o i dati OGD di MeteoSvizzera |
| Meteo dimostrativo | dimostrativa (default) | Fixture: pioggia il pomeriggio nei giorni multipli di 7, dichiarata «non è una previsione» | — |
| AI — Claude (Anthropic) | configurabile | Con `AI_PROVIDER=anthropic`: interpretazione del testo libero, proposte di combinazioni, battute; output strutturato validato (zod), fallback lato server sui rifiuti, timeout, retry limitati, tetto giornaliero, registro consumi | `ANTHROPIC_API_KEY` (o profilo `ant auth login`), modello `ANTHROPIC_MODEL` (default `claude-opus-5`). Non verificato live in questa sessione (nessuna chiave disponibile) |
| Pianificatore deterministico | implementata | Proposte, validazione, rami e spiegazioni senza AI; dichiarato come «Pianificatore deterministico» | — |
| Prenotazioni, biglietterie, MyLugano | bloccata | Nessuna: l'app non prenota né acquista | Solo dopo accordi con gli operatori |
| Tariffe dei trasporti | stime | Fasce indicative per bus/treno Arcobaleno, funicolari, battelli; abbonamenti segnalati ma non scontati | Import delle tariffe ufficiali (Arcobaleno, SNL, funicolari) con fonte e validità |

## Endpoint principali

| Metodo | Percorso | Uso |
|---|---|---|
| GET | `/api/health`, `/api/meta` | stato, perimetro, integrazioni, fonti |
| GET | `/api/places`, `/api/places/:id`, `/api/explore`, `/api/events`, `/api/stops`, `/api/search` | catalogo, esplorazione, eventi, ricerca locale (nessun geocoder esterno) |
| POST | `/api/plan` | pianificazione in streaming NDJSON (avanzamento + risultato), annullabile |
| POST | `/api/replan` | rami e scenari «E se…» |
| POST | `/api/revalidate` | confronto di un programma salvato con i dati attuali |
| POST/PUT/GET/DELETE | `/api/plans[/:id]` | salvataggio con token personale di modifica |
| POST/GET/DELETE | `/api/plans/:id/share`, `/api/share/:token` (+ `/vote`) | condivisione revocabile, redazione dei dati sensibili, voto |
| POST | `/api/export/ics`, `/api/reports`, `/api/stats` | calendario, segnalazioni, statistiche aggregate |
| * | `/api/admin/*` | pannello editoriale (Bearer token) |
