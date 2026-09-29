# Backlog prioritizzato

Aggiornato al 29 settembre 2026. Separato da ciò che è già implementato (in fondo). Vedi anche `docs/VERIFICA-2026-09-29.md`.

## P1 — per un pilota con dati reali

1. **Feed eventi**: import reale Lugano Eventi già attivo, aggiornato ogni notte con GitHub Actions; le fixture sono usate soltanto nei test. Resta da concordare con gli enti l’uso del feed nel servizio definitivo e integrare altre fonti.
2. **Verifica redazionale** di orari, prezzi e accessibilità: fatta sui siti ufficiali per 13 luoghi principali e le funicolari (vedi `docs/DATI.md`); restano chiese, grotti, locali e parchi minori, che richiedono contatti diretti o sopralluoghi.
3. **Chiave OJP** e verifica live: collegare `src/server/adapters/ojp.ts` alla rivalidazione dei programmi salvati; mostrare ritardi e soppressioni con orario di aggiornamento.
4. **Tariffe ufficiali** Arcobaleno e SNL con validità temporale (funicolari San Salvatore e Monte Brè già a listino, con abbonamenti applicati secondo il listino).
5. **AI live**: configurare `AI_PROVIDER=anthropic`, misurare qualità e costi su un set di richieste reali, regolare `effort` e prompt; aggiungere un set di valutazione.
6. **Meteo con licenza adatta** a un servizio pubblico (MeteoSvizzera OGD o abbonamento).
7. **Orario 2027**: l'orario GTFS importato vale fino al 12.12.2026; dopo, le corse sono stimate dallo stesso giorno della settimana dell'anno precedente (dichiarato). Importare `timetable-2027-gtfs2020` appena pubblicato (comando in `docs/DEPLOY.md`).
8. ~~Aggiornamento periodico automatico~~ — GitHub Actions aggiorna eventi ogni giorno, GTFS ogni settimana e OSM ogni trimestre; smoke test prima del commit e deploy Render automatico.

## P2 — estensioni vicine

9. ~~Terreno swisstopo swissALTI3D~~ — fatto (`npm run data:terrain-ch`). Resta: zoom 15–16 del terreno per il dettaglio in città.
10. **Densità del catalogo**: ampliato a 1.068 luoghi OSM e curati sull’intero perimetro, con zone selezionabili e raggio per gli itinerari. Restano verifica editoriale degli orari mancanti, attività stagionali e foto con diritti chiari.
11. **Sentieri**: colori della segnaletica sulla mappa fatti (da sac_scale OSM, con legenda); restano i dati SchweizMobil/Wanderland (se riutilizzabili) per durate ufficiali e condizioni.
12. ~~Rotte dei battelli da OSM~~ — fatto (69 tratte su 70). Resta: confronto con i dati di percorso SNL, se resi disponibili.
13. **Lingue**: interfaccia italiana, inglese, francese e tedesca, rilevamento browser e scelta persistente. I testi editoriali e delle fonti esterne mantengono la lingua originale, dichiarata nelle schede; traduzione editoriale del catalogo da completare separatamente.
14. **Accessibilità**: dati di accessibilità delle fermate (BAV/SBB) e degli ingressi — il meccanismo c'è (`data/catalog/stop-access.yaml`, oggi con la stazione di Melide, fonte ufficiale); servono i dati completi delle FFS/UFT; percorsi per sedia a rotelle con pendenze misurate.
15. ~~Vista eventi sulla mappa~~ — fatto: segnaposti, filtri per giorno e categoria, ricerca, giornata costruita attorno a un evento.
16. ~~Voto degli amici con proposta in testa e commenti brevi~~ — fatto (nome facoltativo, commento ≤ 140 caratteri visibile a chi ha il link, riepilogo per chi l'ha creato). Resta: moderazione dei commenti da parte del creatore.
17. ~~«Siamo in giro adesso» durante l'uscita~~ — fatto: il giorno del programma, dal riepilogo, si segnano le tappe fatte e si ricalcola il resto dall'ora reale e dalla posizione (solo se concessa).
18. ~~Pose dei personaggi e folla decorativa dichiarata~~ — fatto (tavolo, macchina fotografica, visita, relax; figure fisse nelle piazze, dichiarate decorative). Resta: animazioni più ricche.

## P3 — fase successiva

19. Database PostgreSQL/PostGIS per la versione pubblica, con backup e migrazioni.
20. Account facoltativi per sincronizzare preferiti e programmi fra dispositivi (oggi solo su dispositivo e link).
21. Partner commerciali con **separazione chiara** fra contenuti sponsorizzati e pertinenza (il campo `sponsored` è già nel modello).
22. ~~Imbuto d'uso nel pannello~~ — fatto (conteggi aggregati per giorno, dichiarati indicativi).
23. Cartolina animata (breve sequenza del percorso).

## Già implementato (prima versione)

Mappa larga dell'intera area in stile schizzo architettonico, con la regione attorno disegnata come contesto, terreno 3D, curve di livello, edifici 3D, landmark disegnati, luce collegata all'ora; schermata iniziale con idee pronte; modulo in 3 passi con pedine (nome e colore, 1–12); interfaccia essenziale (una barra di comandi nella simulazione, dettagli a scomparsa); pianificatore a vincoli su dati reali (grafo pedonale OSM, orario GTFS) con fino a 3 alternative, spiegazioni, compromessi e impossibilità motivate; testo libero con contraddizioni esplicite; tappe bloccate e obbligatorie; simulazione con tutti i comandi richiesti, decisioni pre-validate, rami, «E se…»; salvataggio, condivisione revocabile con redazione e voto, calendario, stampa, cartolina, copia offline; esplorazione con «aperto durante la mia visita», preferiti e posti già visitati, «siamo già in giro»; eventi reali (luganoeventi.ch, aggiornati ogni notte) oggi/domani/settimana e mostre in corso; pannello editoriale con salute delle fonti, modifiche, verifiche, eccezioni, segnalazioni, statistiche e consumi AI; adattatori AI (Claude), meteo (Open-Meteo), OJP; vista semplificata senza WebGL; dettaglio adattivo; accessibilità da tastiera e movimento ridotto; pubblicazione della demo su Render (blueprint, container verificato con i limiti del piano gratuito, prototipo non indicizzato e dichiarato non ufficiale), orario di riferimento dichiarato per le date oltre il feed GTFS.
