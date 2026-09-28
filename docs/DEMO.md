# Guida alla demo (20–25 minuti)

Per un incontro con la Città di Lugano o Lugano Region. Tutto funziona senza credenziali; il badge **DEMO** in alto è sempre visibile.

## Preparazione (5 minuti prima)

```bash
npm run build
```

```bash
ADMIN_TOKEN=scegliete-un-token PORT=8787 npm start
```

Aprite http://127.0.0.1:8787 su un portatile collegato al proiettore e, se possibile, anche su un telefono nella stessa rete (`HOST=0.0.0.0`). Data consigliata per la demo: un venerdì o un sabato tra fine settembre e metà ottobre 2026 (funicolare del San Salvatore in stagione, eventi dimostrativi presenti).

## 1. La piccola Lugano (3 min)

- All'apertura si vede l'**intera area**: lago, Monte Brè, San Salvatore, Monte Boglia sul confine, Collina d'Oro, Canobbio. Ruotate e inclinate (tasto destro o due dita) per mostrare il rilievo.
- Zoomate su Gandria e sul centro: vicoli, scalinate (tratteggio fitto), sentieri di montagna (rosso), funicolari, rotte dei battelli, edifici in rilievo con tetti in terracotta.
- Punto da sottolineare: nessuna immagine generata; tutto viene da dati geografici reali (OpenStreetMap, modello del terreno) con uno stile proprio.

## 2. Una serata fra amici (6 min) — scenario A

- «Serata fra amici» → Riepilogo del modulo → **Proponi programmi**. Mostrate l'avanzamento («Cerco attività compatibili», «Verifico i collegamenti»).
- Nelle proposte: badge «Pianificatore deterministico» (nessuna AI configurata: onestà sulla fonte), «Verificato sui dati disponibili» o «Con dati da verificare», confronto affiancato, compromessi.
- **Dettagli e verifiche**: ogni controllo è esplicito (apertura, ultimo ingresso, rientro, budget, trasporti statici).
- **Scegli e simula** → Avvia → 4×. I quattro personaggi camminano sulla geometria reale; alle fermate appaiono le cutscene; la luce cambia con l'ora (tramonto, sera).
- **Prossima decisione**: la simulazione si ferma e chiede; «Vai al riepilogo» non risponde al posto nostro.

## 3. Cambiare idea (4 min) — scenari G e «E se…»

- Durante una sosta: **+30 min** oppure «Cambia idea… → E se… piove». Il dialogo «Cosa cambia» mostra rientro, costo, cammino, tappe, **coincidenze perse**.
- Applicate: nasce un **ramo**; confrontatelo col programma originale e tornate indietro. Il passato resta invariato.

## 4. Montagna e rientro (3 min) — scenario D

- «Monte e rientro» e, nel modulo, Monte Boglia come tappa da non perdere: il programma usa il bus 12 fino a Brè paese e poi un'**escursione** (dislivello, durata stimata, condizioni del sentiero non verificate) — non una passeggiata cittadina. Aprite la scheda del San Salvatore: funicolare stagionale da orario ufficiale.

## 5. Famiglia con passeggino (2 min) — scenario C, sul telefono

- Mostrate la stessa app su smartphone: mappa a tutto schermo e foglio inferiore. «Famiglia con passeggino»: percorsi senza scale; i luoghi senza dati sulle scale sono marcati «da verificare», mai «accessibili».

## 6. Uscire davvero (3 min)

- **Riepilogo pratico**: come arrivare, orari del giorno con fonte, costi stimati, cose da verificare, «Verifica i dati adesso», calendario `.ics`, stampa, cartolina.
- **Condividi**: link senza partenza né esigenze personali, con voto degli amici; poi **revoca** il link davanti al pubblico.

## 7. Governance dei dati (3 min)

- `/admin` con il token: salute delle fonti, distribuzione degli stati di verifica, modifica e verifica di un orario, eccezione a un evento (annullato), segnalazioni ricevute, statistiche aggregate.
- «Dati, fonti e limiti» (badge DEMO): tabella delle integrazioni con stato e passi per attivarle.

## Messaggi chiave

1. La mappa è larga fin da subito e fondata su dati reali; le parti dimostrative sono sempre dichiarate.
2. L'AI (quando attivata) propone e spiega, ma luoghi, orari, prezzi e corse li verifica il motore.
3. Il valore per la città: un modo nuovo di scoprire il territorio oltre il centro, con dati curati e aggiornabili dalla redazione.
4. Per un servizio pubblico servono: feed eventi autorizzati, verifica redazionale di orari e prezzi, accesso OJP/tempo reale, meteo con licenza adatta (vedi [INTEGRAZIONI.md](INTEGRAZIONI.md) e [BACKLOG.md](BACKLOG.md)).

## Se qualcosa non va

- Mappa grigia: il dispositivo non ha WebGL → l'app mostra la vista semplificata (schema del percorso e testo) con le stesse informazioni.
- Nessuna proposta: leggete le ragioni mostrate e usate uno dei pulsanti di modifica suggeriti (è anch'esso parte della demo, scenario J).
