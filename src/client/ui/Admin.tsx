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
        <h2>Pannello editoriale</h2>
        <p className="hint">Accesso protetto lato server. Il token è impostato con ADMIN_TOKEN (o stampato nel terminale all'avvio in sviluppo).</p>
        <input type="password" placeholder="Token editoriale" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Token editoriale" />
        <button className="btn" onClick={() => void login()}>Entra</button>
        {ok === false ? <div className="notice bad">Token non valido.</div> : null}
      </div>
    );
  }
  return (
    <div className="admin">
      <h2>Pannello editoriale</h2>
      <div className="seg" role="tablist">
        {([['overview', 'Salute dei dati'], ['places', 'Luoghi'], ['events', 'Eventi'], ['reports', 'Segnalazioni'], ['stats', 'Statistiche'], ['audit', 'Registro']] as const).map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v}</button>)}
      </div>
      {tab === 'overview' && <Overview o={overview} headers={headers} reload={() => void login()} />}
      {tab === 'places' && <Places headers={headers} />}
      {tab === 'events' && <Events headers={headers} />}
      {tab === 'reports' && <Reports headers={headers} />}
      {tab === 'stats' && <Stats headers={headers} />}
      {tab === 'audit' && <Audit headers={headers} />}
    </div>
  );
}

function Overview({ o, headers, reload }: { o: any; headers: Record<string, string>; reload: () => void }) {
  if (!o) return <Spinner />;
  const check = async () => { await send('POST', '/api/admin/sources/check', {}, { headers }); reload(); };
  return (
    <div>
      <p>Catalogo <strong>{o.catalogVersion}</strong> (base {o.baseVersion}) · {o.places} luoghi · {o.events} eventi · segnalazioni aperte: {o.reportsOpen}</p>
      <div className="grid3">
        <Dist title="Orari" d={o.hoursStatus} />
        <Dist title="Prezzi" d={o.priceStatus} />
        <Dist title="Accessibilità" d={o.accessStatus} />
      </div>
      <h3>Salute delle fonti <button className="btn-ghost" onClick={() => void check()}>Controlla ora</button></h3>
      <ul>{o.sourceHealth.map((h: any) => <li key={h.source_id}><strong>{h.source_id}</strong>: <Badge kind={h.status === 'ok' || h.status === 'configured' ? 'ok' : h.status === 'error' || h.status === 'expired' ? 'bad' : 'warn'}>{h.status}</Badge> {h.detail} <span className="muted">{new Date(h.checked_at).toLocaleString('it-CH')}</span></li>)}</ul>
      <h3>Integrazioni</h3>
      <ul>{o.integrations.map((i: any) => <li key={i.id}>{i.name}: <Badge kind={i.active ? 'ok' : 'warn'}>{i.status}</Badge></li>)}</ul>
      {o.conflicts?.length ? <><h3>Conflitti da risolvere</h3><ul>{o.conflicts.map((c: any, i: number) => <li key={i}><Badge kind="warn">{c.kind}</Badge> {c.id}: {c.note}</li>)}</ul></> : <p className="muted">Nessun conflitto fra modifiche editoriali e dati di base.</p>}
      {o.stale.length ? <><h3>Dati oltre la scadenza</h3><ul>{o.stale.map((s: any, i: number) => <li key={i}>{s.id}: {s.field}</li>)}</ul></> : <p className="muted">Nessun dato oltre la politica di scadenza delle fonti.</p>}
    </div>
  );
}

function Dist({ title, d }: { title: string; d: Record<string, number> }) {
  return <div className="dist"><h4>{title}</h4><ul>{Object.entries(d).map(([k, v]) => <li key={k}><EvidenceBadge status={k === 'known' ? 'verified' : k} /> {v}</li>)}</ul></div>;
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
      <input type="search" placeholder="Filtra…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtra luoghi" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Luogo</th><th>Orari</th><th>Prezzi</th><th>Access.</th><th></th></tr></thead>
          <tbody>{data.places.filter((p: any) => p.name.toLowerCase().includes(q.toLowerCase())).map((p: any) => (
            <tr key={p.id}><td>{p.name}<br /><span className="muted">{p.id}</span></td><td><EvidenceBadge status={p.schedules[0]?.evidence.status ?? 'unknown'} /></td><td><EvidenceBadge status={p.prices[0]?.status === 'known' ? p.prices[0].evidence.status : p.prices[0]?.status} /></td><td><EvidenceBadge status={p.accessibility.evidence.status} /></td><td><button className="link" onClick={() => open(p)}>modifica</button></td></tr>
          ))}</tbody>
        </table>
      </div>
      {edit ? (
        <div className="admin-edit">
          <h3>{edit.name}</h3>
          <label>Orari (sintassi OSM opening_hours)<input value={form.hoursOsm} onChange={(e) => setForm({ ...form, hoursOsm: e.target.value })} placeholder="Tu-Su 10:00-18:00; Mo off; PH off" /></label>
          <label>Descrizione<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Fonte (URL)<input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} /></label>
          <label>Nota<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={form.verified} onChange={(e) => setForm({ ...form, verified: e.target.checked })} /> Verificato oggi sulla fonte ufficiale</label>
          <div className="row wrap">
            <button className="btn" onClick={() => void save()}>Salva</button>
            <button className="btn-ghost" onClick={() => void verify('hours')}>Verifica orari</button>
            <button className="btn-ghost" onClick={() => void verify('price')}>Verifica prezzi</button>
            <button className="btn-ghost" onClick={() => void verify('accessibility')}>Verifica accessibilità</button>
            <button className="btn-ghost" onClick={() => void hide(true)}>Nascondi</button>
            <button className="btn-ghost" onClick={() => void reset()}>Annulla modifiche</button>
          </div>
          {msg ? <div className="notice">{msg}</div> : null}
        </div>
      ) : null}
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
      <p className="hint">Gli eventi del pilota sono fixture dimostrative. Le eccezioni (annullamenti, esauriti, rinvii) valgono per una singola data.</p>
      <ul>{evs.map((e) => <li key={e.id}><strong>{e.title}</strong> {e.recurrence ? <span className="muted">ogni {e.recurrence.byDay.join(',')} {e.recurrence.from} · {e.recurrence.validFrom}→{e.recurrence.validTo} · eccezioni: {e.recurrence.exceptions.map((x: any) => `${x.date} ${x.status}`).join(', ') || 'nessuna'}</span> : <span className="muted">{e.sessions.length} sessioni</span>}</li>)}</ul>
      <div className="row wrap">
        <select value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} aria-label="Evento ricorrente"><option value="">Evento ricorrente…</option>{evs.filter((e) => e.recurrence).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Data" />
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} aria-label="Stato"><option value="cancelled">annullato</option><option value="sold_out">esaurito</option><option value="postponed">rinviato</option><option value="scheduled">ripristina</option></select>
        <input placeholder="nota" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} aria-label="Nota" />
        <button className="btn" disabled={!form.id || !form.date} onClick={() => void save()}>Registra</button>
      </div>
      {msg ? <div className="notice">{msg}</div> : null}
    </div>
  );
}

function Reports({ headers }: { headers: Record<string, string> }) {
  const [r, setR] = useState<any[] | null>(null);
  const load = () => get<any>('/api/admin/reports', { headers }).then((x) => setR(x.reports));
  useEffect(() => { void load(); }, []);
  if (!r) return <Spinner />;
  if (!r.length) return <p className="muted">Nessuna segnalazione.</p>;
  const resolve = async (id: string, status: string) => { await send('POST', `/api/admin/reports/${id}`, { status, resolution: status }, { headers }); void load(); };
  return <ul className="reports">{r.map((x) => <li key={x.id}><Badge kind={x.status === 'open' ? 'warn' : 'ok'}>{x.status}</Badge> <strong>{x.targetKind}:{x.targetId}</strong> [{x.field}] {x.message} <span className="muted">{new Date(x.createdAt).toLocaleString('it-CH')}</span> {x.status === 'open' ? <><button className="link" onClick={() => void resolve(x.id, 'resolved')}>risolta</button> <button className="link" onClick={() => void resolve(x.id, 'rejected')}>respinta</button></> : null}</li>)}</ul>;
}

function Stats({ headers }: { headers: Record<string, string> }) {
  const [s, setS] = useState<any>(null);
  useEffect(() => { void get<any>('/api/admin/stats', { headers }).then(setS); }, []);
  if (!s) return <Spinner />;
  const totals: Record<string, number> = {};
  for (const r of s.stats) totals[r.key] = (totals[r.key] ?? 0) + r.count;
  return (
    <div>
      <p className="hint">{s.note}</p>
      <div className="table-wrap"><table><thead><tr><th>Indicatore (30 giorni)</th><th>Totale</th></tr></thead><tbody>{Object.entries(totals).sort().map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table></div>
      <h3>Consumi AI</h3>
      <p>Token oggi: {s.aiTokensToday}</p>
      {s.ai.length ? <div className="table-wrap"><table><thead><tr><th>Giorno</th><th>Modello</th><th>Uso</th><th>Esito</th><th>Chiamate</th><th>Input</th><th>Output</th><th>ms medi</th></tr></thead><tbody>{s.ai.map((a: any, i: number) => <tr key={i}><td>{a.day}</td><td>{a.model}</td><td>{a.purpose}</td><td>{a.status}</td><td>{a.calls}</td><td>{a.input ?? 0}</td><td>{a.output ?? 0}</td><td>{Math.round(a.avg_ms)}</td></tr>)}</tbody></table></div> : <p className="muted">Nessuna chiamata AI registrata.</p>}
    </div>
  );
}

function Audit({ headers }: { headers: Record<string, string> }) {
  const [a, setA] = useState<any[] | null>(null);
  useEffect(() => { void get<any>('/api/admin/audit', { headers }).then((r) => setA(r.audit)); }, []);
  if (!a) return <Spinner />;
  return <ul>{a.map((x) => <li key={x.id}><span className="muted">{new Date(x.ts).toLocaleString('it-CH')}</span> {x.action} {x.target} {x.detail ?? ''}</li>)}</ul>;
}
