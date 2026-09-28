# Pubblicare la demo su Render

Obiettivo: un link pubblico (`https://…onrender.com`) per mostrare la demo senza portatile né installazioni. L'app gira in **modalità demo** (nessuna credenziale): pianificatore deterministico, eventi e meteo dimostrativi, orari dei mezzi dall'orario ufficiale statico.

## In 5 minuti (Blueprint)

Serve un account Render (gratuito) collegato a GitHub.

1. Aprite **[Deploy to Render](https://render.com/deploy?repo=https://github.com/tommyzaffa/lugano-in-anteprima)**. Render legge `render.yaml` dal ramo principale (`main`).
   Per provare un altro ramo prima di unirlo: `https://render.com/deploy?repo=https://github.com/tommyzaffa/lugano-in-anteprima/tree/<ramo>`.
2. Confermate il nome del servizio (`lugano-in-anteprima`) e **Apply**. Render costruisce il `Dockerfile` (3–6 minuti la prima volta).
3. Quando lo stato è **Live**, il link pubblico è in alto nella pagina del servizio, per esempio `https://lugano-in-anteprima.onrender.com` (se il nome è già preso Render aggiunge un suffisso).
4. Il token del pannello editoriale (`/admin`) è in **Environment → ADMIN_TOKEN** (generato da Render, non va condiviso).

In alternativa, dalla dashboard: **New → Blueprint → repository `lugano-in-anteprima`**, oppure **New → Web Service → Docker** con le variabili di `render.yaml`.

Con `autoDeploy: true` ogni push su `main` ripubblica il servizio.

## Che cosa aspettarsi dal piano gratuito

Misurato in locale con gli stessi limiti del piano gratuito (container Docker con 0,1 CPU e 512 MB):

| | Piano **free** (0,1 CPU, 512 MB) | Piano **starter** (0,5 CPU, 512 MB, circa 7 USD/mese) |
|---|---|---|
| Prima apertura dopo inattività | circa 1 minuto (il servizio si sospende dopo 15 minuti senza visite) | immediata, sempre attivo |
| Avvio del server | circa 15 s | circa 3 s |
| Pianificazione di 3 proposte | 13–28 s | 2–3 s |
| Memoria usata | 130–220 MB | uguale |
| Programmi salvati e link condivisi | persi a ogni riavvio o nuovo deploy | come free (serve un disco persistente, vedi sotto) |

Il piano gratuito basta per far provare il link con calma; **per un incontro dal vivo conviene lo starter**, oppure aprire il link 2–3 minuti prima e fare una pianificazione di prova (le successive sono più rapide). L'interfaccia avvisa quando la ricerca dura più di 8 secondi.

Per cambiare piano: pagina del servizio → **Settings → Instance Type**, oppure `plan: starter` in `render.yaml`.

### Salvataggi permanenti (facoltativo)

Sul piano gratuito il disco non è persistente: l'interfaccia lo dichiara (`EPHEMERAL_STORAGE=true`) quando si salva o si condivide. Per conservare programmi e link:

1. piano starter o superiore;
2. **Disks → Add disk**, mount path `/app/data/db`, 1 GB;
3. rimuovere la variabile `EPHEMERAL_STORAGE` (o impostarla a `false`).

## Variabili usate

| Variabile | Valore su Render | Perché |
|---|---|---|
| `ADMIN_TOKEN` | generato | accesso al pannello editoriale |
| `WEATHER_PROVIDER` | `demo` | meteo dimostrativo dichiarato (Open-Meteo è gratuito solo per uso non commerciale) |
| `AI_PROVIDER` | `none` | nessun costo AI; il pianificatore deterministico è dichiarato come tale |
| `PLANNER_TIMEOUT_MS` | `45000` | più margine con poca CPU prima di interrompere una ricerca |
| `EPHEMERAL_STORAGE` | `true` | avviso sui salvataggi non permanenti |
| `PORT`, `HOST` | impostati dal Dockerfile / da Render | il server ascolta su `0.0.0.0:10000` |

Per attivare l'AI (Claude) aggiungete `AI_PROVIDER=anthropic` e `ANTHROPIC_API_KEY` come variabile segreta; limiti di spesa in [.env.example](../.env.example).

## Cosa fa il server in pubblico

- Chiede ai motori di ricerca di **non indicizzare** il prototipo (`X-Robots-Tag: noindex` e `robots.txt`), finché non è autorizzato come servizio pubblico (`ALLOW_INDEXING=true`).
- In home e in «Dati, fonti e limiti» dichiara che è un **prototipo non ufficiale**, non un servizio della Città di Lugano o di Lugano Region.
- Limiti di frequenza per indirizzo IP (`RATE_LIMIT_*`), nessuna chiave nel browser, pannello editoriale protetto dal token.
- Il service worker carica sempre la pagina dalla rete: dopo un nuovo deploy si vede subito la versione aggiornata.

## Dopo il 12 dicembre 2026

L'orario GTFS importato vale fino al 12.12.2026. Dopo quella data l'app continua a funzionare: le corse vengono **stimate** dall'orario dello stesso giorno della settimana di un anno prima (festivi abbinati a domeniche) e ogni programma lo dichiara come «orario stimato, da verificare». Per tornare all'orario ufficiale:

```bash
GTFS_DATASET=timetable-2027-gtfs2020 npm run data:gtfs && npm run data:transit
```

poi commit e push su `main` (Render ripubblica da solo).

## Verifica in locale dello stesso container

```bash
docker build -t lugano-demo .
```

```bash
docker run --rm --cpus=0.1 --memory=512m -p 10000:10000 -e EPHEMERAL_STORAGE=true -e PLANNER_TIMEOUT_MS=45000 lugano-demo
```

Poi http://127.0.0.1:10000 (salute del servizio: `/api/health`).
