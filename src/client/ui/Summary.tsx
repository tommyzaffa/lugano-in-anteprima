import { useState } from 'react';
import { useApp } from '../store.ts';
import { hhmm, fmtDuration, formatDateIt } from '../../shared/time.ts';
import { fmtRange } from '../../shared/pricing.ts';
import { describeDay } from '../../shared/calendar.ts';
import { planToIcs, planToText } from '../../shared/export.ts';
import { send, track } from '../api.ts';
import { download, copy, Badge, EvidenceBadge, Spinner } from './common.tsx';
import { LegLine, FeasibilityBadge, SourceBadge, TotalsLine } from './PlanDetail.tsx';
import { savePlan, ShareDialog } from './SaveShare.tsx';
import { makePostcard } from './postcard.ts';
import { CATEGORY } from '../i18n.ts';
import type { Plan } from '../../shared/types.ts';

interface Reval { checkedAt: string; status: string; expired: boolean; items: { severity: string; stopId?: string; message: string }[] }

export default function Summary({ planOverride, readOnly }: { planOverride?: Plan; readOnly?: boolean }) {
  const current = useApp((s) => s.plan());
  const plan = planOverride ?? current;
  const set = useApp((s) => s.set);
  const [reval, setReval] = useState<Reval | null>(null);
  const [checking, setChecking] = useState(false);
  const [share, setShare] = useState(false);
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
          <button className="btn-ghost" onClick={() => void savePlan()}>Salva</button>
          <button className="btn-ghost" onClick={() => setShare(true)}>Condividi</button>
          <button className="btn-ghost" onClick={() => set({ view: 'sim' })}>Torna alla simulazione</button>
        </> : null}
      </div>
      <TotalsLine plan={plan} />
      <div className="reval no-print">
        <button className="btn" onClick={() => void revalidate()} disabled={checking}>{checking ? <Spinner /> : null} Verifica i dati adesso</button>
        <span className="hint">Confronta il programma con i dati attuali (orari, eventi, corse). La simulazione continua invece a usare lo snapshot originale.</span>
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
                {pub ? <div>Orari del giorno: {describeDay(pub, date)} <EvidenceBadge status={pub.evidence.status} />{pub.osmOpeningHours ? <span className="muted"> · fonte: «{pub.osmOpeningHours}»</span> : null}</div> : s.placeId ? <div>Orari: <Badge kind="bad">non disponibili</Badge></div> : null}
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
      <div className="sources-used">
        <h3>Fonti e limiti</h3>
        <ul>
          <li>Luoghi, strade e sentieri: © OpenStreetMap contributors (ODbL), catalogo {plan.snapshot.catalogVersion}.</li>
          <li>Orari dei mezzi: orario ufficiale statico {plan.snapshot.transitFeed} (opentransportdata.swiss), senza ritardi in tempo reale.</li>
          <li>Tempi a piedi e dislivelli: calcolati sulla rete pedonale e sul modello del terreno (stime).</li>
          <li>Prezzi: stime indicative per categoria o tariffe da verificare; nessun acquisto o prenotazione è stato effettuato.</li>
          <li>Eventi: fixture dimostrative, non l'agenda reale.</li>
        </ul>
      </div>
      {share ? <ShareDialog onClose={() => setShare(false)} /> : null}
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
