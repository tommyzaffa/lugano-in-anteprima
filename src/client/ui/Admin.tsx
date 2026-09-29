import { tx, getLocale } from '../locale.ts';
import { useEffect, useState } from 'react';
import { get, send, ApiError } from '../api.ts';
import { Badge, EvidenceBadge, Spinner } from './common.tsx';

function tokenGet() { try { return sessionStorage.getItem('lia.admin') ?? ''; } catch { return ''; } }
function tokenSet(t: string) { try { sessionStorage.setItem('lia.admin', t); } catch { /* */ } }

export default function Admin() {
  const [token, setToken] = useState(tokenGet());
  const [ok, setOk] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'overview' | 'places' | 'events' | 'reports' | 'stats' | 'audit'>('overview');
  const headers = { Authorization: `Bearer ${token}` };
  const [overview, setOverview] = useState<any>(null);
  const login = async (t = token) => {
    try { setOverview(await get<any>('/api/admin/overview', { headers: { Authorization: `Bearer ${t}` } })); setOk(true); tokenSet(t); }
    catch { setOk(false); }
  };
  useEffect(() => { if (token) void login(); }, []);
  if (!ok) {
    return (
      <div className="admin">
        <h2>{tx("Pannello editoriale")}</h2>
        <p className="hint">{tx("Accesso protetto lato server. Il token è impostato con ADMIN_TOKEN (o stampato nel terminale all'avvio in sviluppo).")}</p>
        <input type="password" placeholder={tx("Token editoriale")} value={token} onChange={(e) => setToken(e.target.value)} aria-label={tx("Token editoriale")} />
        <button className="btn" onClick={() => void login()}>{tx("Entra")}</button>
        {ok === false ? <div className="notice bad">{tx("Token non valido.")}</div> : null}
      </div>
    );
  }
  return (
    <div className="admin">
      <h2>{tx("Pannello editoriale")}</h2>
      <div className="seg" role="tablist">
        {([['overview', 'Salute dei dati'], ['places', 'Luoghi'], ['events', 'Eventi'], ['reports', 'Segnalazioni'], ['stats', 'Statistiche'], ['audit', 'Registro']] as const).map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{tx(v)}</button>)}
      </div>
      {tx(tab === 'overview' && <Overview o={overview} headers={headers} reload={() => void login()} />)}
      {tx(tab === 'places' && <Places headers={headers} />)}
      {tx(tab === 'events' && <Events headers={headers} />)}
      {tx(tab === 'reports' && <Reports headers={headers} />)}
      {tx(tab === 'stats' && <Stats headers={headers} />)}
      {tx(tab === 'audit' && <Audit headers={headers} />)}
    </div>
  );
}

function Overview({ o, headers, reload }: { o: any; headers: Record<string, string>; reload: () => void }) {
  if (!o) return <Spinner />;
  const check = async () => { await send('POST', '/api/admin/sources/check', {}, { headers }); reload(); };
  return (
    <div>
      <p>{tx("Catalogo ")}<strong>{tx(o.catalogVersion)}</strong>{tx(" (base ")}{tx(o.baseVersion)}) · {tx(o.places)}{tx(" luoghi · ")}{tx(o.events)}{tx(" eventi · segnalazioni aperte: ")}{tx(o.reportsOpen)}</p>
      <div className="grid3">
        <Dist title={tx("Orari")} d={o.hoursStatus} />
        <Dist title={tx("Prezzi")} d={o.priceStatus} />
        <Dist title={tx("Accessibilità")} d={o.accessStatus} />
      </div>
      <h3>{tx("Salute delle fonti ")}<button className="btn-ghost" onClick={() => void check()}>{tx("Controlla ora")}</button></h3>
      <ul>{o.sourceHealth.map((h: any) => <li key={h.source_id}><strong>{tx(h.source_id)}</strong>: <Badge kind={h.status === 'ok' || h.status === 'configured' ? 'ok' : h.status === 'error' || h.status === 'expired' ? 'bad' : 'warn'}>{tx(h.status)}</Badge> {tx(h.detail)} <span className="muted">{tx(new Date(h.checked_at).toLocaleString(getLocale()))}</span></li>)}</ul>
      <h3>{tx("Integrazioni")}</h3>
      <ul>{o.integrations.map((i: any) => <li key={i.id}>{tx(i.name)}: <Badge kind={i.active ? 'ok' : 'warn'}>{tx(i.status)}</Badge></li>)}</ul>
      {o.conflicts?.length ? <><h3>{tx("Conflitti da risolvere")}</h3><ul>{o.conflicts.map((c: any, i: number) => <li key={i}><Badge kind="warn">{tx(c.kind)}</Badge> {tx(c.id)}: {tx(c.note)}</li>)}</ul></> : <p className="muted">{tx("Nessun conflitto fra modifiche editoriali e dati di base.")}</p>}
      {o.stale.length ? <><h3>{tx("Dati oltre la scadenza")}</h3><ul>{o.stale.map((s: any, i: number) => <li key={i}>{tx(s.id)}: {tx(s.field)}</li>)}</ul></> : <p className="muted">{tx("Nessun dato oltre la politica di scadenza delle fonti.")}</p>}
    </div>
  );
}

function Dist({ title, d }: { title: string; d: Record<string, number> }) {
  return <div className="dist"><h4>{tx(title)}</h4><ul>{Object.entries(d).map(([k, v]) => <li key={k}><EvidenceBadge status={k === 'known' ? 'verified' : k} /> {tx(v)}</li>)}</ul></div>;
}

function Places({ headers }: { headers: Record<string, string> }) {
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ hoursOsm: '', note: '', sourceUrl: '', verified: false, description: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => get<any>('/api/admin/places', { headers }).then(setData);
  useEffect(() => { void load(); }, []);
  if (!data) return <Spinner />;
  const open = (p: any) => { setEdit(p); setMsg(null); setForm({ hoursOsm: p.schedules[0]?.osmOpeningHours ?? '', note: '', sourceUrl: p.links?.website ?? '', verified: false, description: p.description }); };
  const save = async () => {
    try { await send('PUT', `/api/admin/places/${edit.id}`, { hoursOsm: form.hoursOsm, note: form.note, sourceUrl: form.sourceUrl, verified: form.verified, description: form.description }, { headers }); setMsg('Salvato: il catalogo pubblicato è aggiornato.'); void load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Errore'); }
  };
  const verify = async (field: string) => { await send('POST', `/api/admin/places/${edit.id}/verify`, { field, sourceUrl: form.sourceUrl, note: form.note }, { headers }); setMsg(`Campo «${field}» marcato come verificato oggi.`); void load(); };
  const hide = async (hidden: boolean) => { await send('PUT', `/api/admin/places/${edit.id}`, { hidden, note: hidden ? 'nascosto' : 'ripristinato' }, { headers }); setMsg(hidden ? 'Luogo nascosto dal catalogo.' : 'Ripristinato.'); void load(); };
  const reset = async () => { await send('DELETE', `/api/admin/places/${edit.id}/override`, null, { headers }); setMsg('Modifiche editoriali rimosse.'); void load(); };
  return (
    <div className="admin-places">
      <input type="search" placeholder={tx("Filtra…")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tx("Filtra luoghi")} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>{tx("Luogo")}</th><th>{tx("Orari")}</th><th>{tx("Prezzi")}</th><th>{tx("Access.")}</th><th></th></tr></thead>
          <tbody>{data.places.filter((p: any) => p.name.toLowerCase().includes(q.toLowerCase())).map((p: any) => (
            <tr key={p.id}><td>{tx(p.name)}<br /><span className="muted">{tx(p.id)}</span></td><td><EvidenceBadge status={p.schedules[0]?.evidence.status ?? 'unknown'} /></td><td><EvidenceBadge status={p.prices[0]?.status === 'known' ? p.prices[0].evidence.status : p.prices[0]?.status} /></td><td><EvidenceBadge status={p.accessibility.evidence.status} /></td><td><button className="link" onClick={() => open(p)}>{tx("modifica")}</button></td></tr>
          ))}</tbody>
        </table>
      </div>
      {tx(edit ? (
        <div className="admin-edit">
          <h3>{tx(edit.name)}</h3>
          <label>{tx("Orari (sintassi OSM opening_hours)")}<input value={form.hoursOsm} onChange={(e) => setForm({ ...form, hoursOsm: e.target.value })} placeholder={tx("Tu-Su 10:00-18:00; Mo off; PH off")} /></label>
          <label>{tx("Descrizione")}<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>{tx("Fonte (URL)")}<input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} /></label>
          <label>{tx("Nota")}<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={form.verified} onChange={(e) => setForm({ ...form, verified: e.target.checked })} />{tx(" Verificato oggi sulla fonte ufficiale")}</label>
          <div className="row wrap">
            <button className="btn" onClick={() => void save()}>{tx("Salva")}</button>
            <button className="btn-ghost" onClick={() => void verify('hours')}>{tx("Verifica orari")}</button>
            <button className="btn-ghost" onClick={() => void verify('price')}>{tx("Verifica prezzi")}</button>
            <button className="btn-ghost" onClick={() => void verify('accessibility')}>{tx("Verifica accessibilità")}</button>
            <button className="btn-ghost" onClick={() => void hide(true)}>{tx("Nascondi")}</button>
            <button className="btn-ghost" onClick={() => void reset()}>{tx("Annulla modifiche")}</button>
          </div>
          {msg ? <div className="notice">{tx(msg)}</div> : null}
        </div>
      ) : null)}
    </div>
  );
}

function Events({ headers }: { headers: Record<string, string> }) {
  const [evs, setEvs] = useState<any[] | null>(null);
  const [form, setForm] = useState({ id: '', date: '', status: 'cancelled', note: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => get<any>('/api/admin/events', { headers }).then((r) => setEvs(r.events));
  useEffect(() => { void load(); }, []);
  if (!evs) return <Spinner />;
  const save = async () => { try { await send('POST', `/api/admin/events/${form.id}/exception`, { date: form.date, status: form.status, note: form.note }, { headers }); setMsg('Eccezione registrata.'); void load(); } catch (e) { setMsg((e as Error).message); } };
  return (
    <div>
      <p className="hint">{tx("Gli eventi del pilota sono fixture dimostrative. Le eccezioni (annullamenti, esauriti, rinvii) valgono per una singola data.")}</p>
      <ul>{evs.map((e) => <li key={e.id}><strong>{tx(e.title)}</strong> {e.recurrence ? <span className="muted">{tx("ogni ")}{tx(e.recurrence.byDay.join(','))} {tx(e.recurrence.from)} · {tx(e.recurrence.validFrom)}→{tx(e.recurrence.validTo)}{tx(" · eccezioni: ")}{tx(e.recurrence.exceptions.map((x: any) => `${x.date} ${x.status}`).join(', ') || 'nessuna')}</span> : <span className="muted">{tx(e.sessions.length)}{tx(" sessioni")}</span>}</li>)}</ul>
      <div className="row wrap">
        <select value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} aria-label={tx("Evento ricorrente")}><option value="">{tx("Evento ricorrente…")}</option>{evs.filter((e) => e.recurrence).map((e) => <option key={e.id} value={e.id}>{tx(e.title)}</option>)}</select>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label={tx("Data")} />
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} aria-label={tx("Stato")}><option value="cancelled">{tx("annullato")}</option><option value="sold_out">{tx("esaurito")}</option><option value="postponed">{tx("rinviato")}</option><option value="scheduled">{tx("ripristina")}</option></select>
        <input placeholder={tx("nota")} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} aria-label={tx("Nota")} />
        <button className="btn" disabled={!form.id || !form.date} onClick={() => void save()}>{tx("Registra")}</button>
      </div>
      {msg ? <div className="notice">{tx(msg)}</div> : null}
    </div>
  );
}

function Reports({ headers }: { headers: Record<string, string> }) {
  const [r, setR] = useState<any[] | null>(null);
  const load = () => get<any>('/api/admin/reports', { headers }).then((x) => setR(x.reports));
  useEffect(() => { void load(); }, []);
  if (!r) return <Spinner />;
  if (!r.length) return <p className="muted">{tx("Nessuna segnalazione.")}</p>;
  const resolve = async (id: string, status: string) => { await send('POST', `/api/admin/reports/${id}`, { status, resolution: status }, { headers }); void load(); };
  return <ul className="reports">{r.map((x) => <li key={x.id}><Badge kind={x.status === 'open' ? 'warn' : 'ok'}>{tx(x.status)}</Badge> <strong>{tx(x.targetKind)}:{tx(x.targetId)}</strong> [{tx(x.field)}] {tx(x.message)} <span className="muted">{tx(new Date(x.createdAt).toLocaleString(getLocale()))}</span> {x.status === 'open' ? <><button className="link" onClick={() => void resolve(x.id, 'resolved')}>{tx("risolta")}</button> <button className="link" onClick={() => void resolve(x.id, 'rejected')}>{tx("respinta")}</button></> : null}</li>)}</ul>;
}

const STAT_LABEL: Record<string, string> = {
  plan_requested: 'Pianificazioni richieste', plan_ok: 'Pianificazioni con proposte', plan_infeasible: 'Pianificazioni impossibili', plan_needs_resolution: 'Contraddizioni da risolvere', plan_timeout: 'Pianificazioni interrotte per tempo', plan_error: 'Errori di pianificazione', plan_aborted: 'Pianificazioni annullate',
  plan_saved: 'Programmi salvati', plan_shared: 'Link di condivisione creati', share_revoked: 'Link revocati', vote: 'Voti ricevuti',
  sim_started: 'Simulazioni avviate', sim_finished: 'Simulazioni concluse', sim_skip: 'Spostamenti saltati', sim_decision: 'Decisioni prese', sim_checkpoint: 'Salti a un checkpoint',
  replan_requested: 'Ricalcoli richiesti', whatif_requested: 'Ipotesi «E se…» richieste', branch_created: 'Rami creati', whatif: 'Rami ipotetici creati',
  export_ics: 'Esportazioni calendario', print: 'Stampe', postcard: 'Cartoline', offline_saved: 'Salvati per l\'uso offline', planb: 'Piani B meteo preparati',
  explore_opened: 'Esplorazioni libere', list_view: 'Vista elenco attivata', reduced_motion: 'Movimento ridotto attivato', webgl_fallback: 'Vista senza WebGL',
  geolocation_used: 'Posizione usata (su richiesta)', surprise: '«Sorprendimi»', report_submitted: 'Segnalazioni di errore',
};

const INFEASIBLE: Record<string, string> = { must_see: 'tappa obbligatoria non possibile', window_short: 'finestra troppo breve', budget: 'budget', validation: 'nessuna combinazione valida', no_candidates: 'nessuna attività compatibile', combination: 'combinazione di vincoli', locked: 'tappa bloccata non inseribile' };
function statLabel(k: string): string {
  if (STAT_LABEL[k]) return STAT_LABEL[k];
  if (k.startsWith('infeasible_')) return `Impossibile: ${INFEASIBLE[k.slice(11)] ?? k.slice(11).replace(/_/g, ' ')}`;
  return k;
}

/** Imbuto d'uso del pilota (solo conteggi aggregati, nessun percorso individuale). */
function Funnel({ totals }: { totals: Record<string, number> }) {
  const steps: [string, string][] = [['plan_requested', 'Pianificazioni richieste'], ['plan_ok', 'Con proposte'], ['sim_started', 'Simulazioni avviate'], ['sim_finished', 'Simulazioni concluse'], ['plan_saved', 'Programmi salvati'], ['plan_shared', 'Condivisi']];
  const first = totals[steps[0][0]] ?? 0;
  if (!first) return <p className="muted">{tx("Imbuto d'uso: ancora nessuna pianificazione registrata.")}</p>;
  return (
    <div className="funnel" aria-label={tx("Imbuto d'uso")}>
      <h3>{tx("Imbuto d'uso (30 giorni)")}</h3>
      {steps.map(([k, label]) => {
        const n = totals[k] ?? 0;
        const pct = Math.round((n / first) * 100);
        return <div key={k} className="funnel-row"><span className="funnel-label">{tx(label)}</span><span className="funnel-bar"><span style={{ width: `${Math.min(100, pct)}%` }} /></span><span className="funnel-n">{tx(n)} <span className="muted">({tx(pct)}%)</span></span></div>;
      })}
      <p className="hint">{tx("Conteggi aggregati per giorno: non collegano fra loro le azioni di una stessa persona, quindi le percentuali sono indicative.")}</p>
    </div>
  );
}

function Stats({ headers }: { headers: Record<string, string> }) {
  const [s, setS] = useState<any>(null);
  useEffect(() => { void get<any>('/api/admin/stats', { headers }).then(setS); }, []);
  if (!s) return <Spinner />;
  const totals: Record<string, number> = {};
  for (const r of s.stats) totals[r.key] = (totals[r.key] ?? 0) + r.count;
  return (
    <div>
      <p className="hint">{tx(s.note)}</p>
      <Funnel totals={totals} />
      <div className="table-wrap"><table><thead><tr><th>{tx("Indicatore (30 giorni)")}</th><th>{tx("Totale")}</th></tr></thead><tbody>{Object.entries(totals).sort().map(([k, v]) => <tr key={k}><td>{tx(statLabel(k))} <span className="muted">{tx(k)}</span></td><td>{tx(v)}</td></tr>)}</tbody></table></div>
      <h3>{tx("Consumi AI")}</h3>
      <p>{tx("Token oggi: ")}{tx(s.aiTokensToday)}</p>
      {s.ai.length ? <div className="table-wrap"><table><thead><tr><th>{tx("Giorno")}</th><th>{tx("Modello")}</th><th>{tx("Uso")}</th><th>{tx("Esito")}</th><th>{tx("Chiamate")}</th><th>{tx("Input")}</th><th>{tx("Output")}</th><th>{tx("ms medi")}</th></tr></thead><tbody>{s.ai.map((a: any, i: number) => <tr key={i}><td>{tx(a.day)}</td><td>{tx(a.model)}</td><td>{tx(a.purpose)}</td><td>{tx(a.status)}</td><td>{tx(a.calls)}</td><td>{tx(a.input ?? 0)}</td><td>{tx(a.output ?? 0)}</td><td>{tx(Math.round(a.avg_ms))}</td></tr>)}</tbody></table></div> : <p className="muted">{tx("Nessuna chiamata AI registrata.")}</p>}
    </div>
  );
}

function Audit({ headers }: { headers: Record<string, string> }) {
  const [a, setA] = useState<any[] | null>(null);
  useEffect(() => { void get<any>('/api/admin/audit', { headers }).then((r) => setA(r.audit)); }, []);
  if (!a) return <Spinner />;
  return <ul>{a.map((x) => <li key={x.id}><span className="muted">{tx(new Date(x.ts).toLocaleString(getLocale()))}</span> {tx(x.action)} {tx(x.target)} {tx(x.detail ?? '')}</li>)}</ul>;
}
