# Dati, perimetro e livelli di dettaglio

## Perimetro geografico verificabile

Il perimetro è calcolato da `scripts/geo/01-perimeter.ts` a partire dai riferimenti richiesti dal brief, **letti da OpenStreetMap** (nessuna coordinata scritta a mano) e salvati con identificativo OSM in [data/geo/perimeter.json](../data/geo/perimeter.json).

| Riferimento | Oggetto OSM | Lat | Lon |
|---|---|---|---|
| Lugano (centro) | node/1376769426 | 46.0038 | 8.9512 |
| Stazione FFS di Lugano | node/2460241310 | 46.0055 | 8.9468 |
| Parco Ciani | way/28285131 | 46.0039 | 8.9585 |
| LAC | way/259338174 | 45.9995 | 8.9484 |
| Molino Nuovo, Viganello, Cassarate, Pregassona | place node | 46.007–46.019 | 8.957–8.974 |
| Castagnola, Monte Brè (vetta), Brè paese, Gandria | place/peak node | 46.001–46.011 | 8.978–9.003 |
| Monte Boglia (vetta, 1516 m) | node/415867212 | 46.0298 | 9.0076 |
| Paradiso, San Salvatore (vetta), Carona, Melide | place/peak node | 45.954–45.990 | 8.936–8.948 |
| Massagno, Breganzona, Sorengo, Muzzano, Collina d'Oro (Montagnola, Gentilino, Agra) | place node | 45.968–46.013 | 8.915–8.944 |
| Canobbio, Davesco, Soragno | place node | 46.032–46.037 | 8.967–8.981 |

- **core**: riquadro stretto dei riferimenti.
- **perimetro di prodotto** (= core + 1,5 km): S 45.94096 · O 8.89546 · N 46.05013 · E 9.02695 — **10,2 × 12,2 km**. È il poligono tratteggiato arancione sulla mappa.
- **buffer** (= perimetro + 2,5 km): S 45.9185 · O 8.86313 · N 46.07259 · E 9.05928. Tutti i dati (strade, sentieri, fermate, lago) coprono il buffer, così i percorsi possono uscire e rientrare.

Copertura territoriale, non amministrativa: include comuni distinti (Lugano, Paradiso, Melide, Massagno, Sorengo, Muzzano, Collina d'Oro, Canobbio, Porza, Comano…) e territorio italiano (Campione d'Italia, versante del Monte Boglia, Valsolda). Il comune di ogni luogo è determinato per punto-in-poligono sui confini amministrativi OSM di livello 8.

## Pipeline (riproducibile)

```bash
npm run data:all
```

| Passo | Script | Output |
|---|---|---|
| Perimetro | `scripts/geo/01-perimeter.ts` (Overpass, solo riferimenti) | `data/geo/perimeter.json` |
| OSM | `scripts/data/fetch-osm.sh` — estratti Geofabrik Svizzera + Italia nord-ovest, `osmium extract --strategy=smart` sul buffer, `osmium merge`, `osmium export` GeoJSONSeq | `data/raw/osm/lugano-area.geojsonseq` (non versionato) |
| Terreno | `scripts/geo/03-fetch-terrain.ts` — tile Terrarium z8–14 | `public/terrain/` (293 tile, 34 MB: l'area più un anello di tile per zoom, perché le curve di livello leggono i tile vicini ai bordi) |
| Terreno svizzero | `scripts/geo/06-swissalti3d.ts` — 397 celle swissALTI3D 2 m dal catalogo STAC, conversione WGS84→LV95 con le formule ufficiali swisstopo (verificata sull'esempio della documentazione: scarto 0,3 m), media dei punti nell'impronta di ogni pixel; dove manca il dato svizzero resta Terrain Tiles | stessi tile (55 % dei pixel). Vette: San Salvatore 912 m (prima 871), Monte Brè 928 (908), Monte Boglia 1516 (1479) |
| Tile vettoriali | `scripts/geo/04-build-map.ts` — classificazione, ritaglio al buffer, geojson-vt + vt-pbf | `public/tiles/lugano/` (2081 tile z8–16, 13,5 MB) + `data/build/osm/*` |
| Grafi | `scripts/geo/05-build-graphs.ts` | grafo pedonale (40 642 nodi, 46 266 archi, 2 509 km), stradale per i bus, ferroviario/funicolari |
| Orario | `scripts/data/fetch-gtfs.sh` + `scripts/transit/01-import-gtfs.ts` | 1 185 fermate, 74 linee, 55 078 corse nell'area |
| Rete trasporti | `scripts/transit/02-build-transit.ts` | 533 schemi di corsa, 1 641 tratte con geometria reale (3 approssimate, fuori perimetro), interscambi a piedi normali e senza gradini. Battelli: 69 tratte su 70 seguono le rotte `route=ferry` di OSM (59 linee unite in un grafo); l'ultima usa un percorso calcolato sull'acqua (griglia di 30 m lontana dalle rive), mai una retta sulla terraferma |
| Catalogo | `scripts/catalog/build-catalog.ts` | 87 luoghi curati, 14 eventi demo, 980 POI OSM per l'esplorazione, 34 489 indirizzi per la ricerca locale |

Tempi misurati: download ~2 minuti; `npm run data:build` ~8 secondi.

Si è scelto l'estratto Geofabrik invece di Overpass per la massa dei dati: i server Overpass pubblici erano sovraccarichi (504) e un estratto datato è più adatto a un import editoriale riproducibile. Overpass è usato solo per risolvere i riferimenti del perimetro.

## Livelli di dettaglio

| Zoom | Cosa appare |
|---|---|
| 8–11 (regionale) | lago, rilievo ombreggiato, bosco, insediamenti, strade principali, ferrovie, confini di Stato, nomi di città e vette |
| 11–13 | curve di livello (50/250 m), strade secondarie, sentieri di montagna (tratteggio rosso), funicolari, rotte dei battelli, landmark disegnati, luoghi del catalogo |
| 13–15 (quartiere) | edifici in pianta, strade locali, sentieri e scalinate, vigneti e boschi con texture, fermate |
| ≥ 15 (ravvicinata) | edifici 3D con tetti variati, vicoli e scalinate, POI, nomi delle vie, singoli personaggi (sotto 13,2 il gruppo diventa un segnaposto con il numero) |

- I percorsi del piano restano leggibili a ogni livello (alone chiaro, colori per modalità, tratteggio per il cammino).
- I personaggi sono marcatori HTML sempre sopra gli edifici: non vengono mai nascosti.
- Tile vettoriali caricati progressivamente per zoom; gli edifici solo da z13; nessun caricamento globale in memoria.
- **Dettaglio adattivo**: se durante la simulazione i fotogrammi scendono sotto ~24 fps, vengono disattivati prima il rilievo 3D e le curve di livello, poi edifici 3D, ombreggiatura e texture, con risoluzione 1×.
- La geometria non viene deformata: la semplificazione per zoom (geojson-vt) conserva connessioni e orientamento.

## Catalogo e provenienza

Ogni luogo (`data/catalog/places.yaml`) è collegato a un oggetto OSM; lo script ne ricava coordinate (punto rappresentativo interno), ingresso (nodo `entrance` OSM entro 60 m quando esiste), comune, orari OSM, accessibilità OSM, sito web e fermate vicine. Ogni informazione critica porta la sua **evidenza** (`field`, `sourceId`, `status`, date di osservazione e controllo, nota), per campo:

- `verified` — verificato su fonte ufficiale, con **URL e data di consultazione** (nel catalogo o dal pannello editoriale);
- `official_import` — importato da dataset ufficiale (orario GTFS);
- `osm` / `editorial` — plausibile, da verificare;
- `estimate` — stima (prezzi per categoria, tempi, dislivelli);
- `demo` — fixture dimostrativa;
- `unknown` — mancante (mai trattato come zero o come «aperto»).

Orari: il sottoinsieme della sintassi OSM `opening_hours` usato nel catalogo è convertito in regole strutturate (`src/shared/osm-hours.ts`, con regole aggiuntive «,» e sostitutive «;», stagioni, 25:00, PH); se la sintassi non è supportata con certezza la conversione fallisce e l'orario resta «da verificare». Sono distinti orario pubblico, cucina (quando presente) e ultimo ingresso; le festività sono quelle del Canton Ticino (feste mobili calcolate).

### Verifica sui siti ufficiali (28 settembre 2026)

Orari, tariffe e accessibilità letti sulle pagine ufficiali dei gestori (fonte `official-web`, URL e data su ogni dato, link visibile nella scheda e nel riepilogo). Nel YAML: `hours: { osm, status: verified, url, checked, valid?, closures? }`, prezzi con `url` e `checked`.

| Luogo | Cosa è stato verificato | Scoperte che cambiano i programmi |
|---|---|---|
| MASI al LAC e Palazzo Reali | orari, casse chiuse 15 min prima, tariffe LAC (20/16, gratis ≤ 16 anni) | **Palazzo Reali chiuso dal 22.9 al 16.10.2026** per riallestimento |
| MUSEC | orari (chiuso il martedì), tariffe per fasce d'età | OSM indicava orari diversi |
| Museo cantonale di storia naturale | orari 9–12 e 14–17, entrata libera | aperto anche la **domenica** (OSM: sabato ultimo giorno); chiuso lunedì e festivi |
| Museo Hermann Hesse | stagione e tariffe | **chiuso dal 2.11.2026 al 19.3.2027** |
| Swissminiatur | calendario 2026, ultimo ingresso, tariffe, accessibilità | aperto fino all'8.11; stazione FFS di Melide non accessibile |
| Lido di Lugano, Lido San Domenico | stagioni 2026 | San Domenico chiuso dal 21.9; Lido di Lugano solo spiaggia fino al 4.10 con bel tempo |
| Parco Ciani, Parco del Tassino | orari estivi e invernali | 6.30–23.30 / 6.30–21 |
| Museo doganale | stagione, gratuità, accessibilità | aperto fino al **18.10.2026** |
| Museo e Ristorante in vetta al San Salvatore | orari legati alla funicolare | chiusi dal 9.11 |
| Funicolari San Salvatore e Monte Brè | listini completi | andata e ritorno, ragazzi, metà prezzo/AG applicati (`src/server/catalog/fares.ts`) |
| Villa Ciani | — | senza apertura regolare: pianificabile solo tramite eventi |

Restano «da verificare» (i siti consultati non riportano orari): gli altri parchi, chiese, grotti e locali; i prezzi dei ristoranti restano fasce per categoria.

Eventi: ricorrenze settimanali con intervallo di validità (nessuna occorrenza dopo la fine della stagione), eccezioni per data (annullato, rinviato, esaurito), eventi su più giorni con sessioni distinte, eventi oltre mezzanotte e nella notte del cambio d'ora, eventi con orario incerto. **Sono tutti fixture dimostrative** e l'app lo dice ovunque.

## Scadenze e rivalidazione

Politica per fonte in `data/catalog/sources.yaml` (ore): OSM orari 2160, redazione orari 720 e prezzi 1440, stime prezzi 2160, GTFS trasporti 336, meteo 3. Il pannello editoriale segnala i dati oltre scadenza.

**Modifiche editoriali e aggiornamenti automatici.** Le modifiche della redazione sono salvate a parte (tabella `overrides`), con l'impronta del dato di base su cui sono state fatte. Il catalogo pubblicato è sempre file + modifiche, rivalidato con lo schema. Se un nuovo import cambia il dato di base dopo una modifica, se una modifica non è più valida o se il luogo non esiste più, la modifica **non viene persa in silenzio**: il pannello la elenca in «Conflitti da risolvere» (verificato in `tests/editorial.test.ts`). Un programma salvato conserva lo **snapshot** dei dati usati; «Verifica i dati adesso» nel riepilogo confronta lo snapshot con i dati attuali (orari, prezzi, eventi, corse, versione del feed) senza riscrivere il programma; la simulazione continua a usare lo snapshot originale.

## Licenze e attribuzioni

- OpenStreetMap: ODbL 1.0 — attribuzione «© OpenStreetMap contributors» nella mappa, nei riepiloghi e nella cartolina. I derivati (tile, grafi, catalogo) sono database derivati soggetti a ODbL.
- GTFS: condizioni d'uso di opentransportdata.swiss (riutilizzo consentito citando la fonte).
- Terrain Tiles: attribuzione alle fonti (SRTM, GMTED2010, ETOPO1 e altre) secondo la documentazione Tilezen.
- swissALTI3D: dati liberi di swisstopo (OGD), attribuzione «© swisstopo» nella mappa.
- Font dei glifi: Open Sans e PT Sans (OFL), Noto Sans (OFL).
- Open-Meteo (se attivato): CC BY 4.0, gratuito solo per uso non commerciale.
