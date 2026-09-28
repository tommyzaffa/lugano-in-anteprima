# Lugano in anteprima — Brief di costruzione per Claude

Versione: 1.0 — 28 settembre 2026  
Lingua del prodotto: italiano, con architettura predisposta per altre lingue.  
Destinazione: applicazione web per desktop e smartphone.  
Nome provvisorio: **Lugano in anteprima**.

> Questo documento è un incarico di implementazione. Costruisci un'applicazione funzionante, non soltanto una presentazione, una landing page o un elenco di raccomandazioni. Lavora nel repository disponibile, verifica ciò che realizzi e documenta le dipendenze esterne ancora da configurare. Le decisioni ordinarie di implementazione spettano a te; chiedi chiarimenti soltanto per blocchi reali o scelte che cambiano sostanzialmente il prodotto.

## 1. Visione

Voglio esplorare una grande Lugano in miniatura, disegnata come uno schizzo curato e intrigante. Compilo un modulo per spiegare chi siamo, quando usciamo, cosa ci piace e quanto vogliamo spendere. Un'AI propone una giornata o serata realistica e la mette in scena attraverso un gruppo di personaggi sulla mappa.

Posso seguire il gruppo, accelerare gli spostamenti, saltare le cutscene, cambiare una decisione e vedere come cambierebbe il resto della giornata. Quando il programma mi convince, lo salvo per viverlo realmente.

Il prodotto deve unire:

- Il fascino di un piccolo mondo animato e riconoscibile.
- La praticità di un pianificatore turistico locale.
- La personalizzazione di un assistente AI.
- La possibilità di sperimentare alternative senza ricominciare tutto.

Il pubblico comprende turisti, abitanti, gruppi di amici, coppie, famiglie e persone che vogliono organizzare una visita per ospiti. Deve servire anche a chi conosce già Lugano ma vuole scoprire qualcosa di diverso.

**Promessa:** «Racconta la giornata che vuoi vivere. Provala nella piccola Lugano. Poi esci davvero.»

## 2. Requisiti irrinunciabili

1. **Mappa larga di Lugano e dintorni fin dalla prima versione.** Monte Boglia e San Salvatore sono riferimenti per l'estensione, non icone decorative appoggiate ai bordi di una mappa del centro.
2. Geografia riconoscibile e fondata su dati reali: lago, strade, vie secondarie, vicoli, sentieri, rilievi e collegamenti.
3. Stile da modellino illustrato: schizzo elegante, miniatura, profondità e animazioni leggere.
4. Modulo guidato sufficiente a usare il prodotto senza scrivere un prompt. Testo libero opzionale.
5. Un personaggio per ogni componente del gruppo entro il limite esplicito supportato; niente gruppo fisso di quattro.
6. Pianificazione che consideri data, orari, durata, budget, trasporti, preferenze e rientro.
7. Conoscenza di luoghi, orari ordinari, ricorrenze settimanali, eventi straordinari ed eccezioni.
8. Simulazione con play, pausa, velocità, salto scena, prossima decisione e riepilogo.
9. Modifiche del programma con conseguenze coerenti e confronto prima/dopo.
10. Distinzione comprensibile fra dati verificati, stime, informazioni mancanti e scenari ipotetici.
11. Esperienza realmente usabile da telefono.
12. Un flusso completo dimostrabile senza credenziali, chiaramente identificato come demo, e adattatori reali configurabili.

## 3. Estensione geografica

### 3.1 Area iniziale obbligatoria

Definisci un perimetro geografico configurabile che comprenda almeno:

- Lugano centro, stazione, lungolago, Parco Ciani, LAC e quartieri interni.
- Molino Nuovo, Viganello, Cassarate e Pregassona.
- Castagnola, Monte Brè, Brè paese e Gandria.
- Monte Boglia e l'area montana circostante utile a rappresentarne gli accessi.
- Paradiso, Monte San Salvatore, Carona e Melide.
- Massagno, Breganzona, Sorengo, Muzzano e parte della Collina d'Oro.
- Canobbio e Davesco-Soragno come riferimenti per la parte settentrionale.

Questa è una copertura territoriale di prodotto: alcuni luoghi appartengono a comuni distinti. Non presentarli tutti come quartieri del Comune di Lugano.

Determina le coordinate dai dati geografici; non inventare posizioni. Calcola e salva un bounding box o poligono verificabile che contenga questi riferimenti con margine. Prevedi un buffer esterno per calcolare percorsi che possono uscire e rientrare nel perimetro.

La mappa deve essere già esplorabile sull'intera area iniziale. È accettabile aumentare progressivamente il dettaglio artistico e la densità dei contenuti, ma non ridurre silenziosamente l'estensione al centro.

### 3.2 Gerarchia visiva

- Vista regionale: lago, rilievi, insediamenti, grandi collegamenti e nomi principali.
- Vista di quartiere: strade, edifici stilizzati, fermate e attività.
- Vista ravvicinata: vicoli, scalinate, percorsi pedonali, ingressi disponibili e dettagli dei personaggi.
- I percorsi selezionati devono restare leggibili a ogni livello.
- Gli edifici non devono nascondere strada e personaggi: usa trasparenza, evidenziazione o gestione dell'occlusione.

Non deformare la topologia della rete per ottenere un disegno più bello. La semplificazione grafica deve preservare connessioni e orientamento. Eventuali esagerazioni verticali del terreno sono visive e non modificano i tempi di percorrenza.

### 3.3 Montagna e lago

Distinguere chiaramente passeggiata urbana, escursione, salita, discesa, funicolare e battello. La vicinanza in linea d'aria non equivale a un collegamento praticabile. Un itinerario sul Monte Boglia non deve essere trattato come una breve passeggiata cittadina.

Gli itinerari montani richiedono dati adeguati su percorso, durata, dislivello e condizioni disponibili. Se non sono sufficientemente supportati, il luogo resta esplorabile ma l'itinerario non viene venduto come verificato. Non creare attraversamenti del lago senza una tratta appropriata.

## 4. Direzione artistica

### Sensazione desiderata

Un atlante illustrato che prende vita: carta chiara, contorni a inchiostro, ombre morbide, lago blu o turchese, vegetazione verde salvia, facciate calde, tetti terracotta. Di sera compaiono luci delle finestre e riflessi leggeri. Il tono deve piacere anche agli adulti.

- Prospettiva obliqua o 2.5D, con possibilità di tornare alla vista dall'alto.
- Texture discreta: le etichette restano molto leggibili.
- Landmark riconoscibili curati individualmente; edifici ordinari semplificati proceduralmente.
- Vegetazione e piccole animazioni ambientali senza sovraccaricare la scena.
- Personaggi stilizzati con colori e silhouette distinguibili.
- Nomi reali delle strade, gerarchia tipografica e icone coerenti.
- Giorno, tramonto e notte collegati all'orario simulato. Se l'illuminazione è solo artistica, non presentarla come calcolo astronomico esatto.
- Suoni ambientali opzionali, disattivati inizialmente; nessun avvio sonoro indesiderato.

La mappa è il protagonista visivo. Le schede servono a capirla e usarla. Evita un'interfaccia dominata da dashboard, grafici, gradienti decorativi o lunghe conversazioni.

Le cutscene sono sequenze interattive nel motore grafico: movimenti, camera, brevi reazioni e cartelli. La prima versione non richiede generazione video AI a ogni spostamento.

## 5. Flusso principale

1. Apro l'app e vedo subito la regione illustrata, esplorabile.
2. Scelgo «Organizza una giornata» oppure «Esplora liberamente».
3. Compilo il modulo del gruppo.
4. Il sistema propone fino a tre alternative realmente differenti e compatibili, oppure spiega perché non riesce a soddisfare i vincoli.
5. Confronto durata, spesa, cammino, tappe e compromessi.
6. Scelgo un programma e vedo comparire il mio gruppo al punto di partenza.
7. Avvio la simulazione, salto gli spostamenti o provo variazioni.
8. Salvo e condivido il risultato; apro il riepilogo pratico per la visita reale.

Mostra avanzamento della ricerca in termini utili: «Cerco attività compatibili», «Verifico i collegamenti». Non mostrare ragionamento interno del modello. Fornisci invece motivazioni sintetiche e fonti delle raccomandazioni.

## 6. Modulo del gruppo

Usa campi progressivi, preimpostazioni e impostazioni avanzate richiudibili. Il flusso base deve essere rapido; non obbligare l'utente a compilare tutto.

### Campi principali

| Campo | Comportamento |
|---|---|
| Quante persone? | Intero da 1 a 12 nella prima versione; ogni persona genera un avatar. Gruppi superiori: limite spiegato, senza troncamenti silenziosi. |
| Composizione | Adulti e bambini; fasce d'età solo quando servono a prezzi o compatibilità. |
| Quando? | Data, ora di partenza e ora desiderata di fine; gestire il giorno successivo dopo mezzanotte. |
| Da dove partite? | Indirizzo, fermata, luogo sulla mappa o posizione su richiesta. |
| Dove volete terminare? | Stesso punto, alloggio, stazione o punto libero. |
| Occasione | Amici, appuntamento, famiglia, visita turistica, compleanno, ospiti, tempo libero o personalizzata. |
| Atmosfera | Chill, vivace, romantica, culturale, natura, panorami, gastronomia, avventura leggera. |
| Budget | CHF per persona o complessivo, indicazione chiara; limite rigido oppure preferenza. |
| Ritmo | Rilassato, equilibrato, intenso; cammino e dislivello massimi facoltativi. |
| Trasporti | A piedi, mezzi pubblici, battello, funicolare; ulteriori modalità solo se supportate. |
| Cosa evitare | Discoteche, luoghi rumorosi, alcol, salite, posti costosi, attività già fatte. |

### Campi opzionali

- Interessi di ogni persona e priorità del gruppo.
- Esigenze di mobilità, passeggino, scale da evitare e pause frequenti.
- Preferenze alimentari; informazioni non verificate restano tali.
- Desiderio di stare all'aperto o al coperto e tolleranza alla pioggia.
- Tappe obbligatorie, prenotazioni già effettuate e orari bloccati.
- Abbonamenti o titoli di trasporto rilevanti, senza applicare sconti non verificati.
- Luoghi conosciuti da escludere.
- Campo libero: «C'è altro che vuoi dirci?».

Se il testo libero contraddice un campo strutturato, rendi visibile la contraddizione e fai risolvere soltanto quella. Non riscrivere di nascosto il budget o l'orario.

L'utente può rinominare e personalizzare gli avatar. Nessun account o fotografia personale obbligatoria.

## 7. Attività, luoghi ed eventi

### 7.1 Catalogo

Gestisci parchi, musei, luoghi culturali, belvedere, passeggiate, lidi, impianti, ristorazione, locali serali, mercati, spettacoli, concerti, laboratori e attività stagionali.

Per ogni luogo, quando disponibile:

- Identificativo stabile, nome, coordinate, categoria, comune e punto d'ingresso.
- Descrizione breve, tag pertinenti e durata di visita stimata.
- Orari regolari, pause giornaliere, stagionalità, eccezioni e chiusure.
- Prezzi con validità temporale e distinzione fra costo per persona e per gruppo.
- Necessità di prenotazione, link ufficiale e contatti utili.
- Accessibilità e caratteristiche del percorso, con stato della verifica.
- Compatibilità indicativa con occasioni, fasce d'età e condizioni meteo.
- Fonte, data di acquisizione, ultimo controllo e diritti di riutilizzo.

Tratta separatamente orari della struttura, apertura al pubblico, cucina, biglietteria e ultimo ingresso quando rilevanti. Non dedurre un orario di chiusura del parco dall'orario degli uffici che lo gestiscono.

### 7.2 Calendario

Distinguere:

1. Aperture settimanali ordinarie.
2. Attività ricorrenti, per esempio ogni venerdì, con intervallo di validità.
3. Eventi in una data specifica.
4. Eventi su più giorni con sessioni distinte.
5. Eccezioni: festività, annullamenti, rinvii, esaurito e chiusure straordinarie.

Un evento ricorrente non deve essere ricreato indefinitamente dopo la fine della stagione. L'orario di un evento non coincide automaticamente con l'apertura del luogo ospitante.

Normalizza i dati nel fuso **Europe/Zurich**, preservando istanti e offset. Gestisci ora legale, eventi oltre mezzanotte e date senza orario certo.

### 7.3 Qualità e aggiornamento

Ogni informazione critica deve conservare la propria provenienza: una scheda non diventa interamente «verificata» perché una sola proprietà lo è.

Prevedi sincronizzazione, deduplicazione, gestione dei conflitti e un piccolo pannello editoriale protetto. Usa una politica di scadenza diversa per prezzi, orari, eventi e dati di trasporto. Rendila configurabile per fonte.

Rivalida le informazioni critiche durante la creazione di un piano e quando un programma salvato viene riaperto per l'uso reale. Durante un replay conserva invece lo snapshot originale, rendendo disponibile un aggiornamento esplicito.

Se una fonte non è disponibile, mostra l'ultima informazione con data oppure «da verificare». Non inventare eventi per riempire una serata vuota.

### 7.4 Fonti candidate

- OpenStreetMap: base geografica e punti di interesse da controllare.
- swisstopo: terreno e altri dati geografici idonei, verificando formati e condizioni.
- Open Journey Planner svizzero: itinerari e orari dei trasporti.
- Lugano Eventi e Lugano Region: calendari e contenuti turistici.
- Siti ufficiali di musei, impianti, strutture, organizzatori e operatori di trasporto.
- Fonti meteorologiche adeguate, con orizzonte e precisione dichiarati.

L'esistenza di un sito pubblico non implica che esista un'API o che i contenuti siano liberamente riutilizzabili. Verifica gli accessi prima di implementare un connettore. Se manca un'integrazione autorizzata, usa un import editoriale con fonte e data, lasciando l'adattatore predisposto.

## 8. AI e pianificazione

### 8.1 Ripartizione dei compiti

**AI:** comprende preferenze, interpreta testo libero, seleziona candidati dal catalogo, propone combinazioni, spiega compromessi e produce brevi battute coerenti con il contesto.

**Motore di pianificazione:** verifica orari, sequenza, tragitti, durata, budget, compatibilità e rientro. Decide se un piano è ammissibile sulla base dei dati disponibili.

**Motore di simulazione:** riproduce il piano e le sue varianti, aggiorna lo stato, anima gruppo e camera.

L'AI non deve essere la fonte di verità per indirizzi, aperture, tariffe, eventi e corse. Non chiedere al modello di inventare coordinate o di muovere autonomamente ogni personaggio a ogni frame.

### 8.2 Processo

1. Valida la richiesta e normalizza i vincoli.
2. Recupera luoghi ed eventi realmente candidabili nella finestra temporale.
3. Recupera collegamenti e percorrenze; applica cache e limiti alle combinazioni per evitare un'esplosione di chiamate.
4. Genera programmi candidati usando identificativi presenti nel catalogo.
5. Valida ogni candidato: apertura per tutta la permanenza necessaria, ultimo ingresso, viaggio, coincidenze, margini, spesa e rientro.
6. Correggi o scarta i candidati invalidi con un numero limitato di tentativi.
7. Restituisci fino a tre alternative con differenze sostanziali, compromessi e informazioni mancanti.
8. Genera la breve narrazione usando esclusivamente il piano validato.

Separare vincoli rigidi e preferenze. Se non esiste un piano valido, indica cosa lo impedisce e proponi quali preferenze si potrebbero modificare; non ignorare automaticamente un vincolo rigido.

Una proposta con dati incerti deve essere distinta da una proposta verificata. I costi sconosciuti non valgono zero. Non dichiarare rispettato un tetto di spesa se componenti essenziali non sono quantificate.

Il tempo di viaggio comprende accesso alla fermata, attesa, coincidenze, spostamenti e uscita. Prevedi margini configurabili. La verifica del rientro è parte del piano, specialmente per impianti, battelli ed escursioni.

### 8.3 Atmosfera e presenza di persone

«Un posto con un po' di gente» può essere una preferenza, ma l'affluenza attuale non si deduce liberamente. Distingui:

- Evento effettivamente in programma.
- Caratteristica abituale documentata o curata editorialmente.
- Stima supportata da una fonte e dal relativo orario.
- Affluenza sconosciuta.

La folla decorativa del modellino non rappresenta presenze reali. Non inventare tavoli liberi, code o percentuali di affollamento.

### 8.4 API del modello

Provider configurabile lato server, con modello e limiti impostabili. Non legare la UI a uno specifico fornitore. Usa output strutturato validato con schema, budget massimo di token, timeout, retry limitati e registrazione dei consumi senza conservare inutilmente contenuti personali.

Le pagine recuperate e le descrizioni delle attività sono dati non fidati, non istruzioni per il modello. Nessuna chiave API nel browser, nei log pubblici o nel repository. La richiesta dell'utente non può autorizzare strumenti o spese fuori dal flusso previsto.

## 9. Gruppo, NPC e simulazione

### 9.1 Personaggi

- Genera esattamente il numero di componenti richiesto, da 1 a 12.
- Le differenze individuali derivano da preferenze esplicite, non da stereotipi legati ad aspetto, età o genere.
- Il gruppo segue un programma comune. I personaggi possono avere reazioni brevi e animazioni diverse senza agenti AI separati.
- Da lontano è ammessa un'icona aggregata col numero; avvicinandosi devono tornare visibili i singoli personaggi.
- Eventuali indicatori di ritmo o affaticamento sono semplificazioni di gioco, non misure fisiologiche o predizioni del comportamento umano.

### 9.2 Stato

Mantieni almeno:

- Identificativo e versione del piano.
- Ora simulata, separata dall'orologio reale e dal tempo di animazione.
- Posizione sulla geometria del segmento attuale.
- Mezzo, tappa, segmento e attività correnti.
- Durate, spese previste e spese simulate già maturate.
- Decisioni effettuate, checkpoint e ramo corrente.
- Snapshot dei dati utilizzati e stato dell'aggiornamento.

La spesa simulata non è un addebito reale. Nessuna prenotazione o acquisto viene effettuato semplicemente facendo avanzare il gioco.

### 9.3 Controlli obbligatori

- Play e pausa.
- Velocità 1×, 4× e 10× rispetto al ritmo di riproduzione configurato, non all'attesa reale di un viaggio.
- **Salta spostamento:** raggiunge la fine del segmento mantenendo le conseguenze.
- **Prossima decisione:** avanza fino al successivo punto che richiede una scelta.
- **Vai al riepilogo:** completa la riproduzione secondo le scelte già approvate; non inventa risposte a decisioni ancora obbligatorie.
- Timeline con checkpoint selezionabili.
- Torna alla decisione precedente e prova un ramo alternativo.
- Camera «segui gruppo», camera libera e «mostra tutto il percorso».
- Disattiva cutscene e animazioni non essenziali.

Il salto di una cutscene modifica solo la presentazione. Deve produrre lo stesso stato logico della riproduzione completa: identica ora finale, posizione, costo e tappa. Non deve generare nuove richieste AI per fotogramma o per skip.

Un tragitto lungo può essere riassunto con una transizione, ma in mappa deve restare disponibile la geometria reale. I personaggi non percorrono linee rette attraverso edifici o acqua.

### 9.4 Tipi di scena

Partenza, cammino, attesa, salita su un mezzo, viaggio, arrivo, attività, pausa e decisione. Le scene devono essere brevi e saltabili. Conversazioni opzionali di poche battute, senza obbligare l'utente a leggere dialoghi ripetitivi.

## 10. Cambiare idea e provare imprevisti

Durante la simulazione posso:

- Restare 15, 30 o 60 minuti in più.
- Saltare o sostituire una tappa.
- Ridurre il budget residuo.
- Chiedere meno cammino o una pausa.
- Scegliere un'attività al coperto.
- Cambiare l'orario o il luogo di rientro.
- Fissare una tappa che non voglio perdere.

Il sistema conserva il passato del ramo e le tappe bloccate, quindi ricalcola solo quanto necessario. Mostra cosa cambia in orario, costo, cammino e attività. Se il nuovo piano è impossibile, lo spiega.

Prevedi scenari esplicitamente etichettati **«E se…»**: perdiamo il bus, restiamo mezz'ora, piove, il posto scelto non è disponibile. Sono ipotesi attivate dall'utente, non notizie sul mondo reale.

Non introdurre casualmente guasti o chiusure dentro un piano pratico. Eventuali modalità ludiche casuali saranno separate. Una perturbazione reale deve arrivare da una fonte pertinente e avere un orario di aggiornamento.

I rami devono essere confrontabili e reversibili. Un aggiornamento live non deve riscrivere silenziosamente un replay già salvato.

## 11. Interfaccia

### Desktop

- Mappa dominante.
- Pannello compatto per modulo, alternative e dettagli.
- Timeline inferiore con tappe, orari, budget e comandi della simulazione.
- Schede dei luoghi contestuali, chiudibili senza perdere lo stato.

### Smartphone

- Mappa a tutto schermo con pannello inferiore espandibile.
- Pulsanti grandi e comandi essenziali sempre raggiungibili.
- Nessuna funzione disponibile solo al passaggio del mouse.
- Modulo diviso in pochi passaggi con salvataggio dei valori.
- Possibilità di passare a una lista leggibile quando la mappa è scomoda.

### Stati da progettare

Caricamento, dati parziali, nessuna attività compatibile, errore del provider, perdita di rete, WebGL non disponibile, piano scaduto e modalità demo. Nessun pulsante deve simulare un successo quando l'azione non è implementata.

## 12. Funzioni aggiuntive con valore concreto

Implementa le funzioni essenziali della sezione 18 prima delle estensioni. Predisponi il modello dati senza costruire tutto insieme.

| Funzione | Utilità | Priorità |
|---|---|---|
| Esplora «aperto durante la mia visita» | Filtra per l'intervallo richiesto, non solo per l'ora corrente. | Prima versione |
| Costi per persona e complessivi | Rende immediata la scelta di gruppo. | Prima versione |
| Tappe bloccate | Conserva cena prenotata, spettacolo o ultimo treno. | Prima versione |
| Salva programma e riaprilo | Consente di preparare la visita in anticipo. | Prima versione |
| Riepilogo pratico | Tappe, indirizzi, tempi, fonti, cose da verificare e link utili. | Prima versione |
| Piano B per meteo o tempo ridotto | Offre alternative contestuali. | Estensione vicina |
| Esplorazione libera con filtri | Permette di scoprire luoghi senza simulazione. | Prima versione, filtri essenziali |
| «Sorprendimi» | Propone una combinazione entro vincoli e budget. | Estensione vicina |
| Preferiti e posti già visitati | Migliora l'utilità per gli abitanti. | Estensione vicina |
| Link condivisibile revocabile | Permette al gruppo di vedere la proposta senza account obbligatorio. | Estensione vicina |
| Voto degli amici sulle alternative | Aiuta a concordare il programma. | Fase successiva |
| Confronto affiancato dei rami | Mostra differenze di costo, tempo e tappe. | Prima versione in forma compatta |
| Modalità «siamo già qui» | Ricalcola dal punto attuale e dal tempo rimasto. | Estensione vicina |
| Esportazione calendario e stampa | Porta il programma fuori dall'app. | Estensione vicina |
| Riepilogo offline | Mantiene leggibili le informazioni salvate; niente garanzie live offline. | Fase successiva |
| Cartolina illustrata del percorso | Produce un ricordo condivisibile senza dettagli privati obbligatori. | Fase successiva |
| Suggerimento di errore nei dati | Aiuta il gestore a correggere orari e luoghi. | Estensione vicina |
| Vista eventi oggi/domani/settimana | Favorisce l'uso ricorrente da parte degli abitanti. | Prima versione |
| Pannello editoriale e salute delle fonti | Permette di gestire contenuti senza modificare codice. | Prima versione, essenziale |
| Statistiche aggregate del pilota | Misura uso, salvataggi e problemi di pianificazione. | Prima versione, essenziale |

Se inserisci in seguito partner commerciali, separa chiaramente contenuti sponsorizzati e pertinenza delle raccomandazioni. Non promettere integrazioni con MyLugano, biglietterie o prenotazioni prima di aver verificato accessi e accordi.

## 13. Architettura suggerita

Rispetta lo stack del repository se già adatto. In un progetto nuovo valuta TypeScript, React e un backend leggero con endpoint server. Un framework full stack è una scelta possibile, non un vincolo arbitrario.

Per la mappa valuta **MapLibre GL JS** con stile vettoriale personalizzato, terreno e livelli grafici aggiuntivi. Valuta un layer Three.js per landmark e personaggi soltanto se necessario. L'obiettivo è riutilizzare una base geografica solida, conservando una direzione artistica originale.

Non generare tutta la cartografia attraverso immagini AI: non assicurerebbe la coerenza delle strade. Eventuali asset illustrati devono appoggiarsi a coordinate e geometrie reali.

Separare i moduli:

```text
interfaccia / modulo / accessibilità
mappa / stile / terreno / personaggi / camera
catalogo / eventi / calendari / provenienza
adattatori dati / import / cache / aggiornamenti
pianificatore / vincoli / scoring / validazione
AI / strumenti consentiti / schema / spiegazioni
simulazione / stato / checkpoint / rami
salvataggio / condivisione / riepiloghi
gestione contenuti / diagnostica / consumi
```

Per ogni provider definisci un'interfaccia, un'implementazione reale e una fixture dimostrativa. Valuta un database relazionale con supporto geografico per la versione pubblica; evita infrastruttura sproporzionata per la prima dimostrazione.

Geometrie e quote devono avere sistemi di riferimento espliciti. Gestisci conversioni fra dati svizzeri e coordinate web con librerie adatte, senza confondere metri e gradi.

Usa livelli di dettaglio, geometrie semplificate a distanza e caricamento progressivo. La copertura ampia non implica caricare tutti gli edifici e tutto il terreno in memoria al primo avvio.

## 14. Modelli dati minimi

Definisci tipi e schemi runtime per:

- **GroupRequest:** persone, preferenze, vincoli, partenza, arrivo, finestra temporale e budget.
- **Person:** identificativo, avatar e preferenze volontarie.
- **Place:** coordinate, ingresso, attributi e collegamenti alle evidenze.
- **OpeningSchedule:** regole settimanali, stagionalità, eccezioni, fuso e validità.
- **EventOccurrence:** evento, sessione, luogo, inizio/fine, ricorrenza originaria e stato.
- **Evidence:** campo supportato, fonte, data di osservazione, validità, provenienza e stato della verifica.
- **RouteLeg:** modalità, geometria, durata, dislivello disponibile, orari, fermate, fonte e livello di aggiornamento.
- **PriceEstimate:** valuta, min/max, unità, partecipanti applicabili, componenti e stato noto/sconosciuto.
- **Plan:** richiesta, versione, tappe, tratte, totali, vincoli, compromessi, evidenze e snapshot.
- **PlanStop:** ingresso, uscita, permanenza, luogo/evento e blocchi temporali.
- **SimulationState:** clock, posizione, segmento, spesa, checkpoint e ramo.
- **Decision / Branch:** modifica, stato di partenza, effetti e nuovo piano validato.

Identificativi stabili per collegare tutte le entità. L'AI restituisce riferimenti a entità esistenti; ogni riferimento va validato. Non usare la sola descrizione testuale del modello come itinerario eseguibile.

## 15. Prestazioni, accessibilità e gestione

- Richieste AI e API cancellabili, timeout e retry con limiti.
- Cache distinta per catalogo, orari e dati real time; nessun riuso improprio fra date diverse.
- Nessuna chiamata AI dentro il ciclo di rendering.
- Limiti di utilizzo e protezione da consumi incontrollati.
- Funzionamento con tastiera, focus visibile, etichette dei campi, contrasto e reduced motion.
- Alternativa testuale per le informazioni essenziali della mappa.
- Budget indicativo: interfaccia iniziale utilizzabile entro 5 secondi su un dispositivo e una connessione di riferimento documentati; animazione almeno 30 fps sul dispositivo di riferimento con dettaglio adattivo.
- Misura i risultati effettivi; non dichiarare raggiunti obiettivi mai provati.
- Gestisci perdita del contesto WebGL e degrada a una vista più semplice se necessario.
- Chiavi e pannello editoriale protetti lato server.
- Posizione precisa solo su richiesta; niente localizzazione obbligatoria per esplorare.
- I link condivisi non devono pubblicare automaticamente alloggio, posizione privata o esigenze personali. Consenti rimozione dei dettagli sensibili e revoca.
- Documenta fonti, licenze e attribuzioni cartografiche. I server pubblici di tile non sono un backend illimitato per il prodotto.

## 16. Demo, dati reali e configurazione mancante

L'app deve essere avviabile senza credenziali per permettere una revisione del flusso, con **modalità demo evidente**.

La demo usa:

- Base geografica reale e distribuita con modalità compatibili con le fonti.
- Luoghi reali verificati dove disponibili.
- Fixture di eventi, prezzi, orari e itinerari per casi riproducibili, identificate come dimostrative.
- Pianificazione deterministica sostitutiva quando il modello non è configurato.
- Simulazione e comandi completamente funzionanti.

Se una risposta proviene dal planner sostitutivo, non chiamarla «AI live». Se un calendario è una fixture, non presentarlo come agenda di oggi. Se il routing non è disponibile, non tracciare una linea retta etichettandola come percorso pedonale: usa tratte dimostrative documentate o indica la mancanza del percorso.

Prepara `.env.example` senza segreti e una tabella delle integrazioni con stato: implementata, configurabile, dimostrativa, da verificare o bloccata. Elenca i passaggi necessari per attivare ciascun servizio.

La modalità demo è una tappa di sviluppo, non autorizza a dichiarare pronto un servizio pubblico basato su dati aggiornati.

## 17. Scenari di accettazione

### A. Quattro amici la sera

Quattro adulti, partenza dalla stazione, budget per persona, atmosfera chill ma sociale, niente discoteca. Il sistema propone alternative supportate dal catalogo e mostra quattro avatar. Non inventa l'affluenza.

### B. Due persone fra paesaggio e cultura

Preferenze miste, partenza diurna e rientro vincolato. Il programma può includere luoghi fuori dal centro se collegamenti e orari lo consentono. Il territorio esteso è effettivamente utilizzato.

### C. Famiglia con passeggino

Due adulti e due bambini. Le limitazioni dichiarate influenzano selezione e percorsi. Un percorso senza dati sulle scale non viene marcato automaticamente come accessibile.

### D. Monte e rientro

Richiesta che include Monte Brè, San Salvatore o Monte Boglia. Il sistema distingue tipologie di attività, accessi, durata e rientro. Non assume che tutti i monti abbiano lo stesso tipo di collegamento.

### E. Evento settimanale annullato

Una ricorrenza è normalmente prevista, ma una specifica occorrenza è cancellata. Quella data non deve includerla.

### F. Ultimo ingresso e mezzanotte

Un museo chiude più tardi dell'ultimo ingresso: l'arrivo tardivo è invalido. Un locale con intervallo 20:00–01:00 termina il giorno successivo. Aggiungere un caso di cambio dell'ora legale.

### G. Restiamo mezz'ora

La permanenza viene estesa e si perde una coincidenza. Il nuovo ramo modifica il futuro, conserva ciò che è già accaduto e mostra l'effetto sul rientro.

### H. Skip equivalente

Riprodurre una tratta e saltarla deve produrre lo stesso stato finale. Tornare a un checkpoint non deve duplicare spese o eventi.

### I. Dati incompleti e provider assente

Un costo è sconosciuto, un orario è scaduto o l'API non risponde. L'interfaccia espone il limite e il sistema non trasforma l'incertezza in certezza.

### J. Vincoli impossibili

Budget, durata e tappe obbligatorie non sono compatibili. Il sistema non restituisce un piano apparentemente valido: spiega il conflitto e offre modifiche esplicite.

### K. Gruppo variabile

Verifica 1, 4 e 12 persone, totali coerenti e corretto numero di avatar. Richieste oltre il limite devono ricevere una risposta comprensibile.

### L. Telefono e movimento ridotto

Modulo, confronto, skip e salvataggio funzionano su schermo stretto. La modalità senza animazioni conserva tutte le informazioni e decisioni.

Scrivi test mirati per calendario, vincoli, prezzi, rami e stato della simulazione, oltre a un test end-to-end del flusso principale. Prova visivamente mappa e UI; non limitarti a una build riuscita.

## 18. Ordine di implementazione

### Fase 1 — Base geografica e identità visiva

- Ispeziona repository e strumenti disponibili.
- Documenta brevemente architettura e fonti.
- Importa la copertura geografica estesa e verifica i riferimenti territoriali.
- Costruisci mappa, stile, zoom, etichette, terreno e primo gruppo animato.
- Predisponi modalità demo e caricamento progressivo.

**Uscita verificabile:** mappa larga, navigabile e riconoscibile, con personaggi su una tratta geografica documentata. Non fermarti qui.

### Fase 2 — Esperienza completa e dati strutturati

- Modulo, catalogo, calendario e prezzi.
- Un percorso verticale completo: richiesta → alternative → scelta → simulazione → modifica → salvataggio.
- Controlli di skip e checkpoint realmente equivalenti alla riproduzione.
- Catalogo iniziale distribuito anche fuori dal centro; la densità può essere limitata, la copertura no.

**Uscita verificabile:** demo completa con almeno tre scenari diversi e limiti dei dati chiaramente indicati.

### Fase 3 — AI e integrazioni reali

- Provider AI, output validato e planner a vincoli.
- Adattatore trasporti configurabile e import di dati ufficiali disponibili.
- Gestione fonti, eccezioni, freschezza e rientro.
- Rimozione delle fixture dal percorso live dove le fonti reali sono attive.

**Uscita verificabile:** flusso con dati reali dove disponibili e separazione rigorosa delle parti dimostrative. Se manca una credenziale, completa il resto e documenta il blocco.

### Fase 4 — Preparazione del pilota

- Cura mobile, accessibilità, prestazioni e gestione degli errori.
- Pannello editoriale essenziale e diagnostica dei provider.
- Verifica degli scenari di accettazione.
- Documentazione di configurazione, manutenzione e costi osservati.

Le estensioni sociali, le cartoline e altre funzioni della sezione 12 seguono il funzionamento del nucleo. Non sacrificare geografia estesa, simulazione o affidabilità per aggiungere molte funzioni superficiali.

## 19. Cosa consegnare

1. Codice eseguibile e istruzioni di avvio riproducibili.
2. Applicazione dimostrabile in locale o nell'ambiente di preview disponibile.
3. `.env.example` con descrizione delle variabili, nessun segreto.
4. Dataset iniziali e script/import documentati, con provenienza e attribuzioni.
5. README con architettura, configurazione, modalità demo/live e limiti.
6. Documentazione del perimetro geografico e dei livelli di dettaglio.
7. Esito dei test e delle verifiche visive, inclusi problemi ancora aperti.
8. Elenco preciso delle integrazioni attive e di quelle che richiedono credenziali, accesso o accordi.
9. Breve guida alla demo, utilizzabile in un incontro con la Città o Lugano Region.
10. Backlog prioritizzato delle estensioni, separato dalle funzioni già implementate.

Non dichiarare finita una funzionalità sulla base del solo disegno della schermata. Non esporre il sito pubblicamente, acquistare servizi o contattare enti senza autorizzazione specifica.

## 20. Fonti iniziali da verificare all'implementazione

Questi collegamenti sono stati consultati il 28 settembre 2026. Sono punti di partenza, non una conferma di accesso a ogni dato desiderato. Ricontrolla documentazione, versioni, quote e condizioni quando implementi.

- [Open Journey Planner 2.0 — dataset ufficiale](https://data.opentransportdata.swiss/en/dataset/ojp2-0)
- [OJP 2.0 — catalogo API](https://api-manager.opentransportdata.swiss/portal/catalogue-products/tedp_ojp20-1)
- [OJP — documentazione generale e disponibilità dei dati](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/)
- [Lugano Eventi — calendario cittadino](https://luganoeventi.ch/it/)
- [Lugano Region — agenda](https://www.luganoregion.com/it/eventi)
- [OpenStreetMap — copyright e licenza](https://www.openstreetmap.org/copyright)
- [OpenStreetMap — policy dei server pubblici di tile](https://operations.osmfoundation.org/policies/tiles/)
- [swisstopo — modello altimetrico swissALTI3D](https://www.swisstopo.admin.ch/de/hoehenmodell-swissalti3d)
- [MapLibre GL JS — documentazione ufficiale](https://maplibre.org/maplibre-gl-js/docs/)

## 21. Istruzione finale per Claude

Costruisci il prodotto seguendo questo brief, partendo da una base funzionante e incrementandola. Mantieni fin dall'inizio il territorio esteso, il carattere illustrato del modellino e il flusso completo. Prendi decisioni tecniche ragionate e documentale brevemente. Se una fonte o una chiave manca, implementa l'adattatore, una demo dichiarata e le istruzioni per attivarlo; non simulare dati live e non abbandonare le parti indipendenti.

Il primo risultato deve permettermi di compilare il modulo, vedere il gruppo corretto sulla mappa ampia di Lugano, scegliere un programma, seguirlo o saltarne le scene, modificarlo e salvare il risultato. L'obiettivo successivo è rendere quel programma affidabile per una visita reale attraverso dati e verifiche effettivamente disponibili.
