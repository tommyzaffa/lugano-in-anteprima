# Architettura

## Scelte principali

| Ambito | Scelta | Perché |
|---|---|---|
| Linguaggio | TypeScript ovunque (client, server, script, test) | Tipi e schemi condivisi fra pianificatore, simulazione e interfaccia |
| Client | React 19 + zustand + MapLibre GL JS 6 | Mappa vettoriale con stile proprio, terreno 3D, estrusioni; stato semplice e prevedibile |
| Server | Node 24 + Hono; TypeScript eseguito direttamente da Node (rimozione dei tipi, `erasableSyntaxOnly`), `tsx` solo in sviluppo | Backend leggero con endpoint; niente framework full-stack; avvio rapido anche con poca CPU (hosting gratuito) |
| Persistenza | SQLite tramite `node:sqlite` integrato | Nessuna infrastruttura in più per il pilota; per la versione pubblica è previsto PostgreSQL/PostGIS |
| Cartografia | Tile vettoriali **generati in locale** da estratti OSM (geojson-vt + vt-pbf), terreno Terrarium locale, glifi locali | Stile originale, nessuna dipendenza dai server pubblici di tile, copertura dell'intera area fin dall'avvio |
| Percorsi a piedi | Grafo pedonale proprio da OSM con quote dal DEM, A* e Dijkstra | Geometria reale, scale, sentieri e dislivelli; profili per passeggino, sedia a rotelle, notte, escursione |
| Mezzi pubblici | Orario GTFS ufficiale filtrato sull'area + Connection Scan Algorithm | Coincidenze reali, calendari di servizio, funicolari e battelli stagionali, corse a cadenza |
| AI | Interfaccia `AiProvider` + implementazione Anthropic (Claude Opus 5, output strutturato validato) + pianificatore deterministico | L'interfaccia utente non dipende da un fornitore; senza chiave la demo funziona ed è dichiarata tale |

## Moduli

```text
interfaccia / modulo / accessibilità   src/client/ui/*, src/client/App.tsx, src/client/styles.css, src/client/i18n.ts
mappa / stile / terreno / pedine       src/client/map/* (style.ts, MapView.tsx, avatars.ts, sprites.ts)
catalogo / eventi / calendari          data/catalog/*.yaml → scripts/catalog/build-catalog.ts → data/build/catalog.json
                                        src/shared/calendar.ts, src/shared/osm-hours.ts
adattatori / import / cache            scripts/geo/*, scripts/transit/*, src/server/adapters/{weather,ojp}.ts, src/server/data.ts
pianificatore / vincoli / validazione  src/server/planner/{context,text,candidates,estimate,search,build,explain,index}.ts
AI / schema / spiegazioni              src/server/ai/{provider,anthropic,index}.ts
simulazione / stato / rami             src/shared/simulation.ts, src/server/planner/replan.ts, src/client/sim/*
salvataggio / condivisione / riepiloghi src/server/db.ts, src/server/api.ts, src/shared/export.ts, src/client/ui/{SaveShare,Summary,postcard}
gestione contenuti / diagnostica       src/server/api.ts (/api/admin/*), src/client/ui/Admin.tsx, src/server/integrations.ts
```

## Flusso di pianificazione (§8.2 del brief)

1. **Validazione** della richiesta con lo schema `GroupRequest` (1–12 persone; oltre, errore spiegato).
2. **Testo libero**: interpretazione deterministica (e, se configurata, AI) → preferenze morbide; le **contraddizioni** con il modulo (budget, orari, gruppo, mobilità) tornano all'interfaccia e vanno risolte esplicitamente.
3. **Candidati**: luoghi ed eventi aperti nella finestra, filtrati dai vincoli rigidi (evitare, mobilità, età, esclusioni, tappe bloccate) con conteggio delle esclusioni per spiegare i fallimenti.
4. **Stime di spostamento**: Dijkstra pedonale limitato + CSA uno-a-tutti a ogni passo della ricerca (una scansione per nodo, non una per coppia: niente esplosione di calcoli).
5. **Ricerca a fascio** per temi diversi (pesi per categoria), con pasti nelle fasce corrette, budget, cammino, varietà e riempimento della giornata. Le proposte AI, se attive, entrano qui come sequenze di identificativi del catalogo.
6. **Validazione precisa**: per ogni sequenza, tratte reali (cammino A* + corse GTFS), apertura per tutta la permanenza, ultimo ingresso, orari degli eventi, rientro; correzione con al massimo 5 tentativi (accorciare le soste, togliere la tappa problematica non obbligatoria).
7. **Fino a tre alternative distinte** (sovrapposizione dei luoghi ≤ 50%), compromessi relativi, dati mancanti, motivazioni sintetiche.
8. **Decisione pre-validata** a metà programma (due proseguimenti entrambi verificati) e **narrazione breve** costruita solo sul piano validato.

Vincoli rigidi e preferenze sono separati: budget rigido, tappe obbligatorie e bloccate, limiti di cammino e dislivello, mobilità, rientro e finestra oraria sono rigidi; atmosfera, occasione, ritmo e budget non rigido sono preferenze. Un piano è `valid` solo se nessun controllo è violato né incerto; `uncertain` se alcuni dati sono da verificare (orari mancanti, costi sconosciuti, eventi demo, sentieri non verificati); i piani `invalid` non vengono proposti.

## Tempo

Tutti gli istanti sono ISO con offset in **Europe/Zurich** e i calcoli usano millisecondi epoch (Luxon). Gli orari GTFS sono relativi a «mezzogiorno meno 12 ore» della giornata di servizio (corretto nei giorni di cambio d'ora). Intervalli come 20:00–01:00 terminano il giorno dopo; le finestre oltre mezzanotte sono gestite; i test girano con il fuso del processo impostato su New York per dimostrare l'indipendenza dal fuso della macchina.

## Simulazione

`buildTimeline(plan)` trasforma il piano in segmenti (cammino, attesa, corsa, attività, pausa) con geometria reale e distanze cumulative; `stateAt(timeline, t)` è una **funzione pura** che restituisce posizione, scena, tappa, spese maturate (dalle voci di costo con istante ≤ t) e decisione in attesa. Conseguenze:

- «Salta spostamento», «Fine», le tappe sulla barra di avanzamento e il cursore impostano solo `t`: lo stato è identico a quello della riproduzione completa (test automatico).
- Tornare indietro non duplica spese né eventi.
- Le cutscene sono solo presentazione (camera e cartelli) e fermano l'orologio per un istante.
- L'orologio simulato è separato dall'orologio reale (1× = 1 minuto simulato al secondo) e dall'animazione.

I **rami** (`replan`) conservano tappe e tratte già vissute — anche una tratta interrotta a metà, con geometria troncata — e ricalcolano solo il futuro rispettando le tappe bloccate. Le ipotesi «E se…» sono etichettate e non vengono mai presentate come notizie.

## Sistemi di riferimento

- Geometrie e coordinate: **WGS84 (EPSG:4326)** in gradi decimali; tile in **Web Mercator (EPSG:3857)** schema XYZ.
- Grafi serializzati in microgradi (×1e6) e lunghezze/quote in decimetri, per non confondere metri e gradi.
- Distanze geodetiche con formula dell'haversine; quote in metri s.l.m. dal DEM Terrarium (z14).
- L'esagerazione verticale del terreno sulla mappa (1,35×) è solo visiva e non entra nei tempi di percorrenza.
- Dati svizzeri in LV95 (EPSG:2056): swissALTI3D è convertito con le formule ufficiali swisstopo WGS84→LV95 (precisione ~1 m) in `scripts/geo/06-swissalti3d.ts`; per conversioni di precisione è disponibile `proj4`.

## Sicurezza e privacy

- Chiavi API solo lato server; il pannello editoriale richiede un token (`Authorization: Bearer`).
- Limiti di frequenza su `/api/*`, timeout e annullamento delle pianificazioni (la chiusura della connessione annulla il calcolo), tetto giornaliero di token AI.
- Il testo dell'utente e le descrizioni dei luoghi sono trattati come dati, mai come istruzioni per il modello; l'AI può restituire solo oggetti conformi allo schema, con riferimenti validati.
- Posizione precisa solo su richiesta esplicita; alloggio e posizione sono marcati come sensibili e rimossi di default dai link condivisi (anche dalla geometria del primo e dell'ultimo tratto).
- Statistiche solo aggregate per giorno, senza contenuti personali; il registro AI conserva modello, token, durata ed esito, non i testi.
