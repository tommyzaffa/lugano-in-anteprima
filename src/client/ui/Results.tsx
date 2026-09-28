import { useState } from 'react';
import { useApp } from '../store.ts';
import PlanDetail from './PlanDetail.tsx';
import { hhmm, fmtDuration } from '../../shared/time.ts';
import { fmtRange } from '../../shared/pricing.ts';
import { weatherWindow } from '../../shared/weather.ts';
import type { Plan } from '../../shared/types.ts';

export default function Results() {
  const result = useApp((s) => s.result);
  const selected = useApp((s) => s.selected);
  const set = useApp((s) => s.set);
  const start = useApp((s) => s.startSimulation);
  const [open, setOpen] = useState<number | null>(null);
  if (!result) return null;
  const alts = result.alternatives;
  return (
    <div className="results">
      <div className="results-head">
        <h2>{alts.length === 1 ? 'Un\'idea per voi' : `${alts.length} idee per voi`}</h2>
        <button className="link" onClick={() => set({ view: 'wizard' })}>Cambia richiesta</button>
      </div>
      {result.understood.length ? <p className="understood">Abbiamo capito: {result.understood.join(' · ')}</p> : null}
      <ul className="alt-cards">
        {alts.map((p, i) => (
          <li key={p.id} className={`alt-card ${i === selected ? 'selected' : ''}`} onMouseEnter={() => set({ selected: i })} onFocus={() => set({ selected: i })} aria-label={`Idea ${String.fromCharCode(65 + i)}: ${p.title}`}>
            <div className="alt-top"><span className="alt-letter" aria-hidden>{String.fromCharCode(65 + i)}</span><h3><PlanTitle title={p.title} /></h3></div>
            <ol className="alt-stops">{p.stops.map((s) => <li key={s.id}><span className="t">{hhmm(s.start)}</span><span className="dot" aria-hidden /><span>{s.name}</span></li>)}</ol>
            <PlanStats plan={p} />
            {p.feasibility !== 'valid' ? <p className="alt-flag">⚠ {p.checks.filter((c) => c.status !== 'ok').length || 1} {p.checks.filter((c) => c.status !== 'ok').length === 1 ? 'dato' : 'dati'} da verificare</p> : null}
            <div className="alt-actions">
              <button className="btn primary" onClick={() => start(i)}>Prova questa giornata</button>
              <button className="btn-ghost" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>{open === i ? 'Chiudi' : 'Dettagli'}</button>
            </div>
            {open === i ? <PlanDetail plan={p} /> : null}
          </li>
        ))}
      </ul>
      {result.notices.length ? (
        <details className="more">
          <summary>Note <span className="muted">· {result.notices.length}</span></summary>
          <ul className="notices">{result.notices.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

/** Titolo in due parti: il tema («Lago e borghi») come occhiello, le tappe principali come titolo. */
export function PlanTitle({ title }: { title: string }) {
  const i = title.indexOf(': ');
  if (i < 0) return <>{title}</>;
  return <><span className="kicker">{title.slice(0, i)}</span>{title.slice(i + 2)}</>;
}

/** Tre numeri e il meteo: durata, cammino, spesa a persona. */
export function PlanStats({ plan }: { plan: Plan }) {
  const c = plan.totals.cost;
  const w = weatherWindow(plan.snapshot.weather, Date.parse(plan.totals.startsAt), Date.parse(plan.totals.endsAt));
  return (
    <div className="alt-stats">
      <span className="pill-stat" title="Durata">⏱ {fmtDuration(plan.totals.durationMin)}</span>
      <span className="pill-stat" title="A piedi">🚶 {(plan.totals.walkM / 1000).toFixed(1)} km{plan.totals.ascentM >= 80 ? ` · ↗ ${plan.totals.ascentM} m` : ''}</span>
      <span className="pill-stat" title="Spesa stimata a persona">{c.perPersonMax === 0 && !c.unknownEssential ? 'gratis' : `CHF ${c.perPersonMin == null ? '?' : fmtRange(c.perPersonMin, c.perPersonMax).replace(/^CHF\s*/, '')}${c.unknownEssential ? ' + ?' : ''}`} <span className="muted">a pers.</span></span>
      {w ? <span className="weather-chip" title={plan.snapshot.weather?.status === 'demo' ? 'Meteo dimostrativo' : 'Previsione MeteoSvizzera (Open-Meteo)'}>{w.icon} {w.minC != null ? `${w.minC === w.maxC ? w.maxC : `${w.minC}–${w.maxC}`}°` : w.label}</span> : null}
    </div>
  );
}
