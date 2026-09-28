# Test, verifiche visive e prestazioni

Esito al 28 settembre 2026 su MacBook Pro (Apple M3 Pro), macOS 26, Node 24.8, Chrome di sistema. Aggiornamento del 29 settembre 2026 (preparazione della demo online): container Linux a 4 core, Node 22.22 e 24 (Docker), Chromium headless; vedi «Demo online» in fondo.

## Test automatici

```bash
npm test
```

**90 test, tutti superati** (Vitest, fuso del processo impostato su `America/New_York` per dimostrare l'indipendenza dal fuso della macchina).

| File | Cosa verifica |
|---|---|
| `tests/calendar.test.ts` (16) | ultimo ingresso, chiusura prima della fine della visita, chiusure del lunedì e festività ticinesi (feste mobili 2026), eccezioni per data, intervallo 20:00–01:00 al giorno dopo, **cambio d'ora** 29 marzo e 25 ottobre 2026 (durate reali 5 h e 8 h), finestra oltre mezzanotte, stagioni a cavallo d'anno, 24/7; eventi: occorrenza **annullata** visibile come tale, nessuna occorrenza dopo la fine stagione, ricorrenze con offset corretto, sessioni su più giorni con esaurito |
| `tests/osm-hours.test.ts` (9) | conversione `opening_hours` OSM: override, stagioni per mese e per data, 25:00, regole aggiuntive «,» vs sostitutive «;», PH, 24/7, rifiuto della sintassi non supportata |
| `tests/pricing.test.ts` (5) | costo per persona/gruppo, bambini gratuiti, **costo sconosciuto ≠ zero** e budget «non verificabile», tariffe adulti/ragazzi, voci facoltative |
| `tests/simulation.test.ts` (9) | **salto equivalente alla riproduzione** (posizione, spese, tappa), checkpoint senza spese duplicate, stato finale = totali del piano, «vai al riepilogo» fermo alle decisioni obbligatorie, posizione sempre sulla geometria reale, rami (passato invariato, tappa saltata rimossa); **oscuramento dei link condivisi** (alloggio e punto di partenza privati non compaiono in nessun campo, neppure nei testi delle verifiche); **iCalendar RFC 5545** (righe ≤ 75 ottetti ripiegate, CRLF, fuso Europe/Zurich) |
| `tests/scenarios.test.ts` (23) | scenari del brief sul pianificatore reale — vedi sotto |
| `tests/ai.test.ts` (1) | fornitore AI **simulato** (nessuna chiamata di rete): proposte con identificativi inesistenti scartate con avviso, piani etichettati «AI live» solo se nati dalla proposta AI e comunque ricalcolati e verificati dal motore |
| `tests/fares.test.ts` (6) | listini ufficiali delle funicolari (ragazzi, gratuità, metà prezzo/AG, Ticino Ticket), **andata e ritorno** quando si sale e si scende, prima e seconda sezione del Monte Brè in un solo biglietto; prezzi dei luoghi per fasce d'età senza doppi conteggi |
| `tests/planb.test.ts` (3) | piano B meteo: una voce per ogni tappa all'aperto; alternative al coperto, fuori dal programma, entro 25 minuti a piedi sulla rete reale, **aperte secondo il calendario** o dichiarate «orari da verificare», costo sconosciuto mai zero; in montagna ricerca in basso; filtro passeggino |
| `tests/api.test.ts` (3) | API HTTP con database in memoria: salvataggio con token personale, link condiviso **oscurato anche nei piani annidati delle decisioni** (nomi, etichette e coordinate della partenza privata), voto con nome e commento ripuliti e troncati, voto modificabile senza doppi conteggi, riepilogo dei voti per il proprietario, revoca, pannello protetto, date inesistenti rifiutate con 400 |
| `tests/timetable.test.ts` (10) | calcoli di data e ora senza Luxon nel percorso caldo **identici a Luxon** (giorno della settimana, somma di giorni su fine mese/anno/29 febbraio, data e minuto locali e offset ogni 7 minuti attorno ai cambi d'ora di marzo e ottobre), `checkVisit` con istante numerico = con DateTime; **orario di riferimento** oltre il feed (15.1.2027 → 16.1.2026 stesso giorno, festivi abbinati a domeniche, nessun abbinamento con il Corpus Domini, nulla oltre tre anni), programma del 15.1.2027 con corse dichiarate «orario stimato» (controllo incerto, mai «ufficiale», rivalidazione con avviso e non bloccante), nessuna corsa stimata dentro il feed; **tempo esaurito** senza proposte = errore dichiarato, mai «impossibile» |
| `tests/editorial.test.ts` (5) | modifiche editoriali: applicazione validata con nuova versione del catalogo, **conflitto** quando il dato di base cambia dopo la modifica, modifica non valida ignorata e segnalata, luogo sparito segnalato, luogo nascosto tolto dal catalogo pubblicato |

### Scenari di accettazione (§17)

| Scenario | Esito | Come è verificato |
|---|---|---|
| A — quattro amici la sera | ✅ | ≥2 alternative dal catalogo, 4 persone, nessuna discoteca, nessuna percentuale di affollamento inventata |
| B — paesaggio e cultura | ✅ | almeno una tappa a >1,5 km dal centro, rientro entro le 18:00 |
| C — famiglia con passeggino | ✅ | nessun tratto con scale; luoghi «non adatti» esclusi; accessibilità ignota marcata come incerta, mai accessibile |
| D — monte e rientro | ✅ | Monte Boglia raggiunto con tratto **escursione** (>300 m di salita) e controllo «condizioni non verificate»; San Salvatore con funicolare in stagione e **senza funicolare il 15 novembre** (servizio stagionale da orario GTFS) |
| E — evento annullato | ✅ | il 9 ottobre il jazz annullato non compare; se richiesto come obbligatorio → programma impossibile con motivazione «annullato» |
| F — ultimo ingresso e mezzanotte | ✅ | finestra 20:00–01:00 rispettata; notte del 25 ottobre con istanti reali (offset +02:00 → +01:00) |
| G — restiamo mezz'ora | ✅ | ramo con passato invariato, differenze calcolate, coincidenze perse e rientro mostrati (anche in e2e) |
| H — skip equivalente | ✅ | stato dopo «salta» identico allo stato dopo la riproduzione a piccoli passi; checkpoint senza duplicazioni |
| I — dati incompleti, provider assente | ✅ | costo sconosciuto del MASI Palazzo Reali non diventa zero; budget «non verificabile»; senza AI il piano è etichettato «Pianificatore deterministico» |
| J — vincoli impossibili | ✅ | budget rigido 5 CHF + ristorante costoso obbligatorio → «impossibile» con ragioni e modifiche proposte; finestra di 20 minuti → impossibile |
| K — gruppo variabile | ✅ | 1, 4 e 12 persone con totali coerenti; 13 persone rifiutate con spiegazione (anche in e2e) |
| L — telefono e movimento ridotto | ✅ | e2e su viewport 390×844: modulo, confronto, salto, riepilogo e salvataggio; nessuna cutscene con movimento ridotto; pulsanti ≥ 44 px; nessuno scroll orizzontale |
| Contraddizioni del testo libero | ✅ | budget del testo diverso dal modulo → richiesta di risoluzione; con risoluzione esplicita il piano procede |
| Tappe bloccate | ✅ | cena prenotata 19:30–21:00 mantenuta all'orario esatto |
| Eventi obbligatori | ✅ | un concerto serale scelto come tappa obbligatoria è in ogni proposta; nessuna proposta viene mai restituita senza tutte le tappe obbligatorie (prima un evento serale poteva essere perso in silenzio) |
| Fermata non accessibile | ✅ | in sedia a rotelle nessuna salita o discesa alla stazione FFS di Melide (dato con fonte in `data/catalog/stop-access.yaml`): si usa il bus |
| Chiusura straordinaria dichiarata dal gestore | ✅ | MASI Palazzo Reali obbligatorio il 2 ottobre → impossibile con il motivo «lavori di riallestimento»; il 20 ottobre è pianificabile con tariffa sconosciuta |

### End-to-end (Playwright, build di produzione)

```bash
npm run test:e2e
```

**12 test, tutti superati** (desktop 1280×800 e mobile 390×844, Chrome con WebGL software):

1. Flusso principale: esempio → proposte (confronto, dettagli e verifiche) → simulazione (salta spostamento, prossima decisione, «vai al riepilogo» bloccato dalla decisione, scelta dell'alternativa con nuovo ramo) → riepilogo → verifica dei dati → piano B se piove → salvataggio (URL personale) → link di condivisione → voto da un altro browser → **revoca** e link non più accessibile.
2. Modulo manuale: limite di 12 persone spiegato; pedine con nome e colore (limite di 12 spiegato), 3 persone → 3 pedine sulla mappa con il nome scelto.
3. Esplorazione, filtro «Cultura», scheda luogo con provenienza, segnalazione di errore.
4. Eventi dichiarati dimostrativi; ricerca, segnaposti sulla mappa e «Organizza una giornata con questo evento» fino alle proposte, che lo contengono tutte.
5. Pannello editoriale: token errato rifiutato, modifica orari, annullamento delle modifiche.
6. **Senza WebGL**: vista semplificata con schema del percorso e stato testuale.
7. Telefono + movimento ridotto (scenario L).
8. Schermi stretti (320 e 360 px): nessuno sbordamento orizzontale della pagina né della barra superiore; vista «Elenco» e ritorno alla mappa.
9. **Accessibilità automatica** (axe-core, WCAG 2.1 A/AA): home, modulo, proposte, simulazione, esplorazione su desktop; home e modulo su telefono — **0 violazioni** (la tela WebGL è esclusa: le stesse informazioni sono nel pannello e nella vista elenco).
10. **Tastiera**: il modulo si raggiunge con Tab, il focus è visibile, il dialogo «E se… piove» si apre da tastiera, tiene il focus, si chiude con Esc e riporta il focus al pulsante «Cambia idea…».

11. **Siamo in giro adesso** (orologio del browser fissato al mattino del giorno del programma, prima della partenza dell'esempio): tappa segnata come fatta esclusa, resto ricalcolato dall'ora reale. Il test ha rivelato che, se la richiesta di posizione restava senza risposta, il ricalcolo attendeva all'infinito (il timeout della geolocalizzazione parte solo dopo il permesso): ora dopo 12 s si riparte dall'ultima tappa fatta.

Audit completo su 9 viste: `node scripts/dev/a11y.mjs` (con il server di sviluppo avviato).

## Verifiche visive

Schermate controllate durante lo sviluppo con Chrome headless (script `scripts/dev/shot.mjs`):

- vista regionale all'avvio (desktop e telefono), rilievo 3D, lago, vette quotate, confine CH/IT nel lago, landmark disegnati;
- proposte con percorso per modalità (cammino tratteggiato, bus, battello sul lago, funicolari), tappe numerate, decisione;
- simulazione in città a zoom 17: edifici 3D con tetti variati, pedine affiancate con il nome, fumetti;
- luce: giorno, tramonto, notte (mappa scura, finestre accese, percorso in chiaro);
- modulo in tutti i passaggi, dialogo «E se… piove» con tabella prima/dopo, riepilogo con piano B, tutte le schede del pannello editoriale;
- larghezze 320, 360, 375, 390 px e 1280 px; bordi dell'area a zoom 13,5 (cornice «plastico» senza tagli netti di lago e boschi).

Contrasto (WCAG 2.1 AA, testo normale ≥ 4,5:1), calcolato sui colori del foglio di stile: testo 13,4:1, testo secondario 6,7:1, testo attenuato 4,6:1, stati «ok/attenzione/errore» dei badge ≥ 4,6:1, link 4,6:1, testo bianco sul pulsante principale 4,7:1. Il grigio attenuato, il verde, l'ambra, il blu lago e il terracotta sono stati scuriti di poco dopo la misura (erano fra 3,4 e 4,4:1).

Difetti trovati e corretti con queste verifiche: link condiviso che conservava nomi e coordinate della partenza privata dentro le decisioni pre-calcolate; cartolina che fotografava il tragitto da un indirizzo privato; data inesistente che causava un errore 500; barra superiore che sbordava sotto i 400 px (la griglia si allargava al contenuto), camera bloccata dai limiti della mappa che lasciava Lugano sotto il foglio inferiore su telefono, richieste di tile del terreno inesistenti ai bordi (curve di livello), marcatori dei personaggi incolonnati (CSS che annullava il posizionamento di MapLibre), limitatore di richieste applicato anche ai tile, espressioni di stile non valide (zoom dentro `match`), dialoghi sotto la barra dei comandi, camera che non seguiva il gruppo durante i salti, contesto WebGL segnalato come perso alla chiusura della mappa, glifi mancanti serviti come HTML.

## Prestazioni misurate

Script: `scripts/dev/perf.mjs` (build di produzione servita in locale). Dispositivo di riferimento: **MacBook Pro M3 Pro, Chrome, GPU Metal**; rete: **locale** e **4G simulata** (9 Mbit/s, 60 ms).

| Scenario | Interfaccia utilizzabile | Prima mappa pronta (`idle`) | Pianificazione (3 alternative) | Simulazione a 4× |
|---|---|---|---|---|
| Desktop 1280×800, rete locale | 0,13 s | 0,49 s | 2,9–4,4 s | 60 fps |
| Telefono 390×844, rete locale | 0,15 s | 0,44 s | 2,8 s | 60 fps |
| Telefono 390×844, 4G simulata | 0,64 s | 1,05 s | 4,3 s | 60 fps |
| Rendering software (SwiftShader), 1280×800 | 1,3 s | — | 3,1 s | 3 fps → **7,8 fps** con dettaglio adattivo (livello 2) |

Obiettivi del brief: interfaccia iniziale entro 5 s ✅ (dispositivo e rete di riferimento sopra); ≥30 fps sul dispositivo di riferimento ✅. Su dispositivi senza accelerazione grafica l'animazione resta sotto i 30 fps anche con dettaglio minimo: in quel caso consigliare la vista elenco (pulsante «Elenco» sulla mappa o impostazioni). Non misurato su smartphone fisici.

Dimensioni: bundle JS 1,66 MB (465 kB compressi), CSS 17 kB compressi; tile vettoriali 13,5 MB in totale (caricati per zoom), terreno 31 MB (293 tile, con un anello di tile reali attorno all'area così le curve di livello non chiedono tile mancanti), glifi 4,4 MB (caricati per intervallo di caratteri).

## Problemi aperti

- Nessuna verifica live di AI (Claude) e OJP: mancano le credenziali in questa sessione. Il codice è pronto e documentato; le chiamate sono protette da schema, timeout e fallback.
- Orari dei luoghi da OSM/redazione non ancora verificati uno per uno sulle fonti ufficiali (il pannello editoriale lo permette).
- La qualità delle proposte dipende dalla densità del catalogo (87 luoghi): alcune combinazioni restano centrate sul centro città con ritmi lenti.
- Geometria dei battelli ricostruita su una griglia d'acqua a 30 m: corretta (mai sulla terraferma) ma semplificata rispetto alle rotte reali.
- Quote da modello a ~30 m: dislivelli su scalinate brevi possono essere sottostimati.
- In rendering software l'app resta lenta (vedi sopra).
- Sul piano gratuito di Render una pianificazione richiede 13–28 s (0,1 CPU) e il primo accesso dopo 15 minuti di inattività circa un minuto; programmi salvati e link condivisi non sopravvivono a un riavvio. Per un incontro dal vivo: piano starter (misurato 2–3 s), vedi [DEPLOY.md](DEPLOY.md).
- Il deploy su Render non è stato eseguito da questa sessione (serve l'account del proprietario): il container è stato verificato in locale con gli stessi limiti di CPU e memoria.
- Le traduzioni sono predisposte (dizionario `src/client/i18n.ts`) ma l'interfaccia è solo in italiano.

## Demo online (29 settembre 2026)

Verifiche fatte per pubblicare il link su Render (vedi [DEPLOY.md](DEPLOY.md)).

**Prestazioni del pianificatore.** Un profilo CPU ha mostrato che il 53 % del tempo di una pianificazione andava nel calcolo dell'offset del fuso orario in Luxon (`Intl`), ripetuto migliaia di volte per gli stessi istanti. Con cache degli istanti locali, degli intervalli di apertura per data, dei servizi GTFS attivi per data e con aritmetica pura per le date di calendario, i risultati sono **identici** (confronto testuale completo delle proposte degli scenari A, B, C, D, J, K12) e i tempi scendono così (un core, container Linux):

| Scenario | Prima | Dopo |
|---|---|---|
| A — quattro amici la sera | 8,7 s | 0,7 s |
| B — paesaggio e cultura | 8,5 s | 1,1 s |
| C — famiglia con passeggino | 8,0 s | 0,9 s |
| D — monte e rientro | 8,3 s | 1,5 s |
| K — 12 persone | 7,3 s | 1,0 s |

**Container con i limiti di Render** (`docker run --cpus=… --memory=512m`, immagine di produzione):

| | 0,1 CPU (piano free) | 0,5 CPU (piano starter) |
|---|---|---|
| Prima del lavoro | 122 s e nessuna proposta (tempo esaurito, dichiarato per errore come «nessuna combinazione») | — |
| Pianificazione A–D, prima richiesta | 16–28 s | 1,9–2,7 s |
| Pianificazione, richieste successive | 13–16 s | — |
| Avvio del server | 15 s (prima 30 s con `tsx`) | — |
| Memoria | 130–215 MB su 512 | — |
| Immagine | 634 MB (prima 1,08 GB) | — |

Controllati anche: `X-Robots-Tag: noindex` e `robots.txt`, tile, terreno, glifi e worker di MapLibre serviti dal container, `/api/health` per il controllo di salute.

**Verifiche visive** (Chromium headless, 1280×800 e 390×844): home, esplorazione, scheda luogo, eventi, «Dati, fonti e limiti», modulo, proposte, simulazione, «Cambia idea», riepilogo, condivisione. Difetti trovati e corretti: icona delle impostazioni tagliata nella barra superiore fra 360 e 430 px (la navigazione ora non si restringe); le viste si aprivano alla posizione di scorrimento della vista precedente (es. «Dati, fonti e limiti» a metà pagina); tabella delle integrazioni illeggibile su telefono (ora schede); data del riepilogo del modulo in formato AAAA-MM-GG; esempi della home proposti per un orario già passato (ora il giorno dopo); il service worker mostrava la versione precedente dopo un nuovo deploy (ora la pagina va prima in rete).
