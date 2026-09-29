import { tx, getLocale } from '../locale.ts';
import { safeUrl } from '../safe-url.ts';
import { useState } from 'react';
import { useApp } from '../store.ts';
import { hhmm, fmtDuration, formatDateIt, localToInstant } from '../../shared/time.ts';
import { fmtRange } from '../../shared/pricing.ts';
import { describeDay } from '../../shared/calendar.ts';
import { planToIcs, planToText } from '../../shared/export.ts';
import { send, track } from '../api.ts';
import { runPlanning } from './planning-actions.ts';
import { download, copy, Badge, EvidenceBadge, Spinner, SourceLink } from './common.tsx';
import { LegLine } from './PlanDetail.tsx';
import { PlanStats, PlanTitle } from './Results.tsx';
import { savePlan, ShareDialog } from './SaveShare.tsx';
import { makePostcard } from './postcard.ts';
import { avatarSvg } from '../map/avatars.ts';
import { CATEGORY, MODE_ICON } from '../i18n.ts';
import type { Plan, Trip } from '../../shared/types.ts';

interface Reval { checkedAt: string; status: string; expired: boolean; items: { severity: string; stopId?: string; message: string }[] }

export default function Summary({ planOverride, readOnly }: { planOverride?: Plan; readOnly?: boolean }) {
  const sharing = useApp((s) => !!s.meta?.features?.sharing);
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
  const estimated = plan.checks.some((c) => c.id === 'transit' && c.detail.startsWith('Orario stimato'));
  return (
    <div className="summary">
      {!readOnly ? <button className="link no-print" onClick={() => set({ view: 'sim' })} style={{ justifySelf: 'start' }}>{tx("← Torna alla simulazione")}</button> : null}
      <div className="summary-head">
        <h2><PlanTitle title={tx(plan.title)} /></h2>
        <p>{tx(formatDateIt(date, getLocale()))} · {tx(hhmm(plan.totals.startsAt))}–{tx(hhmm(plan.totals.endsAt))}</p>
        <div className="summary-pawns" aria-label={tx(plan.request.people.map((p) => p.name).join(', '))}>{plan.request.people.map((p) => <span key={p.id} title={tx(p.name)} dangerouslySetInnerHTML={{ __html: avatarSvg(p, 30) }} />)}</div>
        <PlanStats plan={plan} />
      </div>
      <div className="summary-actions no-print">
        <button onClick={() => { download('lugano-in-anteprima.ics', planToIcs(plan, { includeRides: true }), 'text/calendar'); track('export_ics'); }}><span className="ai" aria-hidden>📅</span>{tx("Calendario")}</button>
        <button onClick={() => { window.print(); track('print'); }}><span className="ai" aria-hidden>🖨</span>{tx("Stampa")}</button>
        <button onClick={() => copy(planToText(plan))}><span className="ai" aria-hidden>📋</span>{tx("Copia")}</button>
        <button onClick={() => void makePostcard(plan)}><span className="ai" aria-hidden>🖼</span>{tx("Cartolina")}</button>
      </div>
      {sharing && !readOnly ? <div className="row no-print"><button className="btn-ghost" onClick={() => void savePlan()}>{tx("Salva")}</button><button className="btn-ghost" onClick={() => setShare(true)}>{tx("Condividi")}</button></div> : null}
      <ol className="summary-list">
        {plan.stops.map((s, i) => {
          const snap = plan.snapshot.places[s.placeId];
          const pub = snap?.schedules.find((x) => x.kind === 'public');
          const trip = plan.trips[i];
          return (
            <li key={s.id} className="summary-item">
              <span className="si-time">{tx(hhmm(s.start))}</span>
              <div className="si-body">
                <h3><button onClick={() => s.placeId && set({ placeCard: s.placeId })}>{tx(s.name)}</button></h3>
                <div className="si-how">{tx(howTo(trip))}{tx(" · fino alle ")}{tx(hhmm(s.end))}{tx(s.cost.length ? ` · ${sum(s.cost, 'max') === 0 ? 'gratis' : fmtRange(sum(s.cost, 'min'), sum(s.cost, 'max'))}` : '')}</div>
                {s.checks.filter((c) => c.status !== 'ok').map((c) => <div key={c.id} className="check-line uncertain">? {tx(c.detail)}</div>)}
                <details>
                  <summary>{tx("Percorso e dettagli")}</summary>
                  <ul className="legs">{trip.legs.filter((l) => l.mode !== 'wait').map((l) => <LegLine key={l.id} leg={l} />)}</ul>
                  <div className="muted">{tx(CATEGORY[s.category] ?? s.category)}</div>
                  {pub ? <div>{tx("Orari: ")}{tx(describeDay(pub, date))} <EvidenceBadge status={pub.evidence.status} /><SourceLink evidence={pub.evidence} /></div> : s.placeId ? <div>{tx("Orari: ")}<Badge kind="bad">{tx("non disponibili")}</Badge></div> : null}
                  {s.cost.length ? <div>{s.cost.map((c) => <span key={c.id} className="cost-line">{tx(c.label)}: {tx(fmtRange(c.min, c.max))} <EvidenceBadge status={c.evidenceStatus ?? c.status} /></span>)}</div> : null}
                  <div><a href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=18/${s.lat}/${s.lon}`} target="_blank" rel="noopener noreferrer">{tx("Apri la posizione")}</a> · <PlaceLinks placeId={s.placeId} /></div>
                </details>
              </div>
            </li>
          );
        })}
        {tx(ret ? (
          <li className="summary-item">
            <span className="si-time">{tx(hhmm(ret.departure))}</span>
            <div className="si-body ret">
              <h3>{tx("Rientro")}</h3>
              <div className="si-how">{tx(howTo(ret))}{tx(" · a ")}{tx(plan.end.label)}{tx(", arrivo ")}{tx(hhmm(ret.arrival))}</div>
              <details><summary>{tx("Percorso")}</summary><ul className="legs">{ret.legs.filter((l) => l.mode !== 'wait').map((l) => <LegLine key={l.id} leg={l} />)}</ul></details>
            </div>
          </li>
        ) : null)}
      </ol>

      {!readOnly ? <OutingNow plan={plan} /> : null}
      <details className="more to-verify">
        <summary>{tx("Prima di partire ")}<span className="muted">· {tx(toVerify.length ? `${toVerify.length} cose da controllare` : 'verifica i dati')}</span></summary>
        {toVerify.length ? <ul>{toVerify.map((x, i) => <li key={i}>{tx(x)}</li>)}</ul> : null}
        <div className="reval no-print">
          <button className="btn-ghost" onClick={() => void revalidate()} disabled={checking}>{checking ? <Spinner /> : null}{tx(" Verifica i dati adesso")}</button>
          {tx(reval ? (
            <div className={`notice ${reval.status === 'blocking' ? 'bad' : reval.status === 'changed' ? 'warn' : 'ok'}`}>
              <strong>{tx(reval.status === 'blocking' ? 'Alcune tappe non sono più valide' : reval.status === 'changed' ? 'Alcuni dati sono cambiati' : 'Nessun cambiamento')}</strong>
              <ul>{reval.items.map((i, k) => <li key={k} className={i.severity}>{tx(i.message)}</li>)}</ul>
              <span className="muted">{tx("Verificato alle ")}{tx(new Date(reval.checkedAt).toLocaleTimeString(getLocale()))}</span>
            </div>
          ) : null)}
        </div>
      </details>
      <PlanBSection plan={plan} />
      <details className="more sources-used">
        <summary>{tx("Fonti e limiti")}</summary>
        <ul>
          <li>{tx("Luoghi, strade e sentieri: © OpenStreetMap contributors (ODbL).")}</li>
          <li>{tx("Mezzi: orario ufficiale ")}{tx(plan.snapshot.transitFeed)}{tx(" (opentransportdata.swiss), senza ritardi in tempo reale.")}{tx(estimated ? ' Per questa data le corse sono stimate: verificatele prima di partire.' : '')}</li>
          <li>{tx("Tempi a piedi e dislivelli: calcolati sulla rete pedonale e sul terreno (stime).")}</li>
          <li>{tx("Prezzi: stime indicative; nessun acquisto o prenotazione è stato fatto.")}</li>
          <li>{tx("Eventi: calendario ufficiale luganoeventi.ch, da confermare sulla scheda dell'evento.")}</li>
        </ul>
      </details>
      {share ? <ShareDialog onClose={() => setShare(false)} /> : null}
    </div>
  );
}

/** «🚌 Bus 2 · 12 min» oppure «🚶 8 min a piedi». */
function howTo(trip: Trip): string {
  const ride = trip.legs.find((l) => l.transit);
  const icon = MODE_ICON[ride?.mode ?? trip.legs.find((l) => l.mode !== 'wait')?.mode ?? 'walk'] ?? '🚶';
  if (!trip.legs.some((l) => l.mode !== 'wait')) return 'già qui';
  return `${icon} ${ride ? `${trip.summary.label}, ` : 'a piedi, '}${fmtDuration(trip.summary.durationMin)}`;
}

function sum(lines: { min: number | null; max: number | null }[], k: 'min' | 'max') {
  if (lines.some((l) => l[k] == null)) return null;
  return Math.round(lines.reduce((a, l) => a + (l[k] ?? 0), 0) * 10) / 10;
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
    <details className="more outing-now no-print">
      <summary>{tx("Siete già in giro? Ricalcola il resto")}</summary>
      <p className="hint">{tx("Segnate le tappe fatte: ricalcoliamo il resto da dove siete, con l'ora reale.")}</p>
      <ul className="done-list">
        {plan.stops.map((s) => (
          <li key={s.id}><label className="check"><input type="checkbox" checked={done.has(s.id)} onChange={(e) => setDone((d) => { const n = new Set(d); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} /> {tx(hhmm(s.start))} {tx(s.name)}</label></li>
        ))}
      </ul>
      <button className="btn primary" disabled={busy || done.size === plan.stops.length} onClick={() => void recompute()}>{busy ? <Spinner /> : null}{tx(" Ricalcola il resto da qui")}</button>
    </details>
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
    <details className="more planb" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !data && state === 'idle') void load(); }}>
      <summary>{tx("Piano B se piove")}</summary>
      {state === 'loading' ? <p><Spinner />{tx(" Cerco alternative al coperto…")}</p> : null}
      {state === 'error' ? <div className="notice bad">{tx("Calcolo non riuscito. ")}<button className="link" onClick={() => void load()}>{tx("Riprova")}</button></div> : null}
      {tx(!data ? null : !data.items.length ? <p className="muted">{tx("Tutte le tappe sono al coperto: nessun piano B necessario.")}</p> : (
        <ul className="planb-list">
          {data.items.map((it) => (
            <li key={it.stopId}>
              <strong>{tx("Al posto di ")}{tx(it.stopName)}</strong> <span className="muted">{tx("alle ")}{tx(hhmm(it.start))}</span>
              {tx(it.options.length ? (
                <ul>{it.options.map((o) => (
                  <li key={o.placeId}>
                    <button className="link" onClick={() => set({ placeCard: o.placeId })}>{tx(o.name)}</button> <span className="muted">· {tx(o.walkMin)}{tx(" min a piedi · ")}{tx(o.costUnknown ? 'costo non noto' : fmtRange(o.costMin, o.costMax))}{tx(o.hours === 'open' ? '' : ' · orari da verificare')}{tx(o.booking === 'yes' ? ' · su prenotazione' : '')}</span>
                  </li>
                ))}</ul>
              ) : <div className="muted">{tx(it.none)}</div>)}
            </li>
          ))}
        </ul>
      ))}
    </details>
  );
}

function PlaceLinks({ placeId }: { placeId: string }) {
  const [info, setInfo] = useState<any>(null);
  const [asked, setAsked] = useState(false);
  if (!placeId) return null;
  if (!asked) return <button className="link" onClick={() => { setAsked(true); fetch(`/api/places/${placeId}`).then((r) => r.json()).then(setInfo).catch(() => {}); }}>{tx("Sito e prenotazione")}</button>;
  if (!info?.place) return <span className="muted">…</span>;
  const p = info.place;
  return (
    <span className="place-links">
      {p.links?.website ? <a href={safeUrl(p.links.website)} target="_blank" rel="noopener noreferrer">{tx("Sito ufficiale")}</a> : <span className="muted">{tx("Nessun sito")}</span>}
      {p.links?.phone ? <> · <a href={`tel:${p.links.phone}`}>{tx(p.links.phone)}</a></> : null}
      {tx(' · ')}{tx("prenotazione ")}{tx(({ yes: 'necessaria', no: 'non necessaria', recommended: 'consigliata', unknown: 'non nota' } as any)[p.booking.required])}
    </span>
  );
}
