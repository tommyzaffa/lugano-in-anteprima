# Guida alla demo (20–25 minuti)

Per un incontro con la Città di Lugano o Lugano Region. Tutto funziona senza credenziali; nella schermata iniziale e in «Dati e fonti» il prototipo è dichiarato indipendente e non ufficiale.

## Preparazione (5 minuti prima)

**Con il link online** (Render, vedi [DEPLOY.md](DEPLOY.md)): aprite il link 2–3 minuti prima (sul piano gratuito il servizio si riattiva in circa un minuto) e fate una pianificazione di prova, così le successive sono più rapide. Sul piano gratuito una pianificazione richiede 15–30 s: durante l'attesa l'interfaccia lo spiega; per l'incontro è meglio il piano starter (2–3 s). Il pubblico può aprire lo stesso link sul telefono.

**In locale**, senza dipendere dalla rete:

```bash
npm run build
```

```bash
ADMIN_TOKEN=scegliete-un-token PORT=8787 npm start
```

Aprite http://127.0.0.1:8787 su un portatile collegato al proiettore e, se possibile, anche su un telefono nella stessa rete (`HOST=0.0.0.0`). Data consigliata per la demo: un venerdì o un sabato tra fine settembre e metà ottobre 2026 (funicolare del San Salvatore in stagione). Gli eventi sono quelli reali del calendario luganoeventi.ch, aggiornati ogni notte. Le idee della schermata iniziale usano la data di oggi, o di domani se l'orario dell'idea è già passato; la data si cambia al passo «Quando e da dove».

## 1. La piccola Lugano (3 min)

- La **schermata iniziale** (che fa anche da caricamento) ha due sole azioni: «Organizza una giornata» ed «Esplora la mappa», più alcune idee pronte.
- «Esplora la mappa»: si vede l'**intera area** disegnata come uno schizzo architettonico — lago tratteggiato, Monte Brè, San Salvatore, Monte Boglia sul confine, Collina d'Oro, Canobbio — e attorno la regione (Lago Maggiore, Como, i paesi, il confine) come contesto, sfumata. Ruotate e inclinate (tasto destro o due dita) per mostrare il rilievo.
- Zoomate su Gandria e sul centro: vicoli, scalinate, sentieri di montagna, funicolari, rotte dei battelli, edifici in rilievo, nomi scritti a mano.
- Punto da sottolineare: nessuna immagine generata; tutto viene da dati geografici reali (OpenStreetMap, modello del terreno, Natural Earth) con uno stile proprio.

## 2. Una serata fra amici (6 min) — scenario A

- Tornate all'inizio (logo in alto a sinistra) e toccate l'idea «Serata fra amici»: le proposte partono subito; l'attesa mostra le pedine in cammino e una sola riga di avanzamento.
- Le proposte sono schede semplici: tappe con orario, durata, cammino, spesa a persona, meteo; «⚠ dati da verificare» solo quando serve. **Dettagli** apre il percorso e, a scomparsa, le **verifiche** (apertura, ultimo ingresso, rientro, budget, trasporti statici).
- **Prova questa giornata** → ▶ → velocità 4×. Le pedine (nome e colore) camminano sulla geometria reale; agli arrivi appare il titolo della tappa; la luce cambia con l'ora.
- **✓ Fine**: se c'è una decisione aperta la simulazione si ferma e chiede — non risponde al posto nostro.

## 3. Cambiare idea (4 min) — scenari G e «E se…»

- Durante una sosta: **+30 min qui** oppure **Cambia idea → E se piove?**. Il dialogo mostra le differenze (rientro, costo, cammino, tappe, **coincidenze perse**).
- «Va bene, continuiamo»: nasce una nuova **versione**; in «Versioni» si torna a quella originale. Il passato resta invariato.

## 4. Montagna e rientro (3 min) — scenario D

- Idea «Monte e rientro» e, nel modulo («Cosa vi va» → «Esigenze e preferenze» → «Da non perdere»), Monte Boglia: il programma usa il bus 12 fino a Brè paese e poi un'**escursione** (dislivello, durata stimata, condizioni del sentiero non verificate) — non una passeggiata cittadina. Aprite la scheda del San Salvatore: funicolare stagionale da orario ufficiale.

## 5. Famiglia con passeggino (2 min) — scenario C, sul telefono

- Mostrate la stessa app su smartphone: mappa a tutto schermo, foglio inferiore da trascinare, comandi della simulazione in basso a portata di pollice. «Famiglia con passeggino»: percorsi senza scale; i luoghi senza dati sulle scale sono marcati «da verificare», mai «accessibili».

## 6. Uscire davvero (3 min)

- **Riepilogo pratico**: una riga per tappa (come arrivare, fino a che ora, costo), con percorso e orari a scomparsa; «Prima di partire» con «Verifica i dati adesso»; piano B se piove; calendario `.ics`, stampa, copia, cartolina.
- Il giorno stesso, «Siete già in giro?» ricalcola il resto del programma da dove siete.
- Eventi: «Eventi» in alto → Settimana → «Organizza la giornata» su un concerto: l'evento diventa una tappa obbligatoria.

## 7. Governance dei dati (3 min)

- `/admin` con il token: salute delle fonti, distribuzione degli stati di verifica, modifica e verifica di un orario, eccezione a un evento (annullato), segnalazioni ricevute, statistiche aggregate.
- Menu ⋯ → «Dati, fonti e limiti»: integrazioni con stato e passi per attivarle.

## Messaggi chiave

1. La mappa è larga fin da subito, ha un suo stile e si fonda su dati reali che si aggiornano da soli; le stime sono sempre dichiarate.
2. L'AI (quando attivata) propone e spiega, ma luoghi, orari, prezzi e corse li verifica il motore.
3. Il valore per la città: un modo nuovo di scoprire il territorio oltre il centro, con dati curati e aggiornabili dalla redazione.
4. Per un servizio pubblico servono: accordo sull'uso del calendario eventi, verifica redazionale di orari e prezzi, accesso OJP/tempo reale, meteo con licenza commerciale adatta (vedi [INTEGRAZIONI.md](INTEGRAZIONI.md) e [BACKLOG.md](BACKLOG.md)).

## Se qualcosa non va

- Mappa grigia: il dispositivo non ha WebGL → l'app mostra la vista semplificata (schema del percorso e testo) con le stesse informazioni.
- Link online lento o «Service waking up» di Render: il servizio gratuito si era sospeso, attendete circa un minuto. Se una ricerca si interrompe per tempo, l'app lo dice (non la dichiara impossibile): premete «Riprova».
- Nessuna proposta: leggete le ragioni mostrate e usate uno dei pulsanti di modifica suggeriti (è anch'esso parte della demo, scenario J).
