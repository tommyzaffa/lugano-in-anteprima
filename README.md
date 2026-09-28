# Lugano in anteprima

> Racconta la giornata che vuoi vivere. Provala nella piccola Lugano. Poi esci davvero.

Applicazione web (desktop e smartphone) che unisce una **mappa illustrata di Lugano e dintorni** — dal Monte Boglia al San Salvatore, da Canobbio a Melide — a un **pianificatore di giornate** e a una **simulazione** in cui il vostro gruppo di personaggi percorre il programma su strade, sentieri, bus, funicolari e battelli reali.

Stato: **prima versione funzionante in modalità demo** (nessuna credenziale necessaria). I dati geografici e gli orari dei mezzi sono reali; eventi, meteo e prezzi sono dimostrativi o stimati e sono sempre dichiarati come tali. Vedi [docs/INTEGRAZIONI.md](docs/INTEGRAZIONI.md).

## Avvio rapido

Requisiti: Node.js ≥ 24 (usa il modulo `node:sqlite` integrato), npm. Per rigenerare i dati OSM serve anche `osmium-tool`.

```bash
npm install
```

```bash
npm run dev
```

Apre l'app su http://127.0.0.1:5173 (Vite) con l'API su http://127.0.0.1:8787. I dati già costruiti (tile vettoriali, terreno, grafi, orari, catalogo) sono nel repository: non serve scaricare nulla per la demo.

Produzione (un solo processo serve app, API, tile e glifi):

```bash
npm run build
```

```bash
PORT=8787 npm start
```

Il token del pannello editoriale (`/admin`) si imposta con `ADMIN_TOKEN`; se manca, all'avvio ne viene stampato uno temporaneo nel terminale. Tutte le variabili sono descritte in [.env.example](.env.example).

## Cosa si può fare

1. **Organizza una giornata**: modulo guidato in 6 passaggi (gruppo e personaggi, quando e dove, atmosfera, budget e ritmo, esigenze, riepilogo). Testo libero facoltativo: se contraddice il modulo, viene chiesto di scegliere.
2. **Fino a tre alternative realmente diverse** (temi: lago e borghi, panorami, arte e storia, sapori, natura, famiglia, oltre il centro), con controlli espliciti (apertura per tutta la permanenza, ultimo ingresso, coincidenze reali, budget, cammino, mobilità, rientro), compromessi e dati mancanti. Se nessun programma è possibile, il sistema spiega perché e propone modifiche.
3. **Simulazione** con play/pausa, velocità 1×/4×/10×, salta spostamento, prossima decisione, vai al riepilogo (che non inventa risposte alle decisioni obbligatorie), timeline con checkpoint, camera segui/libera/tutto il percorso, cutscene saltabili, luce collegata all'ora simulata, battute brevi, suoni ambientali facoltativi.
4. **Cambiare idea e «E se…»**: +15/30/60 minuti, salta o sostituisci una tappa, riduci il budget, meno cammino, pausa, al coperto, cambia rientro, blocca una tappa; ipotesi dichiarate (perdiamo la corsa, restiamo mezz'ora, piove, posto non disponibile). Ogni modifica crea un **ramo** confrontabile e reversibile, con differenze di orario, costo, cammino, tappe, coincidenze perse e rientro.
5. **Salva, condividi, esporta**: link personale di modifica, link di condivisione **revocabile** con rimozione dei dettagli sensibili (anche nelle decisioni pre-calcolate) e voto degli amici con commenti brevi e proposta in testa, calendario `.ics`, stampa, cartolina illustrata, copia offline del riepilogo.
6. **Riepilogo pratico**: tappe, come arrivare, orari del giorno con fonte, costi stimati, cose da verificare, link ufficiali, **rivalidazione** con i dati attuali e **piano B se piove** (per ogni tappa all'aperto fino a due alternative al coperto, aperte in quella fascia e raggiungibili a piedi; in montagna si cerca in basso).
7. **Esplora liberamente**: luoghi del catalogo, filtro «aperto durante la mia visita», punti OSM non curati, schede con provenienza di ogni dato, segnalazione di errori; **eventi** oggi/domani/settimana (dimostrativi) con ricerca, categorie, segnaposti sulla mappa e «organizza una giornata con questo evento».
8. **Pannello editoriale** protetto: salute dei dati e delle fonti, modifica e verifica di orari/prezzi/accessibilità, eccezioni agli eventi, segnalazioni, conflitti fra modifiche manuali e nuovi import, statistiche aggregate, consumi AI, registro.

## Architettura in breve

```text
src/shared/     modelli e schemi (zod), tempo Europe/Zurich, calendario, prezzi, simulazione, esportazioni
src/server/     API (Hono), dati, routing (grafo pedonale OSM + orario GTFS con CSA), pianificatore, AI, adattatori, SQLite
src/client/     React + MapLibre GL: stile «atlante», personaggi, simulazione, modulo, schede, pannello editoriale
scripts/        pipeline dati riproducibile (perimetro, OSM, terreno, tile, grafi, GTFS, catalogo)
data/catalog/   contenuti editoriali (luoghi, eventi demo, fonti) in YAML
data/build/     derivati costruiti (catalogo validato, grafi, rete trasporti)
public/         tile vettoriali, tile altimetrici, glifi (serviti in locale)
tests/, e2e/    test unitari e di scenario (Vitest), end-to-end (Playwright)
```

Dettagli: [docs/ARCHITETTURA.md](docs/ARCHITETTURA.md) · dati, perimetro e livelli di dettaglio: [docs/DATI.md](docs/DATI.md).

Principi applicati: l'AI non è mai la fonte di verità (luoghi, orari, prezzi, eventi e corse vengono dal catalogo e dall'orario, e ogni riferimento è validato); i costi sconosciuti non valgono zero; lo stato della simulazione è una funzione pura del piano e dell'ora simulata, quindi saltare una scena produce esattamente lo stesso stato della riproduzione completa; nessun percorso in linea retta attraverso edifici o acqua.

## Test

```bash
npm test
```

```bash
npm run test:e2e
```

Esito attuale e verifiche visive: [docs/TEST.md](docs/TEST.md).

## Dati e attribuzioni

- Mappa, luoghi, strade e sentieri: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL (estratti Geofabrik).
- Orari: orario ufficiale svizzero GTFS, [opentransportdata.swiss](https://opentransportdata.swiss).
- Rilievo: swissALTI3D © swisstopo sul territorio svizzero; altrove Terrain Tiles (AWS Open Data; SRTM, GMTED2010, ETOPO1 e altre fonti).
- Glifi: font Open Sans / PT Sans / Noto Sans (licenze OFL/Apache, pacchetto openmaptiles/fonts).

Nessun server pubblico di tile viene usato come backend: tutta la cartografia è generata e servita in locale.

## Documenti

| Documento | Contenuto |
|---|---|
| [docs/ARCHITETTURA.md](docs/ARCHITETTURA.md) | Moduli, flussi, decisioni tecniche, sistemi di riferimento |
| [docs/DATI.md](docs/DATI.md) | Perimetro verificabile, pipeline, livelli di dettaglio, catalogo, provenienza e scadenze |
| [docs/INTEGRAZIONI.md](docs/INTEGRAZIONI.md) | Stato di ogni integrazione e passi per attivarla |
| [docs/DEMO.md](docs/DEMO.md) | Guida alla demo per un incontro con la Città o Lugano Region |
| [docs/TEST.md](docs/TEST.md) | Esito dei test, verifiche visive, prestazioni misurate, problemi aperti |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Estensioni prioritarie, separate da ciò che è già implementato |

## Limiti noti (sintesi)

- Eventi e meteo sono **dimostrativi**; nessuna agenda reale è importata finché non ci sono accessi e accordi verificati.
- Gli orari dei mezzi sono **statici** (anno orario 2026): niente ritardi o soppressioni in tempo reale.
- Prezzi: in gran parte **stime** per categoria; alcuni sono sconosciuti e restano tali.
- Orari dei luoghi da OpenStreetMap o redazionali: plausibili ma **da verificare**; l'app lo segnala sempre.
- Quote e dislivelli da un modello del terreno a ~30 m: **stime**.
- Il servizio non è pubblicato: la modalità demo è una tappa di sviluppo, non un servizio pubblico basato su dati aggiornati.
