# Lugano in anteprima

> Prova la giornata sulla mappa. Poi vivila davvero.

Applicazione web (desktop e smartphone) che unisce una **mappa di Lugano e dintorni in stile schizzo architettonico** — dal Monte Boglia al San Salvatore, da Canobbio a Melide, con la regione attorno disegnata come contesto — a un **pianificatore di giornate** e a una **simulazione** in cui le pedine del vostro gruppo percorrono il programma su strade, sentieri, bus, funicolari e battelli reali.

Stato: **prototipo funzionante** (nessuna credenziale necessaria). Dati geografici, orari dei mezzi, eventi (calendario ufficiale luganoeventi.ch) e meteo (MeteoSvizzera via Open-Meteo) sono reali e si aggiornano da soli con GitHub Actions; i prezzi sono stime dichiarate. Vedi [docs/INTEGRAZIONI.md](docs/INTEGRAZIONI.md).

## Avvio rapido

Requisiti: Node.js ≥ 24 (consigliato; minimo 22.18: usa `node:sqlite` ed esegue il TypeScript del server direttamente), npm. Per rigenerare i dati OSM serve anche `osmium-tool`.

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

## Demo online (Render)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/tommyzaffa/lugano-in-anteprima)

Il blueprint [render.yaml](render.yaml) crea un servizio web dal [Dockerfile](Dockerfile) in modalità demo, senza credenziali. Passi, tempi misurati sul piano gratuito (e perché per un incontro dal vivo conviene lo starter), salvataggi permanenti e aggiornamento dell'orario: [docs/DEPLOY.md](docs/DEPLOY.md).

## Cosa si può fare

1. **Organizza una giornata**: schermata iniziale con idee pronte (un tocco e partono le proposte) oppure modulo in 3 passi — chi siete (una pedina per persona: nome e colore), quando e da dove, cosa vi va (atmosfera, budget; esigenze e preferenze a scomparsa). Testo libero facoltativo: se contraddice il modulo, viene chiesto di scegliere.
2. **Fino a tre alternative realmente diverse** (temi: lago e borghi, panorami, arte e storia, sapori, natura, famiglia, oltre il centro), con controlli espliciti (apertura per tutta la permanenza, ultimo ingresso, coincidenze reali, budget, cammino, mobilità, rientro), compromessi e dati mancanti. Se nessun programma è possibile, il sistema spiega perché e propone modifiche.
3. **Simulazione** con una sola barra di comandi: orologio, velocità (1×/4×/10×), avvio/pausa, salta spostamento, fine (che non inventa risposte alle decisioni obbligatorie); avanzamento con le tappe toccabili; riquadro «Adesso»; la camera segue il gruppo (e torna a farlo con un tocco); titoli agli arrivi, luce collegata all'ora simulata, fumetti brevi, suoni facoltativi.
4. **Cambiare idea e «E se…»**: +30 minuti, salta o sostituisci la prossima tappa, pausa, meno cammino, «E se piove?»; in «Altro» budget, rientro, blocco di una tappa, solo al coperto, corsa persa, posto chiuso. Ogni modifica crea una **versione** confrontabile e reversibile, con differenze di orario, costo, cammino, tappe, coincidenze perse e rientro.
5. **Esporta**: calendario `.ics`, stampa, testo da copiare, cartolina illustrata. Salvataggio, link condivisi revocabili e voto degli amici esistono ma sono disattivati nella demo (`SAVE_AND_SHARE=true` per riattivarli).
6. **Riepilogo pratico**: tappe, come arrivare, orari del giorno con fonte, costi stimati, cose da verificare, link ufficiali, **rivalidazione** con i dati attuali e **piano B se piove** (per ogni tappa all'aperto fino a due alternative al coperto, aperte in quella fascia e raggiungibili a piedi; in montagna si cerca in basso).
7. **Esplora liberamente**: luoghi del catalogo, filtro «aperto quando ci andate», punti OSM non curati, schede con provenienza di ogni dato, segnalazione di errori; **eventi** reali oggi/domani/settimana raggruppati per giorno, mostre in corso, ricerca, categorie, segnaposti sulla mappa, link alla scheda ufficiale e «organizza la giornata» attorno a un evento.
8. **Pannello editoriale** protetto: salute dei dati e delle fonti, modifica e verifica di orari/prezzi/accessibilità, eccezioni agli eventi, segnalazioni, conflitti fra modifiche manuali e nuovi import, statistiche aggregate, consumi AI, registro.

## Architettura in breve

```text
src/shared/     modelli e schemi (zod), tempo Europe/Zurich, calendario, prezzi, simulazione, esportazioni
src/server/     API (Hono), dati, routing (grafo pedonale OSM + orario GTFS con CSA), pianificatore, AI, adattatori, SQLite
src/client/     React + MapLibre GL: stile a schizzo, pedine, simulazione, modulo, schede, pannello editoriale
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
| [docs/DEPLOY.md](docs/DEPLOY.md) | Pubblicazione del link demo su Render, piani, limiti e manutenzione |
| [docs/TEST.md](docs/TEST.md) | Esito dei test, verifiche visive, prestazioni misurate, problemi aperti |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Estensioni prioritarie, separate da ciò che è già implementato |

## Limiti noti (sintesi)

- Eventi e meteo sono **dimostrativi**; nessuna agenda reale è importata finché non ci sono accessi e accordi verificati.
- Gli orari dei mezzi sono **statici** (anno orario 2026, fino al 12.12.2026): niente ritardi o soppressioni in tempo reale. Per le date successive le corse sono stimate dall'orario dello stesso giorno della settimana di un anno prima e dichiarate come tali, finché non si importa il nuovo orario.
- Prezzi: in gran parte **stime** per categoria; alcuni sono sconosciuti e restano tali.
- Orari dei luoghi da OpenStreetMap o redazionali: plausibili ma **da verificare**; l'app lo segnala sempre.
- Quote e dislivelli da un modello del terreno a ~30 m: **stime**.
- La demo online è un **prototipo non ufficiale** (non indicizzato dai motori di ricerca): la modalità demo è una tappa di sviluppo, non un servizio pubblico basato su dati aggiornati.
