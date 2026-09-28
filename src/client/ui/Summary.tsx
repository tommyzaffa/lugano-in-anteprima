import { useState } from 'react';
import { useApp } from '../store.ts';
import { hhmm, fmtDuration, formatDateIt, localToInstant } from '../../shared/time.ts';
import { fmtRange } from '../../shared/pricing.ts';
import { describeDay } from '../../shared/calendar.ts';
import { planToIcs, planToText } from '../../shared/export.ts';
import { send, track } from '../api.ts';
import { runPlanning } from './planning-actions.ts';
import { download, copy, Badge, EvidenceBadge, Spinner, SourceLink } from './common.tsx';
import { LegLine, FeasibilityBadge, SourceBadge, TotalsLine } from './PlanDetail.tsx';
import { savePlan, ShareDialog } from './SaveShare.tsx';
import { makePostcard } from './postcard.ts';
import { CATEGORY } from '../i18n.ts';
import type { Plan } from '../../shared/types.ts';

interface Reval { checkedAt: string; status: string; expired: boolean; items: { severity: string; stopId?: string; message: string }[] }

export default function Summary({ planOverride, readOnly }: { planOverride?: Plan; readOnly?: boolean }) {
  const sharing = useApp((s) => !!s.meta?.features?.sharing);
  const current = useApp((s) => s.plan());
  const plan = planOverride ?? current;
  const set = useApp((s) => s.set);
  const [reval, setReval] = useState<Reval | null>(null);
  const [checking, setChecking] = useState(false);
  const [share, setShare] = useState(false);
  const [live, setLive] = useState<string | null>(null);
  const liveCheck = async () => {
    const t = plan?.trips.find((x) => x.legs.some((l) => l.transit));
    const leg = t?.legs.find((l) => l.transit);
    if (!leg) { setLive('Nessuna corsa di mezzi pubblici nel programma.'); return; }
    try {
      const r = await send<{ status: string; message?: string; trips?: any[] }>('POST', '/api/transit/live-check', { from: leg.from, to: leg.to, departure: leg.departure });
      setLive(r.status === 'not_configured' ? 'Verifica in tempo reale non disponibile: il collegamento a Open Journey Planner non è configurato. Gli orari mostrati sono quelli pianificati.' : r.status === 'ok' ? `Open Journey Planner: ${r.trips?.length ?? 0} soluzioni trovate per la prima corsa.` : `Servizio in tempo reale non raggiungibile: ${r.message ?? ''}`);
    } catch { setLive('Verifica non riuscita.'); }
  };
  if (!plan) return null;
  const date = plan.request.date;
  const toVerify = [...new Set([...plan.checks.filter((c) => c.status !== 'ok').map((c) => c.detail), ...plan.missing])];
  const revalidate = async () => {
    setChecking(true);
    try { setReval(await send<Reval>('POST', '/api/revalidate', { plan })); } catch { useApp.getState().notify('Verifica non riuscita: controllate la rete.', 'error'); }
    setChecking(false);
  };
  const ret = plan.trips.length > plan.stops.length ? plan.trips[plan.trips.length - 1] : null;
  return (
    <div className="summary">
      <div className="summary-head">
        <h2>{plan.title}</h2>
        <p>{formatDateIt(date)} · {hhmm(plan.totals.startsAt)}–{hhmm(plan.totals.endsAt)} · {plan.request.people.length} person{plan.request.people.length > 1 ? 'e' : 'a'}</p>
        <div className="alt-badges"><FeasibilityBadge plan={plan} /> <SourceBadge plan={plan} /></div>
      </div>
      <div className="summary-actions no-print">
        <button className="btn-ghost" onClick={() => { window.print(); track('print'); }}>Stampa</button>
        <button className="btn-ghost" onClick={() => { download('lugano-in-anteprima.ics', planToIcs(plan, { includeRides: true }), 'text/calendar'); track('export_ics'); }}>Aggiungi al calendario (.ics)</button>
        <button className="btn-ghost" onClick={() => copy(planToText(plan))}>Copia testo</button>
        <button className="btn-ghost" onClick={() => void makePostcard(plan)}>Cartolina</button>
        {!readOnly ? <>
          {sharing ? <button className="btn-ghost" onClick={() => void savePlan()}>Salva</button> : null}
          {sharing ? <button className="btn-ghost" onClick={() => setShare(true)}>Condividi</button> : null}
          <button className="btn-ghost" onClick={() => set({ view: 'sim' })}>Torna alla simulazione</button>
        </> : null}
      </div>
      <TotalsLine plan={plan} />
      <div className="reval no-print">
        <div className="row wrap">
          <button className="btn" onClick={() => void revalidate()} disabled={checking}>{checking ? <Spinner /> : null} Verifica i dati adesso</button>
          <button className="btn-ghost" onClick={() => void liveCheck()}>Corse in tempo reale</button>
        </div>
        <p className="hint">Confronta il programma con i dati attuali (orari, eventi, corse). La simulazione continua invece a usare lo snapshot originale.</p>
        {live ? <div className="notice info">{live}</div> : null}
        {reval ? (
          <div className={`notice ${reval.status === 'blocking' ? 'bad' : reval.status === 'changed' ? 'warn' : 'ok'}`}>
            <strong>{reval.status === 'blocking' ? 'Attenzione: alcune tappe non sono più valide' : reval.status === 'changed' ? 'Alcuni dati sono cambiati' : 'Nessun cambiamento rilevante'}</strong>
            <ul>{reval.items.map((i, k) => <li key={k} className={i.severity}>{i.message}</li>)}</ul>
            <span className="muted">Verificato alle {new Date(reval.checkedAt).toLocaleTimeString('it-CH')}</span>
          </div>
        ) : null}
      </div>
      {toVerify.length ? (
        <div className="to-verify">
          <h3>Da verificare prima di partire</h3>
          <ul>{toVerify.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      ) : null}
      <ol className="summary-list">
        {plan.stops.map((s, i) => {
          const snap = plan.snapshot.places[s.placeId];
          const pub = snap?.schedules.find((x) => x.kind === 'public');
          const trip = plan.trips[i];
          return (
            <li key={s.id} className="summary-item">
              <div className="si-trip">
                <strong>Come arrivare</strong> ({trip.summary.label}, {fmtDuration(trip.summary.durationMin)})
                <ul className="legs">{trip.legs.filter((l) => l.mode !== 'wait').map((l) => <LegLine key={l.id} leg={l} />)}</ul>
              </div>
              <div className="si-stop">
                <h3>{i + 1}. {s.name} <span className="muted">{hhmm(s.start)}–{hhmm(s.end)}</span></h3>
                <div className="muted">{CATEGORY[s.category] ?? s.category}{s.kind === 'event' ? ' · evento dimostrativo' : ''}</div>
                <div>Posizione: <a href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=18/${s.lat}/${s.lon}`} target="_blank" rel="noopener noreferrer">{s.lat.toFixed(5)}, {s.lon.toFixed(5)}</a> <span className="muted">(ingresso o punto rappresentativo, fonte OSM)</span></div>
                {pub ? <div>Orari del giorno: {describeDay(pub, date)} <EvidenceBadge status={pub.evidence.status} /><SourceLink evidence={pub.evidence} />{pub.osmOpeningHours ? <span className="muted"> · fonte: «{pub.osmOpeningHours}»</span> : null}</div> : s.placeId ? <div>Orari: <Badge kind="bad">non disponibili</Badge></div> : null}
                {s.cost.length ? <div>Costi stimati: {s.cost.map((c) => <span key={c.id} className="cost-line">{c.label}: {fmtRange(c.min, c.max)} <EvidenceBadge status={c.evidenceStatus ?? c.status} /></span>)}</div> : null}
                <PlaceLinks placeId={s.placeId} />
                {s.checks.filter((c) => c.status !== 'ok').map((c) => <div key={c.id} className="check-line uncertain">? {c.detail}</div>)}
              </div>
            </li>
          );
        })}
      </ol>
      {ret ? (
        <div className="summary-item">
          <strong>Rientro a {plan.end.label}</strong>: {ret.summary.label}, partenza {hhmm(ret.departure)}, arrivo {hhmm(ret.arrival)}
          <ul className="legs">{ret.legs.filter((l) => l.mode !== 'wait').map((l) => <LegLine key={l.id} leg={l} />)}</ul>
        </div>
      ) : null}
      {!readOnly ? <OutingNow plan={plan} /> : null}
      <PlanBSection plan={plan} />
      <div className="sources-used">
        <h3>Fonti e limiti</h3>
        <ul>
          <li>Luoghi, strade e sentieri: © OpenStreetMap contributors (ODbL), catalogo {plan.snapshot.catalogVersion}.</li>
          <li>Orari dei mezzi: orario ufficiale statico {plan.snapshot.transitFeed} (opentransportdata.swiss), senza ritardi in tempo reale.{plan.checks.find((c) => c.id === 'transit' && c.detail.startsWith('Orario stimato')) ? ' Per questa data le corse sono stimate dall\'orario dello stesso giorno della settimana di un anno prima: verificatele prima di partire.' : ''}</li>
          <li>Tempi a piedi e dislivelli: calcolati sulla rete pedonale e sul modello del terreno (stime).</li>
          <li>Prezzi: stime indicative per categoria o tariffe da verificare; nessun acquisto o prenotazione è stato effettuato.</li>
          <li>Eventi: fixture dimostrative, non l'agenda reale.</li>
        </ul>
      </div>
      {share ? <ShareDialog onClose={() => setShare(false)} /> : null}
    </div>
  );
}

/**
 * «Siamo in giro adesso»: il giorno dell'uscita, ricalcola il resto del programma dall'ora reale e
 * dalla posizione (solo se concessa), con le tappe non ancora fatte come obbligatorie.
 */
function OutingNow({ plan }: { plan: Plan }) {
  const meta = useApp((s) => s.meta);
  const today = meta?.today ?? new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const [done, setDone] = useState<Set<string>>(() => new Set(plan.stops.filter((s) => Date.parse(s.end) <= now).map((s) => s.id)));
  const [busy, setBusy] = useState(false);
  if (plan.request.date !== today || now > Date.parse(plan.totals.endsAt)) return null;
  const hhmmNow = (ms: number) => new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  const recompute = async () => {
    setBusy(true);
    const remaining = plan.stops.filter((s) => !done.has(s.id));
    const visited = plan.stops.filter((s) => done.has(s.id));
    const last = visited[visited.length - 1];
    const fallback = last ? { kind: 'place' as const, label: `Ultima tappa: ${last.name}`, lon: (last.exit ?? last).lon, lat: (last.exit ?? last).lat, placeId: last.placeId } : plan.request.start;
    const start = await new Promise<any>((resolve) => {
      if (!navigator.geolocation) { resolve(fallback); return; }
      let done = false;
      const noPosition = () => { if (done) return; done = true; useApp.getState().notify(`Posizione non disponibile: si riparte da ${fallback.label.replace(/^Ultima tappa: /, '')}.`, 'info'); resolve(fallback); };
      // il timeout della geolocalizzazione parte solo dopo il permesso: se la richiesta resta senza risposta non si aspetta all'infinito
      const guard = setTimeout(noPosition, 12_000);
      navigator.geolocation.getCurrentPosition(
        (p) => { if (done) return; done = true; clearTimeout(guard); track('geolocation_used'); resolve({ kind: 'geolocation', label: 'La mia posizione', lon: p.coords.longitude, lat: p.coords.latitude, sensitive: true }); },
        () => { clearTimeout(guard); noPosition(); },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
    const startMs = Math.ceil(Date.now() / 300_000) * 300_000;
    // orari sempre nel fuso di Zurigo, qualunque sia il fuso del dispositivo
    const endMs = Math.max(localToInstant(today, plan.request.endTime).toMillis(), startMs + 90 * 60_000);
    const draft = {
      ...plan.request, date: today, startTime: hhmmNow(startMs), endTime: hhmmNow(Math.min(endMs, localToInstant(today, '23:59').toMillis())), start,
      mustSee: [...new Set(remaining.map((s) => s.eventId ?? s.placeId).filter(Boolean) as string[])],
      exclude: [...new Set([...plan.request.exclude, ...visited.map((s) => s.placeId)])],
      locked: plan.request.locked.filter((l) => remaining.some((s) => s.placeId === l.placeId)),
      resolutions: {},
    };
    useApp.setState({ draft: draft as any });
    setBusy(false);
    await runPlanning();
  };
  return (
    <div className="outing-now no-print">
      <h3>Siamo in giro adesso</h3>
      <p className="hint">Oggi è il giorno del programma: segnate le tappe già fatte e ricalcolate il resto da dove siete, con l'ora reale. La posizione è usata solo se la concedete; altrimenti si riparte dall'ultima tappa fatta.</p>
      <ul className="done-list">
        {plan.stops.map((s) => (
          <li key={s.id}><label className="check"><input type="checkbox" checked={done.has(s.id)} onChange={(e) => setDone((d) => { const n = new Set(d); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} /> {hhmm(s.start)} {s.name} <span className="muted">{done.has(s.id) ? 'fatta' : 'da fare'}</span></label></li>
        ))}
      </ul>
      <button className="btn" disabled={busy || done.size === plan.stops.length} onClick={() => void recompute()}>{busy ? <Spinner /> : null} Ricalcola il resto da qui</button>
    </div>
  );
}

interface PlanBData { note: string; items: { stopId: string; stopName: string; start: string; reason: string; near?: string; none?: string; options: { placeId: string; name: string; category: string; walkMin: number; walkM: number; hours: 'open' | 'unknown'; hoursDetail: string; costMin: number | null; costMax: number | null; costUnknown: boolean; booking: string }[] }[] }

/** Piano B per meteo: alternative al coperto per le tappe all'aperto, calcolate su richiesta. */
function PlanBSection({ plan }: { plan: Plan }) {
  const set = useApp((s) => s.set);
  const [data, setData] = useState<PlanBData | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const load = async () => {
    setState('loading');
    try { setData(await send<PlanBData>('POST', '/api/planb', { plan })); setState('idle'); }
    catch { setState('error'); }
  };
  return (
    <div className="planb">
      <h3>Piano B se piove</h3>
      {!data ? (
        <div className="no-print">
          <button className="btn-ghost" onClick={() => void load()} disabled={state === 'loading'}>{state === 'loading' ? <Spinner /> : '☂'} Prepara le alternative al coperto</button>
          {state === 'error' ? <div className="notice bad">Calcolo non riuscito: riprovate.</div> : null}
        </div>
      ) : !data.items.length ? <p className="muted">Tutte le tappe sono al coperto o sono pause: nessun piano B necessario.</p> : (
        <>
          <p className="hint">{data.note}</p>
          <ul className="planb-list">
            {data.items.map((it) => (
              <li key={it.stopId}>
                <strong>Al posto di {it.stopName}</strong> <span className="muted">alle {hhmm(it.start)} · {it.reason}{it.near ? ` · alternative ${it.near}` : ''}</span>
                {it.options.length ? (
                  <ul>{it.options.map((o) => (
                    <li key={o.placeId}>
                      <button className="link" onClick={() => set({ placeCard: o.placeId })}>{o.name}</button> <span className="muted">{CATEGORY[o.category] ?? o.category}</span>
                      {' · '}{o.walkMin} min a piedi ({(o.walkM / 1000).toFixed(1)} km)
                      {' · '}{o.hours === 'open' ? <Badge kind="ok" title={o.hoursDetail}>aperto</Badge> : <Badge kind="warn" title={o.hoursDetail}>orari da verificare</Badge>}
                      {' · '}{o.costUnknown ? <Badge kind="bad">costo non noto</Badge> : fmtRange(o.costMin, o.costMax)}
                      {o.booking === 'yes' ? <> · <Badge kind="warn">prenotazione necessaria</Badge></> : null}
                    </li>
                  ))}</ul>
                ) : <div className="muted">{it.none}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PlaceLinks({ placeId }: { placeId: string }) {
  const [info, setInfo] = useState<any>(null);
  const [asked, setAsked] = useState(false);
  if (!placeId) return null;
  if (!asked) return <button className="link no-print" onClick={() => { setAsked(true); fetch(`/api/places/${placeId}`).then((r) => r.json()).then(setInfo).catch(() => {}); }}>Link utili e prenotazione</button>;
  if (!info?.place) return <span className="muted">…</span>;
  const p = info.place;
  return (
    <div className="place-links">
      {p.links?.website ? <a href={p.links.website} target="_blank" rel="noopener noreferrer">Sito ufficiale</a> : <span className="muted">Nessun sito indicato</span>}
      {p.links?.phone ? <> · <a href={`tel:${p.links.phone}`}>{p.links.phone}</a></> : null}
      {' · '}Prenotazione: {({ yes: 'necessaria', no: 'non necessaria', recommended: 'consigliata', unknown: 'non nota' } as any)[p.booking.required]}
    </div>
  );
}
