import { useApp } from '../store.ts';
import { cancelPlanning, resolveContradiction, runPlanning } from './planning-actions.ts';
import { Spinner } from './common.tsx';

export default function Planning() {
  const progress = useApp((s) => s.progress);
  const contradictions = useApp((s) => s.contradictions);
  const infeasible = useApp((s) => s.infeasible);
  const error = useApp((s) => s.planError);
  const result = useApp((s) => s.result);
  const set = useApp((s) => s.set);
  const online = useApp((s) => s.online);

  if (contradictions?.length) {
    return (
      <div className="planning">
        <h2>Una cosa da chiarire</h2>
        <p className="hint">Il testo libero dice qualcosa di diverso dal modulo. Scegliete voi: non cambiamo nulla di nascosto.</p>
        {contradictions.map((c) => (
          <div key={c.id} className="contradiction">
            <p><strong>{c.message}</strong></p>
            <div className="cmp"><div><span className="muted">Modulo</span><br />{c.structured}</div><div><span className="muted">Testo</span><br />{c.fromText}</div></div>
            <div className="row wrap">{c.options.map((o) => <button key={o.id} className={o.id === 'keep_form' ? 'btn-ghost' : 'btn'} onClick={() => resolveContradiction(c.id, o.id)}>{o.label}</button>)}</div>
          </div>
        ))}
      </div>
    );
  }
  if (infeasible) {
    return (
      <div className="planning">
        <h2>Nessun programma rispetta tutti i vincoli</h2>
        <p className="hint">Non vi proponiamo un piano che sembri valido senza esserlo. Ecco cosa lo impedisce:</p>
        <ul className="reasons">{infeasible.reasons.map((r, i) => <li key={i}>{r.message}</li>)}</ul>
        {result?.notices?.length ? <ul className="notices">{result.notices.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
        <h3>Modifiche possibili</h3>
        <p className="hint">Nessuna viene applicata senza la vostra scelta.</p>
        <div className="suggestions">
          {infeasible.suggestions.map((s) => <button key={s.id} className="btn-ghost" onClick={() => void runPlanning(false, s.patch)}>{s.label}</button>)}
          <button className="btn-ghost" onClick={() => set({ view: 'wizard', wizardStep: 0, infeasible: null })}>Torna al modulo</button>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="planning">
        <h2>Qualcosa non ha funzionato</h2>
        <div className="notice bad" role="alert">{error}</div>
        {!online ? <p className="hint">Sembra che la rete non sia disponibile.</p> : null}
        <div className="row"><button className="btn" onClick={() => void runPlanning(false)}>Riprova</button><button className="btn-ghost" onClick={() => set({ view: 'wizard' })}>Torna al modulo</button></div>
      </div>
    );
  }
  return (
    <div className="planning" aria-busy="true">
      <h2>Prepariamo le proposte</h2>
      <ol className="progress-list" aria-live="polite">
        {progress.map((p, i) => <li key={i} className={i === progress.length - 1 ? 'current' : 'done'}>{i === progress.length - 1 ? <Spinner /> : '✓'} {p}</li>)}
        {!progress.length ? <li className="current"><Spinner /> Invio della richiesta…</li> : null}
      </ol>
      <p className="hint">Il motore verifica aperture, ultimo ingresso, coincidenze reali, budget e rientro. Nessun ragionamento interno viene mostrato: solo motivazioni sintetiche e fonti.</p>
      <button className="btn-ghost" onClick={cancelPlanning}>Annulla</button>
    </div>
  );
}
