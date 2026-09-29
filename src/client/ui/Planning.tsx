import { tx, getLocale } from '../locale.ts';
import AreaNotice from './AreaNotice.tsx';
import { useEffect, useState } from 'react';
import { useApp } from '../store.ts';
import { cancelPlanning, resolveContradiction, runPlanning } from './planning-actions.ts';
import { PAWN_COLORS } from '../map/avatars.ts';

export default function Planning() {
  const progress = useApp((s) => s.progress);
  const contradictions = useApp((s) => s.contradictions);
  const infeasible = useApp((s) => s.infeasible);
  const error = useApp((s) => s.planError);
  const result = useApp((s) => s.result);
  const set = useApp((s) => s.set);
  const online = useApp((s) => s.online);
  const slow = useSlow(!contradictions?.length && !infeasible && !error);

  if (contradictions?.length) {
    return (
      <div className="planning">
        <h2>{tx("Una cosa da chiarire")}</h2>
        {contradictions.map((c) => (
          <div key={c.id} className="contradiction">
            <p><strong>{tx(c.message)}</strong></p>
            <div className="cmp"><div><span className="muted">{tx("Modulo")}</span><br />{tx(c.structured)}</div><div><span className="muted">{tx("Testo")}</span><br />{tx(c.fromText)}</div></div>
            <div className="row wrap">{c.options.map((o) => <button key={o.id} className={o.id === 'keep_form' ? 'btn-ghost' : 'btn'} onClick={() => resolveContradiction(c.id, o.id)}>{tx(o.label)}</button>)}</div>
          </div>
        ))}
      </div>
    );
  }
  if (infeasible) {
    return (
      <div className="planning">
        <h2>{tx("Così non ci sta")}</h2>
        <AreaNotice />
        <ul className="reasons">{infeasible.reasons.map((r, i) => <li key={i}>{tx(r.message)}</li>)}</ul>
        {result?.notices?.length ? <ul className="notices">{result.notices.map((n, i) => <li key={i}>{tx(n)}</li>)}</ul> : null}
        <span className="label">{tx("Provate così:")}</span>
        <div className="suggestions">
          {infeasible.suggestions.map((s) => <button key={s.id} className="btn-ghost" onClick={() => void runPlanning(false, s.patch)}>{tx(s.label)}</button>)}
          <button className="btn-ghost" onClick={() => set({ view: 'wizard', wizardStep: 0, infeasible: null })}>{tx("Cambia la richiesta")}</button>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="planning">
        <h2>{tx("Qualcosa non ha funzionato")}</h2>
        <div className="notice bad" role="alert">{tx(error)}</div>
        {!online ? <p className="hint">{tx("Sembra che la rete non sia disponibile.")}</p> : null}
        <div className="row"><button className="btn primary" onClick={() => void runPlanning(false)}>{tx("Riprova")}</button><button className="btn-ghost" onClick={() => set({ view: 'wizard' })}>{tx("Cambia la richiesta")}</button></div>
      </div>
    );
  }
  const last = progress[progress.length - 1];
  return (
    <div className="planning" aria-busy="true">
      <div className="planning-art" aria-hidden>
        <svg viewBox="0 0 320 120" fill="none" stroke="#2a2622" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 92 C60 60 90 50 130 58 C170 66 190 40 230 34 C260 30 285 44 310 40" strokeWidth="1.6" opacity=".35" />
          <path className="route" d="M20 104 C70 96 100 110 150 94 C200 78 220 88 270 70 C290 62 300 56 306 50" stroke="#c24a31" strokeWidth="3" />
          <circle cx="306" cy="50" r="6" fill="#c24a31" strokeWidth="1.8" />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${60 + i * 26} ${76 + (i % 2) * 6}) scale(.62)`} strokeWidth="2">
              <g className={`bob b${i + 1}`}>
                <path d="M6 39.5 Q16 43 26 39.5 L25 35.5 Q16 38 7 35.5 Z" fill={PAWN_COLORS[i]} />
                <path d="M9 35.5 Q10.5 24 13 19.5 L19 19.5 Q21.5 24 23 35.5 Q16 37.5 9 35.5 Z" fill={PAWN_COLORS[i]} />
                <circle cx="16" cy="11.5" r="7" fill={PAWN_COLORS[i]} />
              </g>
            </g>
          ))}
        </svg>
      </div>
      <p className="planning-status" role="status" aria-live="polite">{tx(last ?? 'Preparo le proposte…')}</p>
      {slow ? <p className="hint" style={{ textAlign: 'center' }}>{tx("Il server della demo è lento: può volerci fino a mezzo minuto.")}</p> : null}
      <div className="row" style={{ justifyContent: 'center' }}><button className="btn-ghost" onClick={cancelPlanning}>{tx("Annulla")}</button></div>
    </div>
  );
}

/** Vero dopo 8 secondi di attesa continua (server lento o appena riattivato). */
function useSlow(waiting: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!waiting) return;
    const id = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(id);
  }, [waiting]);
  return slow;
}
