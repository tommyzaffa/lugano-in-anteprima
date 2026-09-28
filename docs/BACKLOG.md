# Backlog prioritizzato

Separato da ciò che è già implementato (in fondo).

## P1 — per un pilota con dati reali

1. **Feed eventi autorizzati** (Lugano Eventi, Lugano Region): accordo, adattatore ICS/JSON con fonte, data di acquisizione, deduplicazione e gestione dei conflitti; rimozione delle fixture dal percorso live.
2. **Verifica redazionale** di orari, prezzi e accessibilità: fatta sui siti ufficiali per 13 luoghi principali e le funicolari (vedi `docs/DATI.md`); restano chiese, grotti, locali e parchi minori, che richiedono contatti diretti o sopralluoghi.
3. **Chiave OJP** e verifica live: collegare `src/server/adapters/ojp.ts` alla rivalidazione dei programmi salvati; mostrare ritardi e soppressioni con orario di aggiornamento.
4. **Tariffe ufficiali** Arcobaleno e SNL con validità temporale (funicolari San Salvatore e Monte Brè già a listino, con abbonamenti applicati secondo il listino).
5. **AI live**: configurare `AI_PROVIDER=anthropic`, misurare qualità e costi su un set di richieste reali, regolare `effort` e prompt; aggiungere un set di valutazione.
6. **Meteo con licenza adatta** a un servizio pubblico (MeteoSvizzera OGD o abbonamento).
7. **Aggiornamento periodico automatico** di OSM e GTFS: il comando c'è (`npm run data:update` = scarica, ricostruisce e scrive il report delle differenze in `data/reports/`; `npm run data:diff -- <commit>` per un confronto qualsiasi); resta da pianificarlo su un server con controllo redazionale prima del commit.

## P2 — estensioni vicine

8. ~~Terreno swisstopo swissALTI3D~~ — fatto (`npm run data:terrain-ch`). Resta: zoom 15–16 del terreno per il dettaglio in città.
9. **Densità del catalogo**: più luoghi fuori dal centro (Pregassona, Canobbio, Davesco-Soragno, Muzzano, Melide), attività stagionali, laboratori, impianti sportivi; foto con diritti chiari.
10. **Sentieri**: colori della segnaletica sulla mappa fatti (da sac_scale OSM, con legenda); restano i dati SchweizMobil/Wanderland (se riutilizzabili) per durate ufficiali e condizioni.
11. ~~Rotte dei battelli da OSM~~ — fatto (69 tratte su 70). Resta: confronto con i dati di percorso SNL, se resi disponibili.
12. **Lingue**: inglese e tedesco completi (dizionari e contenuti del catalogo).
13. **Accessibilità**: dati di accessibilità delle fermate (BAV/SBB) e degli ingressi — il meccanismo c'è (`data/catalog/stop-access.yaml`, oggi con la stazione di Melide, fonte ufficiale); servono i dati completi delle FFS/UFT; percorsi per sedia a rotelle con pendenze misurate.
14. ~~Vista eventi sulla mappa~~ — fatto: segnaposti, filtri per giorno e categoria, ricerca, giornata costruita attorno a un evento.
15. ~~Voto degli amici con proposta in testa e commenti brevi~~ — fatto (nome facoltativo, commento ≤ 140 caratteri visibile a chi ha il link, riepilogo per chi l'ha creato). Resta: moderazione dei commenti da parte del creatore.
16. **Modalità «siamo già qui» nella simulazione**: ricalcolo da posizione GPS reale e ora attuale durante l'uscita, non solo dal modulo.
17. ~~Pose dei personaggi e folla decorativa dichiarata~~ — fatto (tavolo, macchina fotografica, visita, relax; figure fisse nelle piazze, dichiarate decorative). Resta: animazioni più ricche.

## P3 — fase successiva

18. Database PostgreSQL/PostGIS per la versione pubblica, con backup e migrazioni.
19. Account facoltativi per sincronizzare preferiti e programmi fra dispositivi (oggi solo su dispositivo e link).
20. Partner commerciali con **separazione chiara** fra contenuti sponsorizzati e pertinenza (il campo `sponsored` è già nel modello).
21. ~~Imbuto d'uso nel pannello~~ — fatto (conteggi aggregati per giorno, dichiarati indicativi).
22. Cartolina animata (breve sequenza del percorso).

## Già implementato (prima versione)

Mappa larga dell'intera area con stile «atlante», terreno 3D, curve di livello, edifici 3D, landmark disegnati, luce collegata all'ora; modulo guidato in 6 passaggi con personaggi personalizzabili (1–12); pianificatore a vincoli su dati reali (grafo pedonale OSM, orario GTFS) con fino a 3 alternative, spiegazioni, compromessi e impossibilità motivate; testo libero con contraddizioni esplicite; tappe bloccate e obbligatorie; simulazione con tutti i comandi richiesti, decisioni pre-validate, rami, «E se…»; salvataggio, condivisione revocabile con redazione e voto, calendario, stampa, cartolina, copia offline; esplorazione con «aperto durante la mia visita», preferiti e posti già visitati, «siamo già in giro»; eventi oggi/domani/settimana (dimostrativi); pannello editoriale con salute delle fonti, modifiche, verifiche, eccezioni, segnalazioni, statistiche e consumi AI; adattatori AI (Claude), meteo (Open-Meteo), OJP; vista semplificata senza WebGL; dettaglio adattivo; accessibilità da tastiera e movimento ridotto.
