import { tx, getLocale } from '../locale.ts';
import type { Plan, Trip, PlanStop, RouteLeg } from '../../shared/types.ts';
import { hhmm, fmtDuration } from '../../shared/time.ts';
import { fmtRange } from '../../shared/pricing.ts';
import { CATEGORY, MODE, MODE_ICON, FEASIBILITY } from '../i18n.ts';
import { Badge, EvidenceBadge, Cost } from './common.tsx';
import { useApp, useSim } from '../store.ts';

export function FeasibilityBadge({ plan }: { plan: Plan }) {
  const k = plan.feasibility === 'valid' ? 'ok' : plan.feasibility === 'uncertain' ? 'warn' : 'bad';
  return <Badge kind={k as any} title={tx("Stato della verifica del programma")}>{tx(FEASIBILITY[plan.feasibility])}</Badge>;
}

export function SourceBadge({ plan }: { plan: Plan }) {
  return plan.plannerSource === 'ai-live'
    ? <Badge kind="ai" title={tx("Proposta generata con AI e validata dal motore")}>{tx("AI live")}</Badge>
    : <Badge kind="demo" title={tx("Nessun modello AI: combinazioni generate dal pianificatore deterministico")}>{tx("Pianificatore deterministico")}</Badge>;
}

export function TotalsLine({ plan }: { plan: Plan }) {
  const c = plan.totals.cost;
  return (
    <div className="totals" aria-label={tx("Riepilogo numerico")}>
      <div><span className="k">{tx("Durata")}</span><span className="v">{tx(fmtDuration(plan.totals.durationMin))}</span></div>
      <div><span className="k">{tx("Rientro")}</span><span className="v">{tx(hhmm(plan.totals.endsAt))}</span></div>
      <div><span className="k">{tx("A persona")}</span><span className="v"><Cost min={c.perPersonMin} max={c.perPersonMax} unknown={c.unknownEssential} /></span></div>
      <div><span className="k">{tx("Gruppo")}</span><span className="v"><Cost min={c.min} max={c.max} /></span></div>
      <div><span className="k">{tx("A piedi")}</span><span className="v">{tx((plan.totals.walkM / 1000).toFixed(1))}{tx(" km")}</span></div>
      <div><span className="k">{tx("Salita")}</span><span className="v">{tx(plan.totals.ascentM)}{tx(" m")}</span></div>
    </div>
  );
}

export function LegLine({ leg }: { leg: RouteLeg }) {
  if (leg.mode === 'wait') return <li className="leg wait">{tx(MODE_ICON.wait)}{tx(" Attesa ")}{tx(Math.round(leg.durationMin))}{tx(" min a ")}{tx(leg.from.label)}</li>;
  const r = leg.transit?.[0];
  return (
    <li className={`leg leg-${leg.mode}`}>
      <span className="leg-time">{tx(hhmm(leg.departure))}–{tx(hhmm(leg.arrival))}</span>
      <span className="leg-icon" aria-hidden>{tx(MODE_ICON[leg.mode] ?? '•')}</span>
      <span className="leg-text">
        {r ? <><strong>{tx(MODE[leg.mode])} {tx(r.routeShort)}</strong>{tx(" direzione ")}{tx(r.headsign)}{tx(": da ")}{tx(leg.from.label)}{tx(" a ")}{tx(leg.to.label)}{r.frequencyBased ? <em>{tx(" (cadenza, orario indicativo)")}</em> : null}</>
          : <><strong>{tx(MODE[leg.mode])}</strong> {tx((leg.distanceM / 1000).toFixed(leg.distanceM < 1000 ? 2 : 1))}{tx(" km")}{tx(leg.ascentM ? ` · +${leg.ascentM} m` : '')}{leg.streets?.length ? <span className="muted"> · {tx(leg.streets.slice(0, 3).join(', '))}</span> : null}</>}
        {leg.flags.stairs ? <Badge kind="warn">{tx("scale")}</Badge> : null}
        {leg.flags.trail ? <Badge kind="warn">{tx("sentiero")}</Badge> : null}
        {leg.notes.length ? <span className="leg-notes">{tx(leg.notes.join(' '))}</span> : null}
      </span>
    </li>
  );
}

export function TripBlock({ trip, label }: { trip: Trip; label?: string }) {
  return (
    <div className="trip">
      <div className="trip-head"><span>{tx(label ?? trip.summary.label)}</span><span className="muted">{tx(fmtDuration(trip.summary.durationMin))}{trip.cost.length ? <> · <Cost min={sum(trip.cost, 'min')} max={sum(trip.cost, 'max')} /></> : null}</span></div>
      <ul className="legs">{trip.legs.map((l) => <LegLine key={l.id} leg={l} />)}</ul>
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
      <div className="stop-n" aria-hidden>{tx(n)}</div>
      <div className="stop-body">
        <div className="stop-head">
          <button className="stop-name link" onClick={() => stop.placeId && set({ placeCard: stop.placeId })}>{tx(stop.name)}</button>
          {stop.locked ? <Badge kind="info">{tx("🔒 prenotato")}</Badge> : null}
        </div>
        <div className="stop-meta">
          <span>{tx(hhmm(stop.start))}–{tx(hhmm(stop.end))}</span> · <span>{tx(CATEGORY[stop.category] ?? stop.category)}</span>
          {stop.cost.length ? <> · <Cost min={sum(stop.cost, 'min')} max={sum(stop.cost, 'max')} unknown={stop.cost.filter((c) => c.min == null && c.essential).length || undefined} /></> : null}
        </div>
        {stop.reasons.length ? <div className="stop-reasons">{tx(stop.reasons[0])}</div> : null}
        {nonOk.map((c) => <div key={c.id} className={`check-line ${c.status}`}>{tx(c.status === 'violated' ? '✗' : '?')} {tx(c.detail)}</div>)}
      </div>
    </div>
  );
}

export default function PlanDetail({ plan }: { plan: Plan; compact?: boolean }) {
  const t = useSim((s) => s.t);
  const view = useApp((s) => s.view);
  const ret = plan.trips.length > plan.stops.length ? plan.trips[plan.trips.length - 1] : null;
  const currentStop = view === 'sim' ? plan.stops.findIndex((s) => Date.parse(s.arrival) <= t && Date.parse(s.departure) > t) : -1;
  const toCheck = plan.checks.filter((c) => c.status !== 'ok').length;
  return (
    <div className="plan-detail">
      {plan.hypothetical?.length ? <div className="notice info">{tx("Ipotesi: ")}{tx(plan.hypothetical.join(' · '))}{tx(". Non è una notizia reale.")}</div> : null}
      {plan.aiNote ? <div className="notice info">{tx(plan.aiNote)}</div> : null}
      {plan.whyThis.length ? <p className="why">{tx(plan.whyThis.slice(0, 2).join(' · '))}</p> : null}
      <div className="itinerary">
        {plan.stops.map((s, i) => (
          <div key={s.id}>
            <TripBlock trip={plan.trips[i]} />
            <StopBlock stop={s} n={i + 1} current={i === currentStop} />
            {plan.decisions.filter((d) => d.afterStop === i).map((d) => <div key={d.id} className={`decision-mark ${d.chosen ? 'chosen' : ''}`}>◆ {tx(d.prompt)}{tx(d.chosen ? ` — ${d.options.find((o) => o.id === d.chosen)?.label ?? d.chosen}` : '')}</div>)}
          </div>
        ))}
        {ret ? <TripBlock trip={ret} label={`Rientro: ${ret.summary.label}`} /> : null}
      </div>
      <details className="more">
        <summary>{tx("Verifiche ")}<span className="muted">· {tx(toCheck ? `${toCheck} da controllare` : 'tutto in ordine')}</span></summary>
        <ul className="checks">
          {[...plan.checks].sort((a, b) => order(a.status) - order(b.status)).map((c) => <li key={c.id} className={c.status}><span className="check-icon">{tx(c.status === 'ok' ? '✓' : c.status === 'violated' ? '✗' : '?')}</span> <strong>{tx(c.label)}:</strong> {tx(c.detail)}</li>)}
        </ul>
        {plan.tradeoffs.length ? <p className="tradeoffs">{tx("Compromessi: ")}{tx(plan.tradeoffs.join(' · '))}</p> : null}
        {plan.missing.length ? <p className="missing">{tx("Mancano: ")}{tx(plan.missing.join(' · '))}</p> : null}
        <div className="snapshot muted">{tx("Dati: catalogo ")}{tx(plan.snapshot.catalogVersion)}{tx(" · orario ")}{tx(plan.snapshot.transitFeed)}{tx(" · calcolato ")}{tx(new Date(plan.snapshot.computedAt).toLocaleString(getLocale()))}</div>
      </details>
    </div>
  );
}

function order(s: string) { return s === 'violated' ? 0 : s === 'uncertain' ? 1 : 2; }
export { EvidenceBadge, fmtRange };
