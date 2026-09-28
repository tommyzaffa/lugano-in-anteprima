import type { Plan, Trip, PlanStop, RouteLeg } from '../../shared/types.ts';
import { hhmm, fmtDuration } from '../../shared/time.ts';
import { fmtRange } from '../../shared/pricing.ts';
import { CATEGORY, MODE, MODE_ICON, FEASIBILITY } from '../i18n.ts';
import { Badge, EvidenceBadge, Cost } from './common.tsx';
import { useApp, useSim } from '../store.ts';

export function FeasibilityBadge({ plan }: { plan: Plan }) {
  const k = plan.feasibility === 'valid' ? 'ok' : plan.feasibility === 'uncertain' ? 'warn' : 'bad';
  return <Badge kind={k as any} title="Stato della verifica del programma">{FEASIBILITY[plan.feasibility]}</Badge>;
}

export function SourceBadge({ plan }: { plan: Plan }) {
  return plan.plannerSource === 'ai-live'
    ? <Badge kind="ai" title="Proposta generata con AI e validata dal motore">AI live</Badge>
    : <Badge kind="demo" title="Nessun modello AI: combinazioni generate dal pianificatore deterministico">Pianificatore deterministico</Badge>;
}

export function TotalsLine({ plan }: { plan: Plan }) {
  const c = plan.totals.cost;
  return (
    <div className="totals" aria-label="Riepilogo numerico">
      <div><span className="k">Durata</span><span className="v">{fmtDuration(plan.totals.durationMin)}</span></div>
      <div><span className="k">Rientro</span><span className="v">{hhmm(plan.totals.endsAt)}</span></div>
      <div><span className="k">A persona</span><span className="v"><Cost min={c.perPersonMin} max={c.perPersonMax} unknown={c.unknownEssential} /></span></div>
      <div><span className="k">Gruppo</span><span className="v"><Cost min={c.min} max={c.max} /></span></div>
      <div><span className="k">A piedi</span><span className="v">{(plan.totals.walkM / 1000).toFixed(1)} km</span></div>
      <div><span className="k">Salita</span><span className="v">{plan.totals.ascentM} m</span></div>
    </div>
  );
}

export function LegLine({ leg }: { leg: RouteLeg }) {
  if (leg.mode === 'wait') return <li className="leg wait">{MODE_ICON.wait} Attesa {Math.round(leg.durationMin)} min a {leg.from.label}</li>;
  const r = leg.transit?.[0];
  return (
    <li className={`leg leg-${leg.mode}`}>
      <span className="leg-time">{hhmm(leg.departure)}–{hhmm(leg.arrival)}</span>
      <span className="leg-icon" aria-hidden>{MODE_ICON[leg.mode] ?? '•'}</span>
      <span className="leg-text">
        {r ? <><strong>{MODE[leg.mode]} {r.routeShort}</strong> direzione {r.headsign}: da {leg.from.label} a {leg.to.label}{r.frequencyBased ? <em> (cadenza, orario indicativo)</em> : null}</>
          : <><strong>{MODE[leg.mode]}</strong> {(leg.distanceM / 1000).toFixed(leg.distanceM < 1000 ? 2 : 1)} km{leg.ascentM ? ` · +${leg.ascentM} m` : ''}{leg.streets?.length ? <span className="muted"> · {leg.streets.slice(0, 3).join(', ')}</span> : null}</>}
        {leg.flags.stairs ? <Badge kind="warn">scale</Badge> : null}
        {leg.flags.trail ? <Badge kind="warn">sentiero</Badge> : null}
        {leg.notes.length ? <span className="leg-notes">{leg.notes.join(' ')}</span> : null}
      </span>
    </li>
  );
}

export function TripBlock({ trip, label }: { trip: Trip; label?: string }) {
  return (
    <div className="trip">
      <div className="trip-head"><span>{label ?? trip.summary.label}</span><span className="muted">{fmtDuration(trip.summary.durationMin)}{trip.cost.length ? <> · <Cost min={sum(trip.cost, 'min')} max={sum(trip.cost, 'max')} /></> : null}</span></div>
      <ul className="legs">{trip.legs.map((l) => <LegLine key={l.id} leg={l} />)}</ul>
      {trip.alternatives?.length ? <div className="trip-alt muted">Alternative considerate: {trip.alternatives.map((a) => `${a.mode} ${a.durationMin} min`).join(' · ')}</div> : null}
    </div>
  );
}

function sum(lines: { min: number | null; max: number | null }[], k: 'min' | 'max') {
  if (lines.some((l) => l[k] == null)) return null;
  return Math.round(lines.reduce((a, l) => a + (l[k] ?? 0), 0) * 10) / 10;
}

export function StopBlock({ stop, n, current }: { stop: PlanStop; n: number; current?: boolean }) {
  const set = useApp((s) => s.set);
  const nonOk = stop.checks.filter((c) => c.status !== 'ok');
  return (
    <div className={`stop ${current ? 'current' : ''}`}>
      <div className="stop-n" aria-hidden>{n}</div>
      <div className="stop-body">
        <div className="stop-head">
          <button className="stop-name link" onClick={() => stop.placeId && set({ placeCard: stop.placeId })}>{stop.name}</button>
          {stop.locked ? <Badge kind="info">🔒 bloccata</Badge> : null}
          {stop.kind === 'event' ? <Badge kind="demo">evento demo</Badge> : null}
        </div>
        <div className="stop-meta">
          <span>{hhmm(stop.start)}–{hhmm(stop.end)}</span> · <span>{CATEGORY[stop.category] ?? stop.category}</span> · <span>{fmtDuration(stop.stayMin)}</span>
          {stop.cost.length ? <> · <Cost min={sum(stop.cost, 'min')} max={sum(stop.cost, 'max')} unknown={stop.cost.filter((c) => c.min == null && c.essential).length || undefined} /></> : null}
        </div>
        {stop.reasons.length ? <div className="stop-reasons">{stop.reasons.slice(0, 2).join(' · ')}</div> : null}
        {stop.checks.filter((c) => c.id === 'hours').map((c) => <div key={c.id} className="check-line ok">⏱ {c.detail}</div>)}
        {nonOk.map((c) => <div key={c.id} className={`check-line ${c.status}`}>{c.status === 'violated' ? '✗' : '?'} {c.detail}</div>)}
        {stop.activityPath ? <div className="muted">Percorso a piedi durante l'attività: {(stop.activityPath.lengthM / 1000).toFixed(1)} km, +{stop.activityPath.upM} m, fino a {stop.exit?.label}</div> : null}
      </div>
    </div>
  );
}

export default function PlanDetail({ plan, compact }: { plan: Plan; compact?: boolean }) {
  const t = useSim((s) => s.t);
  const view = useApp((s) => s.view);
  const ret = plan.trips.length > plan.stops.length ? plan.trips[plan.trips.length - 1] : null;
  const currentStop = view === 'sim' ? plan.stops.findIndex((s) => Date.parse(s.arrival) <= t && Date.parse(s.departure) > t) : -1;
  return (
    <div className="plan-detail">
      {!compact ? (
        <>
          {plan.hypothetical?.length ? <div className="notice info">Ramo ipotetico: {plan.hypothetical.join(' · ')}. Non è una notizia reale.</div> : null}
          {plan.aiNote ? <div className="notice info">{plan.aiNote}</div> : null}
          {plan.whyThis.length ? <div className="why"><strong>Perché questo programma:</strong> {plan.whyThis.join(' · ')}</div> : null}
          {plan.tradeoffs.length ? <div className="tradeoffs"><strong>Compromessi:</strong> {plan.tradeoffs.join(' · ')}</div> : null}
          {plan.missing.length ? <div className="missing"><strong>Informazioni mancanti:</strong> {plan.missing.join(' · ')}</div> : null}
        </>
      ) : null}
      <div className="itinerary">
        {plan.stops.map((s, i) => (
          <div key={s.id}>
            <TripBlock trip={plan.trips[i]} />
            <StopBlock stop={s} n={i + 1} current={i === currentStop} />
            {plan.decisions.filter((d) => d.afterStop === i).map((d) => <div key={d.id} className={`decision-mark ${d.chosen ? 'chosen' : ''}`}>◆ {d.prompt}{d.chosen ? ` — scelto: ${d.options.find((o) => o.id === d.chosen)?.label ?? d.chosen}` : ' (decisione durante la simulazione)'}</div>)}
          </div>
        ))}
        {ret ? <TripBlock trip={ret} label={`Rientro a ${plan.end.label}: ${ret.summary.label}`} /> : <div className="muted">Fine libera all'ultima tappa.</div>}
      </div>
      {!compact ? (
        <>
          <h4>Controlli</h4>
          <ul className="checks">
            {[...plan.checks].sort((a, b) => order(a.status) - order(b.status)).map((c) => <li key={c.id} className={c.status}><span className="check-icon">{c.status === 'ok' ? '✓' : c.status === 'violated' ? '✗' : '?'}</span> <strong>{c.label}:</strong> {c.detail}</li>)}
          </ul>
          <div className="snapshot muted">
            Dati: catalogo {plan.snapshot.catalogVersion} · orario {plan.snapshot.transitFeed} · calcolato {new Date(plan.snapshot.computedAt).toLocaleString('it-CH')}
            {plan.snapshot.weather ? <> · meteo: {plan.snapshot.weather.status === 'demo' ? 'dimostrativo' : plan.snapshot.weather.status === 'live' ? plan.snapshot.weather.summary : plan.snapshot.weather.note}</> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function order(s: string) { return s === 'violated' ? 0 : s === 'uncertain' ? 1 : 2; }
export { EvidenceBadge, fmtRange };
