import { tx, getLocale } from '../locale.ts';
import { safeUrl } from '../safe-url.ts';
import { useEffect, useState } from 'react';
import { useApp } from '../store.ts';
import { get, send } from '../api.ts';
import { Badge, EvidenceBadge, Modal, Spinner, SourceLink, closureRanges } from './common.tsx';

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(getLocale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
import { CATEGORY } from '../i18n.ts';
import { fmtRange } from '../../shared/pricing.ts';
import { hhmm } from '../../shared/time.ts';
import { getMap } from '../map/map-state.ts';
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
    <aside className="place-card" aria-label={tx("Scheda del luogo")}>
      <button className="icon-btn close" onClick={close} aria-label={tx("Chiudi scheda")}>✕</button>
      {err ? <div className="notice bad">{tx(err)}</div> : !p ? <Spinner /> : (
        <>
          <h2>{tx(p.name)}</h2>
          <div className="muted">{tx(CATEGORY[p.category] ?? p.category)}{tx(p.area ? ` · ${p.area}` : '')}{tx(p.municipality.country === 'IT' ? ' · Italia' : '')}</div>
          {p.description ? <p>{tx(p.description)}</p> : null}
            {getLocale() !== 'it' && <p className="hint">{tx("Descrizioni e titoli delle fonti restano nella lingua originale.")}</p>}
          <div className="today">{p.schedules.length && week[0] ? <>🕑 {tx(new Date(`${week[0].date}T12:00:00Z`).toLocaleDateString(getLocale(), { weekday: 'long', timeZone: 'UTC' }))}: {tx(week[0].schedules.map((s: any) => s.text).join(' · '))}</> : <span className="muted">{tx("Orari non disponibili: da verificare")}</span>}</div>
          {tx(p.mountain ? (
            <div className="notice info">
              <strong>{tx("Montagna")}{tx(p.mountain.elevation ? ` · ${p.mountain.elevation} m` : '')}</strong>
              <ul>{p.mountain.access.map((a: string) => <li key={a}>{tx(a)}</li>)}</ul>
              {p.mountain.returnNote ? <div>{tx(p.mountain.returnNote)}</div> : null}
            </div>
          ) : null)}
          {closureRanges(p.schedules[0]?.exceptions ?? [], new Date().toISOString().slice(0, 10)).map((c) => (
            <div key={c.from} className="notice warn">{tx("Chiuso ")}{tx(c.from === c.to ? `il ${fmtDay(c.from)}` : `dal ${fmtDay(c.from)} al ${fmtDay(c.to)}`)}: {tx(c.note)}</div>
          ))}
          <div className="pc-actions">
            <button className="btn-ghost" onClick={() => { useApp.getState().setDraft((d) => ({ ...d, mustSee: [...new Set([...d.mustSee, p.id])] })); useApp.getState().notify(`${p.name}: da non perdere nella prossima giornata.`, 'ok'); }}>{tx("Da non perdere")}</button>
            <button className="btn-ghost" aria-pressed={favs.includes(p.id)} onClick={() => toggleFav(p.id)} aria-label={tx("Preferito")}>{tx(favs.includes(p.id) ? '★' : '☆')}</button>
            <button className="btn-ghost" aria-pressed={visited.includes(p.id)} onClick={() => toggleVisited(p.id)}>{tx(visited.includes(p.id) ? '✓ Visitato' : 'Già visitato')}</button>
            {p.links.website ? <a className="btn-ghost" href={safeUrl(p.links.website)} target="_blank" rel="noopener noreferrer">{tx("Sito")}</a> : null}
          </div>
          {tx(data.events.length ? (
            <details className="more" open>
              <summary>{tx("Eventi qui ")}<span className="muted">· {tx(data.events.length)}</span></summary>
              <ul>{data.events.slice(0, 6).map((o: any) => <li key={o.sessionId}>{tx(o.start.slice(8, 10))}/{tx(o.start.slice(5, 7))} {tx(hhmm(o.start))} {tx(o.title)} {o.status !== 'scheduled' ? <Badge kind="bad">{tx(({ cancelled: 'annullato', sold_out: 'esaurito', postponed: 'rinviato' } as any)[o.status])}</Badge> : null}</li>)}</ul>
            </details>
          ) : null)}
          {tx(p.schedules.length ? (
            <details className="more">
              <summary>{tx("Orari della settimana")}</summary>
              <table className="hours"><tbody>{week.map((w: any) => <tr key={w.date}><th scope="row">{tx(new Date(`${w.date}T12:00:00Z`).toLocaleDateString(getLocale(), { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' }))}</th><td>{tx(w.schedules.map((s: any) => s.text).join(' · '))}</td></tr>)}</tbody></table>
              <div className="muted small">{tx("Fonte: ")}<EvidenceBadge status={p.schedules[0].evidence.status} /> {tx(p.schedules[0].evidence.note ?? '')}<SourceLink evidence={p.schedules[0].evidence} /></div>
            </details>
          ) : null)}
          <details className="more">
            <summary>{tx("Prezzi")}</summary>
            <ul className="prices">{p.prices.map((x: any) => <li key={x.id}>{tx(x.label)}: {tx(x.status === 'unknown' ? 'sconosciuto' : x.unit === 'free' ? 'gratuito' : `${fmtRange(x.min ?? null, x.max ?? null)}${x.unit === 'person' ? ' a persona' : ' per gruppo'}`)} <EvidenceBadge status={x.status === 'known' ? x.evidence.status : x.status} /><SourceLink evidence={x.evidence} /></li>)}</ul>
          </details>
          <details className="more">
            <summary>{tx("Accessibilità")}</summary>
            <div>{tx("Sedia a rotelle: ")}{tx(label3(p.accessibility.wheelchair))}{tx(" · Passeggino: ")}{tx(label3(p.accessibility.stroller))}{tx(" · Scale: ")}{tx(({ none: 'nessuna', some: 'alcune', many: 'molte', unknown: 'non note' } as any)[p.accessibility.stairs])} <EvidenceBadge status={p.accessibility.evidence.status} /></div>
            {p.accessibility.note ? <div className="muted">{tx(p.accessibility.note)}</div> : null}
          </details>
          <details className="more">
            <summary>{tx("Come arrivare")}</summary>
            <ul>{p.nearestStops.map((s: any) => <li key={s.id}>{tx(s.name)} · {tx(s.distanceM)}{tx(" m · ")}{tx(s.modes.join(', '))}</li>)}</ul>
          </details>
          <div className="muted small" style={{ marginTop: '.6rem' }}>{tx("Fonti: ")}{tx(data.sources.map((s: any) => s.name).join(' · '))} · <a href={`https://www.openstreetmap.org/${p.osm?.[0] === 'n' ? 'node' : p.osm?.[0] === 'w' ? 'way' : 'relation'}/${p.osm?.slice(1)}`} target="_blank" rel="noopener noreferrer">{tx("OpenStreetMap")}</a> · <button className="link" onClick={() => setReport(true)}>{tx("Segnala un errore")}</button>
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
    <Modal title={tx("Segnala un errore nei dati")} onClose={onClose}>
      {done ? <p>{tx(done)}</p> : (
        <>
          <label>{tx("Che cosa non va?")}<select value={field} onChange={(e) => setField(e.target.value)}>
              <option value="hours">{tx("Orari")}</option><option value="price">{tx("Prezzi")}</option><option value="location">{tx("Posizione")}</option><option value="accessibility">{tx("Accessibilità")}</option><option value="event">{tx("Evento")}</option><option value="description">{tx("Descrizione")}</option><option value="other">{tx("Altro")}</option>
            </select>
          </label>
          <label>{tx("Dettagli")}<textarea rows={4} maxLength={1500} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={tx("Es. «il museo ora chiude alle 17:00, vedi sito ufficiale»")} /></label>
          <p className="hint">{tx("La segnalazione va alla redazione e non modifica i dati finché non è verificata. Non inserite dati personali.")}</p>
          <button className="btn primary" disabled={msg.trim().length < 5} onClick={() => void submit()}>{tx("Invia")}</button>
        </>
      )}
    </Modal>
  );
}
