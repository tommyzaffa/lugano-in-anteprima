/**
 * Report delle differenze dopo un aggiornamento dei dati (OSM, GTFS, catalogo).
 * Confronta i file costruiti attuali con quelli di un riferimento git (predefinito HEAD)
 * e scrive un report in Markdown per la verifica redazionale prima della pubblicazione.
 *
 *   npm run data:diff              # confronto con HEAD
 *   npm run data:diff -- <commit>  # confronto con un altro commit
 *
 * Il report non modifica nulla: segnala spostamenti di coordinate, orari OSM cambiati,
 * luoghi e fermate aggiunti o scomparsi, linee nuove o soppresse, cambi di versione del feed.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ref = process.argv[2] ?? 'HEAD';
const fromGit = (path: string): any | null => {
  try { return JSON.parse(execFileSync('git', ['show', `${ref}:${path}`], { maxBuffer: 1 << 30 }).toString('utf8')); } catch { return null; }
};
const current = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const meters = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => Math.hypot((a.lon - b.lon) * 77300, (a.lat - b.lat) * 111200);

const out: string[] = [];
const today = new Date().toISOString().slice(0, 10);
out.push(`# Report di aggiornamento dei dati — ${today}`, '', `Confronto fra i dati costruiti nella cartella di lavoro e \`${ref}\`. Nessuna modifica viene pubblicata da questo report: ogni voce segnalata va verificata dalla redazione.`, '');
let warnings = 0;

// ------------------------------------------------------------ catalogo
{
  const a = fromGit('data/build/catalog.json'), b = current('data/build/catalog.json');
  out.push('## Catalogo', '');
  if (!a) out.push('Nessun catalogo di riferimento nel commit indicato.', '');
  else {
    out.push(`Versione: \`${a.version}\` → \`${b.version}\``, '');
    const ia = new Map<string, any>(a.places.map((p: any) => [p.id, p])), ib = new Map<string, any>(b.places.map((p: any) => [p.id, p]));
    const added = [...ib.keys()].filter((k) => !ia.has(k)), removed = [...ia.keys()].filter((k) => !ib.has(k));
    if (added.length) out.push(`- **Luoghi aggiunti** (${added.length}): ${added.join(', ')}`);
    if (removed.length) { out.push(`- **Luoghi rimossi** (${removed.length}): ${removed.join(', ')} — controllare le modifiche editoriali collegate`); warnings++; }
    const rows: string[] = [];
    for (const [id, pb] of ib) {
      const pa = ia.get(id);
      if (!pa) continue;
      const notes: string[] = [];
      const d = meters(pa, pb);
      if (d > 20) notes.push(`coordinate spostate di ${Math.round(d)} m`);
      const ha = pa.schedules?.find((s: any) => s.kind === 'public'), hb = pb.schedules?.find((s: any) => s.kind === 'public');
      if ((ha?.osmOpeningHours ?? '') !== (hb?.osmOpeningHours ?? '')) notes.push(`orari «${ha?.osmOpeningHours ?? '—'}» → «${hb?.osmOpeningHours ?? '—'}»`);
      if ((ha?.evidence?.status ?? 'unknown') !== (hb?.evidence?.status ?? 'unknown')) notes.push(`stato orari ${ha?.evidence?.status ?? 'mancante'} → ${hb?.evidence?.status ?? 'mancante'}`);
      if (JSON.stringify(pa.prices) !== JSON.stringify(pb.prices)) notes.push('prezzi modificati');
      if (pa.accessibility?.wheelchair !== pb.accessibility?.wheelchair) notes.push(`sedia a rotelle ${pa.accessibility?.wheelchair} → ${pb.accessibility?.wheelchair}`);
      if ((pa.links?.website ?? '') !== (pb.links?.website ?? '')) notes.push('sito web cambiato');
      if (notes.length) rows.push(`| ${pb.name} | ${notes.join('; ')} |`);
    }
    if (rows.length) { out.push('', '| Luogo | Cambiamenti |', '|---|---|', ...rows); warnings += rows.length; }
    else out.push('- Nessun cambiamento nei luoghi esistenti.');
    const ea = new Set(a.events.map((e: any) => e.id)), eb = new Set(b.events.map((e: any) => e.id));
    const evAdd = [...eb].filter((x) => !ea.has(x)), evRem = [...ea].filter((x) => !eb.has(x));
    if (evAdd.length || evRem.length) out.push('', `- Eventi aggiunti: ${evAdd.join(', ') || 'nessuno'}; rimossi: ${evRem.join(', ') || 'nessuno'}`);
    out.push('');
  }
}

// ------------------------------------------------------------ trasporti
{
  const a = fromGit('data/build/transit.json'), b = current('data/build/transit.json');
  out.push('## Orario dei trasporti', '');
  if (!a) out.push('Nessun orario di riferimento nel commit indicato.', '');
  else {
    out.push(`Feed: \`${a.source.feedVersion}\` (${a.source.feedStart}–${a.source.feedEnd}) → \`${b.source.feedVersion}\` (${b.source.feedStart}–${b.source.feedEnd})`, '');
    out.push(`- Fermate nell'area: ${a.stops.length} → ${b.stops.length}; corse: ${a.trips.length} → ${b.trips.length}; schemi di corsa: ${a.patterns.length} → ${b.patterns.length}`);
    const names = (t: any) => new Set<string>(t.stops.map((s: any) => s.name));
    const na = names(a), nb = names(b);
    const sAdd = [...nb].filter((x) => !na.has(x)), sRem = [...na].filter((x) => !nb.has(x));
    if (sAdd.length) out.push(`- Fermate nuove (${sAdd.length}): ${sAdd.slice(0, 30).join(', ')}${sAdd.length > 30 ? '…' : ''}`);
    if (sRem.length) { out.push(`- **Fermate scomparse** (${sRem.length}): ${sRem.slice(0, 30).join(', ')}${sRem.length > 30 ? '…' : ''} — controllare i programmi salvati che le usano`); warnings++; }
    const lines = (t: any) => new Set<string>(t.routes.map((r: any) => `${r.mode} ${r.short}`));
    const la = lines(a), lb = lines(b);
    const lAdd = [...lb].filter((x) => !la.has(x)), lRem = [...la].filter((x) => !lb.has(x));
    if (lAdd.length) out.push(`- Linee nuove: ${lAdd.join(', ')}`);
    if (lRem.length) { out.push(`- **Linee non più presenti**: ${lRem.join(', ')}`); warnings++; }
    const approxA = a.segments.filter((s: any) => s.approx).length, approxB = b.segments.filter((s: any) => s.approx).length;
    if (approxB > approxA) { out.push(`- Tratte con geometria approssimata: ${approxA} → ${approxB}`); warnings++; }
    if (b.source.feedEnd < today.replace(/-/g, '')) { out.push('- **Il feed è scaduto**: importare l\'orario in vigore.'); warnings++; }
    out.push('');
  }
}

// ------------------------------------------------------------ esplorazione e rete pedonale
{
  const a = fromGit('data/build/explore.json'), b = current('data/build/explore.json');
  const ga = fromGit('data/build/graph-walk.json'), gb = current('data/build/graph-walk.json');
  out.push('## Esplorazione e rete pedonale', '');
  if (a) out.push(`- Punti OSM per l'esplorazione: ${a.pois.length} → ${b.pois.length}`);
  if (ga) out.push(`- Rete pedonale: ${ga.nodeLon.length} → ${gb.nodeLon.length} nodi, ${ga.edgeA.length} → ${gb.edgeA.length} archi`);
  if (ga && Math.abs(gb.edgeA.length - ga.edgeA.length) > ga.edgeA.length * 0.05) { out.push('- **La rete pedonale è cambiata di oltre il 5%**: rieseguire i test di scenario prima di pubblicare.'); warnings++; }
  out.push('');
}

out.push('## Esito', '', warnings ? `${warnings} voci da verificare prima della pubblicazione. Dopo la verifica: \`npm test\`, \`npm run test:e2e\`, poi commit dei dati.` : 'Nessuna voce critica. Eseguire comunque `npm test` prima di pubblicare.', '');
mkdirSync('data/reports', { recursive: true });
const file = `data/reports/aggiornamento-${today}.md`;
writeFileSync(file, out.join('\n'));
console.log(out.join('\n'));
console.log(`\nReport scritto in ${file}`);
