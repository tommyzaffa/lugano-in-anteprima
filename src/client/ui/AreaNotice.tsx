import { tx } from '../locale.ts';
import { useApp } from '../store.ts';
import { runPlanning } from './planning-actions.ts';

export default function AreaNotice() {
  const advice = useApp((s) => s.result?.areaAdvice);
  if (!advice) return null;
  return <section className="notice area-notice" aria-label={tx('Disponibilità nella zona')}>
    <strong>{advice.label} · {advice.radiusKm} km</strong>
    <p>{tx(!advice.activities ? 'Nessuna attività compatibile nella zona e negli orari scelti.' : !advice.events ? 'Non risultano eventi compatibili nella zona e negli orari scelti. Potete comunque visitare i luoghi disponibili.' : 'Le attività sono nella zona scelta.')}</p>
    {!!advice.alternatives.length && <details open={!advice.activities}>
      <summary>{tx('Alternative nelle zone vicine')}</summary>
      <div className="row wrap">{advice.alternatives.map((a) => <button key={a.label} className="btn-ghost" onClick={() => void runPlanning(false, { area: a.area })}>{a.label} · {a.distanceKm} km</button>)}</div>
      <small>{tx('Distanze in linea d’aria dalla zona scelta all’attività più vicina. I collegamenti saranno verificati quando scegliete un’alternativa.')}</small>
    </details>}
  </section>;
}
