/**
 * Aggiornamento automatico dell'orario ufficiale (GTFS, opentransportdata.swiss).
 * Pensato per l'esecuzione settimanale su GitHub Actions: scarica e ricostruisce solo se serve.
 *
 *  - Anno orario: si passa al dataset dell'anno successivo (es. timetable-2027-gtfs2020)
 *    quando l'orario attuale scade entro 14 giorni e il nuovo dataset è pubblicato.
 *  - Freschezza: dentro lo stesso anno si aggiorna se la versione in uso ha più di 25 giorni
 *    (cantieri e modifiche infrannuali), cioè circa una volta al mese.
 *  - FORCE=1 forza l'aggiornamento.
 *
 * Uso: npm run data:gtfs-auto
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const src = JSON.parse(readFileSync('data/build/transit.json', 'utf8')).source;
const ymdToMs = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
const now = Date.now();
const today = new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
const currentDataset = String(src.url ?? '').match(/timetable-\d{4}-gtfs2020/)?.[0] ?? `timetable-${today.slice(0, 4)}-gtfs2020`;
const currentYear = Number(currentDataset.slice(10, 14));
const daysLeft = (ymdToMs(src.feedEnd) - now) / 86_400_000;
const ageDays = (now - ymdToMs(String(src.feedVersion))) / 86_400_000;
console.log(`Orario in uso: ${currentDataset}, versione ${src.feedVersion} (${Math.round(ageDays)} giorni), valido ${src.feedStart}–${src.feedEnd} (${Math.round(daysLeft)} giorni rimasti)`);

async function published(dataset: string): Promise<boolean> {
  try {
    const r = await fetch(`https://data.opentransportdata.swiss/en/dataset/${dataset}`, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(20000) });
    return r.ok;
  } catch { return false; }
}

let dataset = currentDataset;
if (daysLeft <= 14) {
  const next = `timetable-${currentYear + 1}-gtfs2020`;
  if (await published(next)) { dataset = next; console.log(`→ l'anno orario sta per finire: passo a ${next}`); }
  else console.log(`→ ${next} non ancora pubblicato: resto su ${currentDataset} (dopo la scadenza l'app stima le corse e lo dichiara)`);
}
const force = process.env.FORCE === '1';
if (dataset === currentDataset && ageDays <= 25 && !force) {
  console.log('✓ Orario aggiornato: nessun download necessario.');
  process.exit(0);
}
const run = (cmd: string) => { console.log(`$ ${cmd}`); execSync(cmd, { stdio: 'inherit', env: { ...process.env, GTFS_DATASET: dataset } }); };
run('bash scripts/data/fetch-gtfs.sh');
run('node --max-old-space-size=8192 --import tsx scripts/transit/01-import-gtfs.ts');
run('node --max-old-space-size=8192 --import tsx scripts/transit/02-build-transit.ts');
const after = JSON.parse(readFileSync('data/build/transit.json', 'utf8')).source;
console.log(`✓ Orario ricostruito: versione ${after.feedVersion}, valido ${after.feedStart}–${after.feedEnd}`);
