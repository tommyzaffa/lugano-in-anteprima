import { useEffect, useState } from 'react';
import { useApp } from '../store.ts';
import { get, send } from '../api.ts';
import { Badge, EvidenceBadge, Modal, Spinner, SourceLink, closureRanges } from './common.tsx';

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('it-CH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
import { CATEGORY } from '../i18n.ts';
import { fmtRange } from '../../shared/pricing.ts';
import { hhmm } from '../../shared/time.ts';
import { getMap } from '../map/MapView.tsx';
import { usePersonal } from '../personal.ts';

export default function PlaceCard() {
  const id = useApp((s) => s.placeCard);
  const set = useApp((s) => s.set);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  const { favs, visited, toggleFav, toggleVisited } = usePersonal();
  useEffect(() => {
    if (!id) return;
    setData(null); setErr(null);
    const date = useApp.getState().draft?.date;
    get<any>(`/api/places/${id}${date ? `?date=${date}` : ''}`).then((d) => {
      setData(d);
      const map = getMap();
      if (map && useApp.getState().view !== 'sim') map.easeTo({ center: [d.place.lon, d.place.lat], zoom: Math.max(map.getZoom(), 15), duration: useApp.getState().settings.reducedMotion ? 0 : 700 });
    }).catch((e) => setErr(e.message));
  }, [id]);
  if (!id) return null;
  const close = () => set({ placeCard: null });
  const p = data?.place;
  const week = data?.week ?? [];
  return (
    <aside className="place-card" aria-label="Scheda del luogo">
      <button className="icon-btn close" onClick={close} aria-label="Chiudi scheda">✕</button>
      {err ? <div className="notice bad">{err}</div> : !p ? <Spinner /> : (
        <>
          <h2>{p.name}</h2>
          <div className="muted">{CATEGORY[p.category] ?? p.category}{p.area ? ` · ${p.area}` : ''}{p.municipality.country === 'IT' ? ' · Italia' : ''}</div>
          {p.description ? <p>{p.description}</p> : null}
          <div className="today">{p.schedules.length && week[0] ? <>🕑 {new Date(`${week[0].date}T12:00:00Z`).toLocaleDateString('it-CH', { weekday: 'long', timeZone: 'UTC' })}: {week[0].schedules.map((s: any) => s.text).join(' · ')}</> : <span className="muted">Orari non disponibili: da verificare</span>}</div>
          {p.mountain ? (
            <div className="notice info">
              <strong>Montagna{p.mountain.elevation ? ` · ${p.mountain.elevation} m` : ''}</strong>
              <ul>{p.mountain.access.map((a: string) => <li key={a}>{a}</li>)}</ul>
              {p.mountain.returnNote ? <div>{p.mountain.returnNote}</div> : null}
            </div>
          ) : null}
          {closureRanges(p.schedules[0]?.exceptions ?? [], new Date().toISOString().slice(0, 10)).map((c) => (
            <div key={c.from} className="notice warn">Chiuso {c.from === c.to ? `il ${fmtDay(c.from)}` : `dal ${fmtDay(c.from)} al ${fmtDay(c.to)}`}: {c.note}</div>
          ))}
          <div className="pc-actions">
            <button className="btn-ghost" onClick={() => { useApp.getState().setDraft((d) => ({ ...d, mustSee: [...new Set([...d.mustSee, p.id])] })); useApp.getState().notify(`${p.name}: da non perdere nella prossima giornata.`, 'ok'); }}>Da non perdere</button>
            <button className="btn-ghost" aria-pressed={favs.includes(p.id)} onClick={() => toggleFav(p.id)} aria-label="Preferito">{favs.includes(p.id) ? '★' : '☆'}</button>
            <button className="btn-ghost" aria-pressed={visited.includes(p.id)} onClick={() => toggleVisited(p.id)}>{visited.includes(p.id) ? '✓ Visitato' : 'Già visitato'}</button>
            {p.links.website ? <a className="btn-ghost" href={p.links.website} target="_blank" rel="noopener noreferrer">Sito</a> : null}
          </div>
          {data.events.length ? (
            <details className="more" open>
              <summary>Eventi qui <span className="muted">· {data.events.length}</span></summary>
              <ul>{data.events.slice(0, 6).map((o: any) => <li key={o.sessionId}>{o.start.slice(8, 10)}/{o.start.slice(5, 7)} {hhmm(o.start)} {o.title} {o.status !== 'scheduled' ? <Badge kind="bad">{({ cancelled: 'annullato', sold_out: 'esaurito', postponed: 'rinviato' } as any)[o.status]}</Badge> : null}</li>)}</ul>
            </details>
          ) : null}
          {p.schedules.length ? (
            <details className="more">
              <summary>Orari della settimana</summary>
              <table className="hours"><tbody>{week.map((w: any) => <tr key={w.date}><th scope="row">{new Date(`${w.date}T12:00:00Z`).toLocaleDateString('it-CH', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' })}</th><td>{w.schedules.map((s: any) => s.text).join(' · ')}</td></tr>)}</tbody></table>
              <div className="muted small">Fonte: <EvidenceBadge status={p.schedules[0].evidence.status} /> {p.schedules[0].evidence.note ?? ''}<SourceLink evidence={p.schedules[0].evidence} /></div>
            </details>
          ) : null}
          <details className="more">
            <summary>Prezzi</summary>
            <ul className="prices">{p.prices.map((x: any) => <li key={x.id}>{x.label}: {x.status === 'unknown' ? 'sconosciuto' : x.unit === 'free' ? 'gratuito' : `${fmtRange(x.min ?? null, x.max ?? null)}${x.unit === 'person' ? ' a persona' : ' per gruppo'}`} <EvidenceBadge status={x.status === 'known' ? x.evidence.status : x.status} /><SourceLink evidence={x.evidence} /></li>)}</ul>
          </details>
          <details className="more">
            <summary>Accessibilità</summary>
            <div>Sedia a rotelle: {label3(p.accessibility.wheelchair)} · Passeggino: {label3(p.accessibility.stroller)} · Scale: {({ none: 'nessuna', some: 'alcune', many: 'molte', unknown: 'non note' } as any)[p.accessibility.stairs]} <EvidenceBadge status={p.accessibility.evidence.status} /></div>
            {p.accessibility.note ? <div className="muted">{p.accessibility.note}</div> : null}
          </details>
          <details className="more">
            <summary>Come arrivare</summary>
            <ul>{p.nearestStops.map((s: any) => <li key={s.id}>{s.name} · {s.distanceM} m · {s.modes.join(', ')}</li>)}</ul>
          </details>
          <div className="muted small" style={{ marginTop: '.6rem' }}>
            Fonti: {data.sources.map((s: any) => s.name).join(' · ')} · <a href={`https://www.openstreetmap.org/${p.osm?.[0] === 'n' ? 'node' : p.osm?.[0] === 'w' ? 'way' : 'relation'}/${p.osm?.slice(1)}`} target="_blank" rel="noopener noreferrer">OpenStreetMap</a> · <button className="link" onClick={() => setReport(true)}>Segnala un errore</button>
          </div>
          {report ? <ReportDialog targetId={p.id} onClose={() => setReport(false)} /> : null}
        </>
      )}
    </aside>
  );
}

function label3(v: string) { return ({ yes: 'sì', limited: 'limitata', no: 'no', unknown: 'non verificata' } as any)[v] ?? v; }

export function ReportDialog({ targetId, onClose, kind = 'place' }: { targetId: string; onClose: () => void; kind?: string }) {
  const [field, setField] = useState('hours');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const submit = async () => {
    try { const r = await send<{ message: string }>('POST', '/api/reports', { targetKind: kind, targetId, field, message: msg }); setDone(r.message); }
    catch (e) { setDone((e as Error).message); }
  };
  return (
    <Modal title="Segnala un errore nei dati" onClose={onClose}>
      {done ? <p>{done}</p> : (
        <>
          <label>Che cosa non va?
            <select value={field} onChange={(e) => setField(e.target.value)}>
              <option value="hours">Orari</option><option value="price">Prezzi</option><option value="location">Posizione</option><option value="accessibility">Accessibilità</option><option value="event">Evento</option><option value="description">Descrizione</option><option value="other">Altro</option>
            </select>
          </label>
          <label>Dettagli<textarea rows={4} maxLength={1500} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Es. «il museo ora chiude alle 17:00, vedi sito ufficiale»" /></label>
          <p className="hint">La segnalazione va alla redazione e non modifica i dati finché non è verificata. Non inserite dati personali.</p>
          <button className="btn primary" disabled={msg.trim().length < 5} onClick={() => void submit()}>Invia</button>
        </>
      )}
    </Modal>
  );
}
