import { tx, getLocale } from '../locale.ts';
import { useEffect, useMemo, useState } from 'react';
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
  if (!saved.length) return <Empty title={tx("Nessun programma salvato")}>{tx("Salvate un programma dalla simulazione o dal riepilogo.")}</Empty>;
  return (
    <div className="saved">
      <h2>{tx("Programmi salvati")}</h2>
      <ul className="saved-list">
        {saved.map((s) => (
          <li key={s.id}>
            <strong>{tx(s.title)}</strong> <span className="muted">{tx(s.date)}{tx(" · salvato ")}{tx(new Date(s.savedAt).toLocaleDateString(getLocale()))}</span>
            <div className="row wrap">
              <button className="btn" onClick={() => void openSaved(s.id, s.token)}>{tx("Apri")}</button>
              <button className="btn-ghost" onClick={() => setOffline(s.id)}>{tx("Versione offline")}</button>
              <button className="btn-ghost" onClick={() => void remove(s.id, s.token)}>{tx("Elimina")}</button>
            </div>
            {offline === s.id ? <OfflineSummary id={s.id} /> : null}
          </li>
        ))}
      </ul>
      <p className="hint">{tx("I link personali permettono di modificare il programma: non condivideteli. Per mostrarlo ad altri usate «Condividi», revocabile.")}</p>
    </div>
  );
}

function OfflineSummary({ id }: { id: string }) {
  let data: { plan: Plan; savedAt: string } | null = null;
  try { data = JSON.parse(localStorage.getItem(`lia.offline.${id}`) ?? 'null'); } catch { data = null; }
  if (!data) return <div className="notice">{tx("Nessuna copia offline su questo dispositivo.")}</div>;
  return (
    <div className="notice">
      <strong>{tx("Copia offline del ")}{tx(new Date(data.savedAt).toLocaleString(getLocale()))}</strong>{tx(" (nessuna garanzia live: orari e corse possono essere cambiati)")}<ol>{data.plan.stops.map((s) => <li key={s.id}>{tx(hhmm(s.start))} {tx(s.name)}</li>)}</ol>
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
    <label className="check block"><input type="checkbox" checked={!!s[k]} onChange={(e) => setS({ [k]: e.target.checked } as any)} /> {tx(label)}{hint ? <span className="hint"> {tx(hint)}</span> : null}</label>
  );
  return (
    <div className="settings">
      <h2>{tx("Impostazioni")}</h2>
      {tx(row('threeD', 'Rilievo ed edifici in 3D', 'Disattivate per una mappa più leggera, vista dall\'alto.'))}
      {tx(row('reducedMotion', 'Movimento ridotto', 'Niente voli di camera né animazioni.'))}
      {tx(row('cutscenes', 'Titoli agli arrivi'))}
      {tx(row('dialogues', 'Fumetti delle pedine'))}
      {tx(row('sound', 'Suoni ambientali', 'Solo durante la simulazione.'))}
      {tx(row('listView', 'Vista elenco invece della mappa', 'Stesse informazioni, senza grafica.'))}
      <label className="check block"><input type="checkbox" checked={s.lighting === 'sim'} onChange={(e) => setS({ lighting: e.target.checked ? 'sim' : 'day' })} />{tx(" Luce che segue l'ora simulata")}</label>
    </div>
  );
}

export function About() {
  const meta = useApp((s) => s.meta);
  if (!meta) return <Spinner />;
  return (
    <div className="about">
      <h2>{tx("Dati, fonti e limiti")}</h2>
      <div className="notice">{tx("Prototipo indipendente, in sviluppo: non è un servizio ufficiale della Città di Lugano né di Lugano Region. Luoghi, strade, sentieri, orari dei mezzi, eventi e meteo vengono da fonti pubbliche reali, aggiornate automaticamente; i prezzi sono stime. L'app non prenota né acquista nulla.")}{tx(meta.hosting?.ephemeralStorage && meta.features?.sharing ? ' In questa demo pubblica i programmi salvati possono sparire quando il server si riavvia.' : '')}</div>
      <p>{tx("Area coperta: ")}{tx(meta.perimeter.sizeKm.width)}×{tx(meta.perimeter.sizeKm.height)}{tx(" km. Lugano e dintorni, inclusi Caslano, Comano, Cureglia e le altre località della mappa. Fuori da quest’area la cartografia è solo un contesto disegnato.")}</p>
      <h3>{tx("Integrazioni")}</h3>
      <ul className="integrations">
        {meta.integrations.map((i) => (
          <li key={i.id}>
            <div className="int-head"><strong>{tx(i.name)}</strong> <Badge kind={i.status === 'implementata' ? 'ok' : i.status === 'bloccata' ? 'bad' : i.status === 'dimostrativa' ? 'demo' : 'warn'}>{tx(i.status)}</Badge></div>
            <p>{tx(i.detail)}</p>
            <p className="muted">{tx(i.activation)}</p>
          </li>
        ))}
      </ul>
      <h3>{tx("Fonti")}</h3>
      <ul>{meta.sources.map((s: any) => <li key={s.id}><strong>{tx(s.name)}</strong> — {tx(s.license ?? 'uso interno')}{tx(s.note ? `. ${s.note}` : '')}</li>)}</ul>
      <h3>{tx("Riferimenti territoriali verificati")}</h3>
      <p className="muted">{tx("Coordinate lette da OpenStreetMap: ")}{tx(meta.perimeter.references.map((r: any) => r.label).join(' · '))}.</p>
      <h3>{tx("Cosa significa")}</h3>
      <ul>
        <li><Badge kind="ok">{tx("verificato")}</Badge>{tx(" controllato dalla redazione su fonte ufficiale, con data.")}</li>
        <li><Badge kind="ok">{tx("dato ufficiale")}</Badge>{tx(" importato da un dataset ufficiale (orario GTFS).")}</li>
        <li><Badge kind="warn">{tx("OpenStreetMap")}</Badge> / <Badge kind="warn">{tx("redazione")}</Badge>{tx(" dati plausibili da verificare.")}</li>
        <li><Badge kind="info">{tx("stima")}</Badge>{tx(" fascia indicativa o calcolo (tempi a piedi, dislivelli, prezzi per categoria).")}</li>
        <li><Badge kind="demo">{tx("dimostrativo")}</Badge>{tx(" esempio inventato per la demo (eventi, meteo demo).")}</li>
        <li><Badge kind="bad">{tx("mancante")}</Badge>{tx(" informazione non disponibile: non viene mai trattata come zero.")}</li>
      </ul>
      <p className="muted">{tx("La folla e le animazioni del modellino sono decorative: non rappresentano presenze reali. L'app non prenota né acquista nulla.")}</p>
    </div>
  );
}

/** Vista condivisa (/s/:token): sola lettura, dettagli personali già rimossi dal server, voto facoltativo. */
interface VoteComment { optionId: string; name: string | null; comment: string; at: string }

export function ShareView({ token }: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tally, setTally] = useState<Record<string, number> | null>(null);
  const [comments, setComments] = useState<VoteComment[]>([]);
  const [mine, setMine] = useState<{ optionId: string; name: string; comment: string } | null>(null);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const set = useApp((s) => s.set);
  const voter = useMemo(() => { try { let v = localStorage.getItem('lia.voter'); if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('lia.voter', v); } return v; } catch { return 'anon-' + Math.random().toString(36).slice(2) + Date.now().toString(36); } }, []);
  useEffect(() => {
    get<any>(`/api/share/${token}?voter=${encodeURIComponent(voter)}`).then((d) => {
      setData(d); setTally(d.tally); setComments(d.comments ?? []); setMine(d.myVote ?? null);
      if (d.myVote) { setName(d.myVote.name ?? ''); setComment(d.myVote.comment ?? ''); }
      if (d.alternatives?.length) set({ result: { alternatives: d.alternatives, understood: [], notices: [], plannerSource: d.alternatives[0].plannerSource }, selected: 0 });
    }).catch((e) => setErr(e.message));
  }, [token, set, voter]);
  const vote = async (optionId: string) => {
    try {
      const r = await send<{ tally: Record<string, number>; comments: VoteComment[]; myVote: any }>('POST', `/api/share/${token}/vote`, { voter, optionId, name, comment });
      setTally(r.tally); setComments(r.comments); setMine(r.myVote);
      useApp.getState().notify('Voto registrato. Potete cambiarlo quando volete.', 'ok');
    } catch (e) { useApp.getState().notify((e as Error).message, 'error'); }
  };
  if (err) return <div className="share-view"><h2>{tx("Link non disponibile")}</h2><div className="notice bad">{tx(err)}</div></div>;
  if (!data) return <Spinner />;
  const letter = (id: string) => String.fromCharCode(65 + Math.max(0, data.alternatives.findIndex((p: Plan) => p.id === id)));
  const total = Object.values(tally ?? {}).reduce((a: number, b) => a + (b as number), 0);
  const max = Math.max(0, ...Object.values(tally ?? {}).map(Number));
  const leaders = Object.entries(tally ?? {}).filter(([, n]) => n === max && max > 0).map(([id]) => id);
  return (
    <div className="share-view">
      <h2>{tx(data.title)}</h2>
      <p className="hint">{tx("Proposta condivisa con «Lugano in anteprima». Alcuni dettagli personali possono essere stati nascosti da chi l'ha creata.")}</p>
      {tx(data.allowVotes ? (
        <div className="vote-box">
          <p><strong>{tx("Votate la vostra preferita.")}</strong> {tx(total ? `${total} ${total === 1 ? 'voto' : 'voti'} finora${leaders.length === 1 ? `: in testa la proposta ${letter(leaders[0])}` : leaders.length > 1 ? `: parità fra ${leaders.map(letter).join(' e ')}` : ''}.` : 'Nessun voto finora.')}</p>
          <div className="row wrap">
            <label>{tx("Nome (facoltativo) ")}<input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={tx("es. Sara")} /></label>
            <label className="grow">{tx("Commento breve (facoltativo) ")}<input value={comment} maxLength={140} onChange={(e) => setComment(e.target.value)} placeholder={tx("es. meglio se rientriamo presto")} /></label>
          </div>
          <p className="hint">{tx("Nome e commento sono visibili a chi ha il link. Non scrivete dati personali.")}</p>
        </div>
      ) : null)}
      <ul className="alt-cards">
        {data.alternatives.map((p: Plan, i: number) => {
          const n = tally?.[p.id] ?? 0;
          const lead = leaders.length === 1 && leaders[0] === p.id;
          return (
            <li key={p.id} className={`alt-card ${lead ? 'leading' : ''} ${mine?.optionId === p.id ? 'my-vote' : ''}`} onMouseEnter={() => set({ selected: i })} onFocus={() => set({ selected: i })} onClick={() => set({ selected: i })}>
              <div className="alt-top"><span className="alt-letter">{tx(String.fromCharCode(65 + i))}</span><h3>{tx(p.title)}</h3>{lead ? <Badge kind="ok">{tx("in testa")}</Badge> : null}</div>
              <p className="alt-summary">{tx(p.summary)}</p>
              <ol className="alt-stops">{p.stops.map((s) => <li key={s.id}><span className="muted">{tx(hhmm(s.start))}</span> {tx(s.name)}</li>)}</ol>
              {tx(data.allowVotes ? (
                <>
                  {total ? <div className="vote-bar" aria-label={tx(`${n} voti su ${total}`)}><span style={{ width: `${Math.round((n / total) * 100)}%` }} /></div> : null}
                  <button className={mine?.optionId === p.id ? 'btn primary' : 'btn'} onClick={() => void vote(p.id)} aria-pressed={mine?.optionId === p.id}>{tx(mine?.optionId === p.id ? `Il vostro voto (${n})` : `Voto questa${n ? ` (${n})` : ''}`)}</button>
                  {comments.filter((c) => c.optionId === p.id).map((c, k) => <blockquote key={k} className="vote-comment">«{tx(c.comment)}»{c.name ? <span className="muted"> — {tx(c.name)}</span> : null}</blockquote>)}
                </>
              ) : null)}
            </li>
          );
        })}
      </ul>
      <button className="btn-ghost" onClick={() => { set({ view: 'home' }); history.pushState(null, '', '/'); }}>{tx("Crea il vostro programma")}</button>
    </div>
  );
}
