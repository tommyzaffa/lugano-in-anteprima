import { useEffect, useState } from 'react';
import { useApp } from '../store.ts';
import { get, send } from '../api.ts';
import { Badge, EvidenceBadge, Modal, Spinner } from './common.tsx';
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
    get<any>(`/api/places/${id}?date=${useApp.getState().draft?.date ?? ''}`).then((d) => {
      setData(d);
      const map = getMap();
      if (map && useApp.getState().view !== 'sim') map.easeTo({ center: [d.place.lon, d.place.lat], zoom: Math.max(map.getZoom(), 15), duration: useApp.getState().settings.reducedMotion ? 0 : 700 });
    }).catch((e) => setErr(e.message));
  }, [id]);
  if (!id) return null;
  const close = () => set({ placeCard: null });
  const p = data?.place;
  return (
    <aside className="place-card" aria-label="Scheda del luogo">
      <button className="icon-btn close" onClick={close} aria-label="Chiudi scheda">✕</button>
      {err ? <div className="notice bad">{err}</div> : !p ? <Spinner /> : (
        <>
          <h2>{p.name}</h2>
          <div className="muted">{CATEGORY[p.category] ?? p.category} · {p.area ?? ''} · Comune di {p.municipality.name} ({p.municipality.country === 'IT' ? 'Italia' : 'Svizzera'})</div>
          <p>{p.description}</p>
          {p.mountain ? (
            <div className="notice info">
              <strong>Montagna{p.mountain.elevation ? ` · ${p.mountain.elevation} m` : ''}</strong>
              <ul>{p.mountain.access.map((a: string) => <li key={a}>{a}</li>)}</ul>
              {p.mountain.returnNote ? <div>{p.mountain.returnNote}</div> : null}
              {!p.mountain.conditionsVerified && p.mountain.kind === 'hike' ? <div><Badge kind="warn">condizioni del sentiero non verificate</Badge></div> : null}
            </div>
          ) : null}
          <h3>Orari (prossimi 7 giorni)</h3>
          {p.schedules.length ? (
            <>
              <table className="hours"><tbody>{data.week.map((w: any) => <tr key={w.date}><th scope="row">{w.date.slice(5)}</th><td>{w.schedules.map((s: any) => s.text).join(' · ')}</td></tr>)}</tbody></table>
              <div className="muted">Fonte: <EvidenceBadge status={p.schedules[0].evidence.status} /> {p.schedules[0].evidence.note ?? ''}</div>
            </>
          ) : <div><Badge kind="bad">orari non disponibili</Badge> <span className="muted">Da verificare sul posto o sul sito ufficiale.</span></div>}
          <h3>Prezzi</h3>
          <ul className="prices">{p.prices.map((x: any) => <li key={x.id}>{x.label}: {x.status === 'unknown' ? 'sconosciuto' : x.unit === 'free' ? 'gratuito' : `${fmtRange(x.min ?? null, x.max ?? null)}${x.unit === 'person' ? ' a persona' : ' per gruppo'}`} <EvidenceBadge status={x.status === 'known' ? x.evidence.status : x.status} />{x.note ? <span className="muted"> {x.note}</span> : null}</li>)}</ul>
          <h3>Accessibilità</h3>
          <div>Sedia a rotelle: {label3(p.accessibility.wheelchair)} · Passeggino: {label3(p.accessibility.stroller)} · Scale: {({ none: 'nessuna', some: 'alcune', many: 'molte', unknown: 'non note' } as any)[p.accessibility.stairs]} <EvidenceBadge status={p.accessibility.evidence.status} /></div>
          {p.accessibility.note ? <div className="muted">{p.accessibility.note}</div> : null}
          <div className="muted">Un luogo senza dati sulle scale non è considerato accessibile.</div>
          {p.suitability.habitualAtmosphere !== 'unknown' ? <div className="muted">Atmosfera abituale (curata dalla redazione, non affluenza reale): {({ usually_lively: 'di solito animato', usually_quiet: 'di solito tranquillo', varies: 'variabile' } as any)[p.suitability.habitualAtmosphere]}</div> : null}
          {data.events.length ? (
            <>
              <h3>Eventi (dimostrativi)</h3>
              <ul>{data.events.slice(0, 6).map((o: any) => <li key={o.sessionId}>{o.start.slice(5, 10)} {hhmm(o.start)} {o.title} {o.status !== 'scheduled' ? <Badge kind="bad">{({ cancelled: 'annullato', sold_out: 'esaurito', postponed: 'rinviato' } as any)[o.status]}</Badge> : null}</li>)}</ul>
            </>
          ) : null}
          <h3>Come arrivare</h3>
          <ul>{p.nearestStops.map((s: any) => <li key={s.id}>{s.name} · {s.distanceM} m · {s.modes.join(', ')}</li>)}</ul>
          <div className="links">
            {p.links.website ? <a href={p.links.website} target="_blank" rel="noopener noreferrer">Sito ufficiale</a> : null}
            <a href={`https://www.openstreetmap.org/${p.osm?.[0] === 'n' ? 'node' : p.osm?.[0] === 'w' ? 'way' : 'relation'}/${p.osm?.slice(1)}`} target="_blank" rel="noopener noreferrer">Oggetto su OpenStreetMap</a>
          </div>
          <div className="muted small">Fonti: {data.sources.map((s: any) => s.name).join(' · ')} · ultimo controllo redazionale {p.lastEditorialCheck ?? 'n.d.'}</div>
          <div className="row">
            <button className="btn-ghost" onClick={() => { useApp.getState().setDraft((d) => ({ ...d, mustSee: [...new Set([...d.mustSee, p.id])] })); useApp.getState().notify(`${p.name} aggiunto alle tappe da non perdere.`, 'ok'); }}>Da non perdere</button>
            <button className="btn-ghost" aria-pressed={favs.includes(p.id)} onClick={() => toggleFav(p.id)}>{favs.includes(p.id) ? '★ Preferito' : '☆ Preferito'}</button>
            <button className="btn-ghost" aria-pressed={visited.includes(p.id)} onClick={() => toggleVisited(p.id)}>{visited.includes(p.id) ? '✓ Già visitato' : 'Già visitato'}</button>
            <button className="btn-ghost" onClick={() => setReport(true)}>Segnala un errore</button>
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
