import { useEffect, useState } from 'react';
import { useApp, useSim } from '../store.ts';
import { get, send, ApiError } from '../api.ts';
import { Badge, Empty, Spinner } from './common.tsx';
import type { Branch, Plan } from '../../shared/types.ts';
import { hhmm } from '../../shared/time.ts';

/** Programmi salvati su questo dispositivo (link personali con token di modifica). */
export function Saved() {
  const saved = useApp((s) => s.saved);
  const set = useApp((s) => s.set);
  const [offline, setOffline] = useState<string | null>(null);
  const remove = async (id: string, token: string) => {
    try { await send('DELETE', `/api/plans/${id}`, null, { headers: { 'x-edit-token': token } }); } catch { /* già eliminato */ }
    try { localStorage.removeItem(`lia.offline.${id}`); } catch { /* */ }
    set({ saved: saved.filter((s) => s.id !== id) });
  };
  if (!saved.length) return <Empty title="Nessun programma salvato">Salvate un programma dalla simulazione o dal riepilogo.</Empty>;
  return (
    <div className="saved">
      <h2>Programmi salvati</h2>
      <ul className="saved-list">
        {saved.map((s) => (
          <li key={s.id}>
            <strong>{s.title}</strong> <span className="muted">{s.date} · salvato {new Date(s.savedAt).toLocaleDateString('it-CH')}</span>
            <div className="row wrap">
              <button className="btn" onClick={() => void openSaved(s.id, s.token)}>Apri</button>
              <button className="btn-ghost" onClick={() => setOffline(s.id)}>Versione offline</button>
              <button className="btn-ghost" onClick={() => void remove(s.id, s.token)}>Elimina</button>
            </div>
            {offline === s.id ? <OfflineSummary id={s.id} /> : null}
          </li>
        ))}
      </ul>
      <p className="hint">I link personali permettono di modificare il programma: non condivideteli. Per mostrarlo ad altri usate «Condividi», revocabile.</p>
    </div>
  );
}

function OfflineSummary({ id }: { id: string }) {
  let data: { plan: Plan; savedAt: string } | null = null;
  try { data = JSON.parse(localStorage.getItem(`lia.offline.${id}`) ?? 'null'); } catch { data = null; }
  if (!data) return <div className="notice">Nessuna copia offline su questo dispositivo.</div>;
  return (
    <div className="notice">
      <strong>Copia offline del {new Date(data.savedAt).toLocaleString('it-CH')}</strong> (nessuna garanzia live: orari e corse possono essere cambiati)
      <ol>{data.plan.stops.map((s) => <li key={s.id}>{hhmm(s.start)} {s.name}</li>)}</ol>
    </div>
  );
}

export async function openSaved(id: string, token: string) {
  const app = useApp.getState();
  try {
    const r = await get<{ id: string; title: string; data: { alternatives: Plan[]; branches: Branch[]; currentBranch: string; current: Plan } }>(`/api/plans/${id}`, { headers: { 'x-edit-token': token } });
    const d = r.data;
    const branches = d.branches?.length ? d.branches : [{ id: 'main', parentId: null, label: 'Programma', decision: null, forkTime: null, plan: d.current, createdAt: new Date().toISOString() }];
    app.set({ result: { alternatives: d.alternatives ?? [d.current], understood: [], notices: ['Programma salvato: la simulazione usa lo snapshot originale dei dati. Usate «Verifica i dati adesso» nel riepilogo per l\'uso reale.'], plannerSource: d.current.plannerSource }, branches, currentBranch: d.currentBranch ?? branches[0].id, savedRef: { id, token }, view: 'summary', draft: { ...(d.current.request as any) } });
    useSim.getState().reset(Date.parse((branches.find((b) => b.id === (d.currentBranch ?? branches[0].id)) ?? branches[0]).plan.totals.startsAt));
  } catch (e) {
    app.notify(e instanceof ApiError ? e.message : 'Impossibile aprire il programma.', 'error');
    // copia offline se disponibile
    try {
      const off = JSON.parse(localStorage.getItem(`lia.offline.${id}`) ?? 'null');
      if (off?.plan) {
        app.set({ branches: [{ id: 'main', parentId: null, label: 'Copia offline', decision: null, forkTime: null, plan: off.plan, createdAt: off.savedAt }], currentBranch: 'main', view: 'summary' });
        app.notify('Aperta la copia offline salvata su questo dispositivo.', 'info');
      }
    } catch { /* */ }
  }
}

export function Settings() {
  const s = useApp((x) => x.settings);
  const setS = useApp((x) => x.setSettings);
  const row = (k: keyof typeof s, label: string, hint?: string) => (
    <label className="check block"><input type="checkbox" checked={!!s[k]} onChange={(e) => setS({ [k]: e.target.checked } as any)} /> {label}{hint ? <span className="hint"> {hint}</span> : null}</label>
  );
  return (
    <div className="settings">
      <h2>Impostazioni</h2>
      {row('threeD', 'Vista 2.5D con rilievo ed edifici in rilievo', 'Disattivate per una vista dall\'alto più leggera.')}
      {row('reducedMotion', 'Movimento ridotto', 'Niente voli di camera né animazioni dei personaggi: tutte le informazioni restano disponibili.')}
      {row('cutscenes', 'Cutscene agli arrivi')}
      {row('dialogues', 'Battute dei personaggi')}
      {row('sound', 'Suoni ambientali', 'Disattivati di default; si avviano solo durante la simulazione.')}
      {row('listView', 'Vista elenco invece della mappa', 'Alternativa testuale completa.')}
      <label className="check block"><input type="checkbox" checked={s.lighting === 'sim'} onChange={(e) => setS({ lighting: e.target.checked ? 'sim' : 'day' })} /> Luce collegata all'ora simulata <span className="hint">(effetto artistico, non calcolo astronomico)</span></label>
    </div>
  );
}

export function About() {
  const meta = useApp((s) => s.meta);
  if (!meta) return <Spinner />;
  return (
    <div className="about">
      <h2>Dati, fonti e limiti</h2>
      <p>Area coperta: {meta.perimeter.sizeKm.width}×{meta.perimeter.sizeKm.height} km. Include comuni distinti (Lugano, Paradiso, Melide, Massagno, Sorengo, Muzzano, Collina d'Oro, Canobbio e altri) e il confine con l'Italia (Campione d'Italia, Monte Boglia): non sono tutti quartieri del Comune di Lugano.</p>
      <h3>Integrazioni</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">Servizio</th><th scope="col">Stato</th><th scope="col">Dettagli</th></tr></thead>
          <tbody>{meta.integrations.map((i) => <tr key={i.id}><td>{i.name}</td><td><Badge kind={i.status === 'implementata' ? 'ok' : i.status === 'bloccata' ? 'bad' : i.status === 'dimostrativa' ? 'demo' : 'warn'}>{i.status}</Badge></td><td>{i.detail}<br /><span className="muted">{i.activation}</span></td></tr>)}</tbody>
        </table>
      </div>
      <h3>Fonti</h3>
      <ul>{meta.sources.map((s: any) => <li key={s.id}><strong>{s.name}</strong> — {s.license ?? 'uso interno'}{s.note ? `. ${s.note}` : ''}</li>)}</ul>
      <h3>Riferimenti territoriali verificati</h3>
      <p className="muted">Coordinate lette da OpenStreetMap: {meta.perimeter.references.map((r: any) => r.label).join(' · ')}.</p>
      <h3>Cosa significa</h3>
      <ul>
        <li><Badge kind="ok">verificato</Badge> controllato dalla redazione su fonte ufficiale, con data.</li>
        <li><Badge kind="ok">dato ufficiale</Badge> importato da un dataset ufficiale (orario GTFS).</li>
        <li><Badge kind="warn">OpenStreetMap</Badge> / <Badge kind="warn">redazione</Badge> dati plausibili da verificare.</li>
        <li><Badge kind="info">stima</Badge> fascia indicativa o calcolo (tempi a piedi, dislivelli, prezzi per categoria).</li>
        <li><Badge kind="demo">dimostrativo</Badge> esempio inventato per la demo (eventi, meteo demo).</li>
        <li><Badge kind="bad">mancante</Badge> informazione non disponibile: non viene mai trattata come zero.</li>
      </ul>
      <p className="muted">La folla e le animazioni del modellino sono decorative: non rappresentano presenze reali. L'app non prenota né acquista nulla.</p>
    </div>
  );
}

/** Vista condivisa (/s/:token): sola lettura, dettagli personali già rimossi dal server, voto facoltativo. */
export function ShareView({ token }: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tally, setTally] = useState<Record<string, number> | null>(null);
  const set = useApp((s) => s.set);
  useEffect(() => {
    get<any>(`/api/share/${token}`).then((d) => { setData(d); setTally(d.tally); if (d.alternatives?.length) set({ result: { alternatives: d.alternatives, understood: [], notices: [], plannerSource: d.alternatives[0].plannerSource }, selected: 0 }); }).catch((e) => setErr(e.message));
  }, [token, set]);
  const voter = (() => { try { let v = localStorage.getItem('lia.voter'); if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('lia.voter', v); } return v; } catch { return 'anon-' + Date.now(); } })();
  const vote = async (optionId: string) => {
    try { const r = await send<{ tally: Record<string, number> }>('POST', `/api/share/${token}/vote`, { voter, optionId }); setTally(r.tally); useApp.getState().notify('Voto registrato. Potete cambiarlo quando volete.', 'ok'); }
    catch (e) { useApp.getState().notify((e as Error).message, 'error'); }
  };
  if (err) return <div className="share-view"><h2>Link non disponibile</h2><div className="notice bad">{err}</div></div>;
  if (!data) return <Spinner />;
  return (
    <div className="share-view">
      <h2>{data.title}</h2>
      <p className="hint">Proposta condivisa con «Lugano in anteprima». Alcuni dettagli personali possono essere stati nascosti da chi l'ha creata.</p>
      <ul className="alt-cards">
        {data.alternatives.map((p: Plan, i: number) => (
          <li key={p.id} className="alt-card" onMouseEnter={() => set({ selected: i })}>
            <div className="alt-top"><span className="alt-letter">{String.fromCharCode(65 + i)}</span><h3>{p.title}</h3></div>
            <p className="alt-summary">{p.summary}</p>
            <ol className="alt-stops">{p.stops.map((s) => <li key={s.id}><span className="muted">{hhmm(s.start)}</span> {s.name}</li>)}</ol>
            {data.allowVotes ? <button className="btn" onClick={() => void vote(p.id)}>Voto questa{tally?.[p.id] ? ` (${tally[p.id]})` : ''}</button> : null}
          </li>
        ))}
      </ul>
      <button className="btn-ghost" onClick={() => { set({ view: 'home' }); history.pushState(null, '', '/'); }}>Crea il vostro programma</button>
    </div>
  );
}
