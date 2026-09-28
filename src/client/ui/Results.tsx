import { useState } from 'react';
import { useApp } from '../store.ts';
import PlanDetail, { FeasibilityBadge, SourceBadge, TotalsLine } from './PlanDetail.tsx';
import { hhmm, fmtDuration } from '../../shared/time.ts';
import { fmtRange } from '../../shared/pricing.ts';
import { avatarSvg } from '../map/avatars.ts';

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
        <h2>{alts.length} {alts.length === 1 ? "proposta" : "proposte"}</h2>
        <button className="btn-ghost" onClick={() => set({ view: 'wizard' })}>Modifica richiesta</button>
      </div>
      {result.understood.length ? <div className="understood"><strong>Abbiamo capito:</strong> {result.understood.join(' · ')}</div> : null}
      {result.notices.length ? <ul className="notices">{result.notices.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
      <div className="alt-cards" role="list">
        {alts.map((p, i) => (
          <article key={p.id} role="listitem" className={`alt-card ${i === selected ? 'selected' : ''}`} onMouseEnter={() => set({ selected: i })} onFocus={() => set({ selected: i })} tabIndex={0} aria-label={`Proposta ${i + 1}: ${p.title}`}>
            <div className="alt-top"><span className="alt-letter">{String.fromCharCode(65 + i)}</span><h3>{p.title}</h3></div>
            <div className="alt-badges"><FeasibilityBadge plan={p} /> <SourceBadge plan={p} /></div>
            <p className="alt-summary">{p.summary}</p>
            <ol className="alt-stops">{p.stops.map((s) => <li key={s.id}><span className="muted">{hhmm(s.start)}</span> {s.name}</li>)}</ol>
            <TotalsLine plan={p} />
            {p.tradeoffs.length ? <p className="alt-trade">{p.tradeoffs.slice(0, 3).join(' · ')}</p> : null}
            <div className="alt-actions">
              <button className="btn primary" onClick={() => start(i)}>Scegli e simula</button>
              <button className="btn-ghost" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>{open === i ? 'Nascondi dettagli' : 'Dettagli e verifiche'}</button>
            </div>
            {open === i ? <PlanDetail plan={p} /> : null}
          </article>
        ))}
      </div>
      {alts.length > 1 ? (
        <div className="compare">
          <h3>Confronto</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col"></th>{alts.map((p, i) => <th key={p.id} scope="col">{String.fromCharCode(65 + i)}</th>)}</tr></thead>
              <tbody>
                <tr><th scope="row">Tappe</th>{alts.map((p) => <td key={p.id}>{p.stops.length}</td>)}</tr>
                <tr><th scope="row">Durata</th>{alts.map((p) => <td key={p.id}>{fmtDuration(p.totals.durationMin)}</td>)}</tr>
                <tr><th scope="row">Rientro</th>{alts.map((p) => <td key={p.id}>{hhmm(p.totals.endsAt)}</td>)}</tr>
                <tr><th scope="row">Spesa a persona</th>{alts.map((p) => <td key={p.id}>{fmtRange(p.totals.cost.perPersonMin, p.totals.cost.perPersonMax)}{p.totals.cost.unknownEssential ? ' + ?' : ''}</td>)}</tr>
                <tr><th scope="row">A piedi</th>{alts.map((p) => <td key={p.id}>{(p.totals.walkM / 1000).toFixed(1)} km</td>)}</tr>
                <tr><th scope="row">Salita</th>{alts.map((p) => <td key={p.id}>{p.totals.ascentM} m</td>)}</tr>
                <tr><th scope="row">Mezzi</th>{alts.map((p) => <td key={p.id}>{p.totals.transitRides}</td>)}</tr>
                <tr><th scope="row">Dati da verificare</th>{alts.map((p) => <td key={p.id}>{p.checks.filter((c) => c.status !== 'ok').length}</td>)}</tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      <div className="group-preview" aria-hidden>{alts[0]?.request.people.map((p) => <span key={p.id} dangerouslySetInnerHTML={{ __html: avatarSvg(p, 30) }} />)}</div>
    </div>
  );
}
