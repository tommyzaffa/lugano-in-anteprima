import { tx, getLocale } from '../locale.ts';
import { useEffect, useMemo, useState } from 'react';
import { useApp, useSim } from '../store.ts';
import { buildTimeline, stateAt } from '../../shared/simulation.ts';
import { hhmm } from '../../shared/time.ts';
import { fmtRange } from '../../shared/pricing.ts';
import { requestChange, applyPending, switchBranch, chooseDecision, play } from '../sim/actions.ts';
import { Modal, Spinner } from './common.tsx';
import type { Plan, PlanDiff } from '../../shared/types.ts';
import { PlanTitle } from './Results.tsx';

export default function SimPanel() {
  const plan = useApp((s) => s.branches.find((b) => b.id === s.currentBranch)?.plan ?? null);
  const branches = useApp((s) => s.branches);
  const current = useApp((s) => s.currentBranch);
  const pending = useApp((s) => s.pending);
  const set = useApp((s) => s.set);
  const t = useSim((s) => s.t);
  const tl = useMemo(() => (plan ? buildTimeline(plan) : null), [plan]);
  const [menu, setMenu] = useState(false);
  const st = tl ? stateAt(tl, t) : null;
  // su telefono una decisione apre il foglio: le opzioni devono vedersi senza cercarle
  const deciding = !!st?.pendingDecision;
  useEffect(() => { if ((deciding || menu) && useApp.getState().sheet === 'peek') set({ sheet: 'half' }); }, [deciding, menu, set]);
  if (!plan || !tl || !st) return null;
  const futureStops = plan.stops.filter((s) => Date.parse(s.start) > t);
  const curStop = st.stopIndex != null && (st.scene === 'activity' || st.scene === 'wait' || st.scene === 'pause') ? plan.stops[st.stopIndex] : null;
  const next = futureStops[0];

  return (
    <div className="sim-panel">
      <div className="sim-title"><h2><PlanTitle title={tx(plan.title)} /></h2></div>

      {tx(st.pendingDecision ? (
        <div className="decision-box" role="alertdialog" aria-labelledby="dec-t">
          <h3 id="dec-t">{tx(st.pendingDecision.prompt)}</h3>
          {st.pendingDecision.options.map((o) => (
            <button key={o.id} className="decision-opt" onClick={() => chooseDecision(st.pendingDecision!, o.id)}>
              <strong>{tx(o.label)}</strong><span>{tx(o.detail)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="now-card">
          <span className="now-k">{tx(st.finished ? 'Fine della giornata' : 'Adesso')}</span>
          <span className="now-what">{tx(st.label)}</span>
          {next && !st.finished ? <span className="now-next">{tx("Poi: ")}{tx(hhmm(next.start))} · {tx(next.name)}</span> : null}
          <span className="now-next muted">{tx("Spesi finora: ")}{tx(fmtRange(st.spent.min, st.spent.max))}{tx(st.spent.unknown ? ' + ?' : '')}</span>
          <div className="now-row">
            {curStop ? <button className="btn-ghost" onClick={() => requestChange({ kind: 'extend', minutes: 30, stopId: curStop.id })}>{tx("+30 min qui")}</button> : null}
            <button className="btn-ghost" onClick={() => setMenu(!menu)} aria-expanded={menu} data-focus-return>{tx("Cambia idea")}</button>
          </div>
        </div>
      ))}
      {menu ? <ChangeMenu plan={plan} curStopId={curStop?.id} nextStopId={next?.id} futureStops={futureStops} onClose={() => setMenu(false)} /> : null}

      <ol className="stop-list" aria-label={tx("Tappe")}>
        {plan.stops.map((s, i) => {
          const done = Date.parse(s.end) <= t;
          const cur = curStop?.id === s.id;
          return (
            <li key={s.id} className={cur ? 'current' : done ? 'done' : ''}>
              <span className="t">{tx(hhmm(s.start))}</span>
              <span className="n" aria-hidden>{tx(done ? '✓' : i + 1)}</span>
              <button onClick={() => s.placeId && set({ placeCard: s.placeId })}>{tx(s.name)}</button>
            </li>
          );
        })}
      </ol>

      {tx(branches.length > 1 ? (
        <details className="more branches">
          <summary>{tx("Versioni ")}<span className="muted">· {tx(branches.length)}</span></summary>
          <ul>
            {branches.map((b) => (
              <li key={b.id} className={b.id === current ? 'current' : ''}>
                <button className="link" onClick={() => switchBranch(b.id)} aria-current={b.id === current}>{tx(b.label)}</button>
                <span className="muted">{tx(" · rientro ")}{tx(hhmm(b.plan.totals.endsAt))}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null)}

      {pending ? <PendingDialog /> : null}
    </div>
  );
}

function ChangeMenu({ plan, curStopId, nextStopId, futureStops, onClose }: { plan: Plan; curStopId?: string; nextStopId?: string; futureStops: { id: string; name: string; locked: boolean }[]; onClose: () => void }) {
  const [more, setMore] = useState(false);
  const [stop, setStop] = useState(futureStops[0]?.id ?? '');
  const [budget, setBudget] = useState('');
  const [endTime, setEndTime] = useState('');
  const run = (d: Parameters<typeof requestChange>[0]) => { onClose(); void requestChange(d); };
  const nextName = futureStops[0]?.name;
  return (
    <div className="change-menu" role="group" aria-label={tx("Cambia idea")}>
      {nextStopId ? <button onClick={() => run({ kind: 'skip', stopId: nextStopId })}><span className="ci" aria-hidden>⏭</span>{tx("Saltiamo ")}{tx(nextName)}</button> : null}
      {nextStopId ? <button onClick={() => run({ kind: 'replace', stopId: nextStopId })}><span className="ci" aria-hidden>🔄</span>{tx("Al posto di ")}{tx(nextName)}…</button> : null}
      <button onClick={() => run({ kind: 'add_pause', minutes: 20 })}><span className="ci" aria-hidden>☕</span>{tx("Una pausa")}</button>
      <button onClick={() => run({ kind: 'less_walking' })}><span className="ci" aria-hidden>🚶</span>{tx("Meno cammino")}</button>
      <button onClick={() => run({ kind: 'whatif_rain' })}><span className="ci" aria-hidden>☂</span>{tx("E se piove?")}</button>
      <button onClick={() => setMore(!more)} aria-expanded={more}><span className="ci" aria-hidden>⋯</span>{tx("Altro")}</button>
      {tx(more ? (
        <div className="cm-extra">
          <div className="row">
            <select value={stop} onChange={(e) => setStop(e.target.value)} aria-label={tx("Tappa")}>{futureStops.map((s) => <option key={s.id} value={s.id}>{tx(s.name)}{tx(s.locked ? ' 🔒' : '')}</option>)}</select>
            <button className="btn-ghost" disabled={!stop} onClick={() => run({ kind: 'lock', stopId: stop })}>{tx("Blocca")}</button>
            <button className="btn-ghost" disabled={!stop} onClick={() => run({ kind: 'whatif_unavailable', stopId: stop })}>{tx("E se è chiusa?")}</button>
          </div>
          <div className="row">
            <input type="number" min={0} placeholder={tx(`budget residuo CHF ${plan.request.budget.per === 'group' ? 'totale' : 'a persona'}`)} value={budget} onChange={(e) => setBudget(e.target.value)} aria-label={tx("Nuovo budget residuo")} />
            <button className="btn-ghost" disabled={budget === ''} onClick={() => run({ kind: 'reduce_budget', budget: Number(budget) })}>{tx("Riduci budget")}</button>
          </div>
          <div className="row">
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label={tx("Nuovo orario di rientro")} />
            <button className="btn-ghost" disabled={!endTime} onClick={() => run({ kind: 'change_return', endTime })}>{tx("Cambia rientro")}</button>
          </div>
          <div className="row wrap">
            <button className="btn-ghost" onClick={() => run({ kind: 'indoor' })}>{tx("Solo al coperto")}</button>
            <button className="btn-ghost" onClick={() => run({ kind: 'whatif_missed_bus' })}>{tx("E se perdiamo la corsa?")}</button>
            {curStopId ? <button className="btn-ghost" onClick={() => run({ kind: 'whatif_stay_30' })}>{tx("E se restiamo di più?")}</button> : null}
          </div>
        </div>
      ) : null)}
    </div>
  );
}

export function DiffLine({ diff }: { diff: PlanDiff }) {
  const parts: string[] = [];
  if (diff.endTimeDeltaMin) parts.push(`rientro ${diff.endTimeDeltaMin > 0 ? '+' : ''}${diff.endTimeDeltaMin} min`);
  if (Math.abs(diff.costDeltaMax) >= 0.5) parts.push(`${diff.costDeltaMax > 0 ? '+' : ''}${Math.round(diff.costDeltaMax)} CHF`);
  if (Math.abs(diff.walkDeltaM) >= 100) parts.push(`${diff.walkDeltaM > 0 ? '+' : ''}${(diff.walkDeltaM / 1000).toFixed(1)} km a piedi`);
  if (diff.added.length) parts.push(`+ ${diff.added.join(', ')}`);
  if (diff.removed.length) parts.push(`− ${diff.removed.join(', ')}`);
  return <span className="diff-line">{tx(parts.join(' · ') || 'nessuna differenza rilevante')}</span>;
}

function PendingDialog() {
  const pending = useApp((s) => s.pending)!;
  const set = useApp((s) => s.set);
  const before = useApp((s) => s.plan());
  const loading = !pending.plan && pending.explanation[0]?.includes('corso');
  return (
    <Modal title={tx(pending.label)} onClose={() => set({ pending: null })}>
      {pending.hypothetical ? <p className="hint">{tx("Scenario ipotetico: non è una notizia reale.")}</p> : null}
      {loading ? <p><Spinner />{tx(" Ricalcolo il resto della giornata…")}</p> : null}
      <ul className="explain">{pending.explanation.filter((e) => !e.includes('corso')).map((e, i) => <li key={i}>{tx(e)}</li>)}</ul>
      {tx(pending.plan && pending.diff && before ? (
        <>
          <p><DiffLine diff={pending.diff} /></p>
          <BranchCompare a={before} b={pending.plan} />
          {pending.diff.lostConnections.length ? <div className="notice warn">{tx("Coincidenze perse: ")}{tx(pending.diff.lostConnections.join('; '))}</div> : null}
          <div className="row">
            <button className="btn primary" onClick={() => { applyPending(); play(); }}>{tx("Va bene, continuiamo")}</button>
            <button className="btn-ghost" onClick={() => set({ pending: null })}>{tx("Annulla")}</button>
          </div>
        </>
      ) : !loading ? (
        <div className="row"><button className="btn-ghost" onClick={() => set({ pending: null })}>{tx("Chiudi")}</button></div>
      ) : null)}
    </Modal>
  );
}

export function BranchCompare({ a, b }: { a: Plan; b: Plan }) {
  const rows: [string, string, string][] = [
    ['Tappe', a.stops.map((s) => s.name).join(' → '), b.stops.map((s) => s.name).join(' → ')],
    ['Rientro', hhmm(a.totals.endsAt), hhmm(b.totals.endsAt)],
    ['A persona', fmtRange(a.totals.cost.perPersonMin, a.totals.cost.perPersonMax), fmtRange(b.totals.cost.perPersonMin, b.totals.cost.perPersonMax)],
    ['A piedi', `${(a.totals.walkM / 1000).toFixed(1)} km`, `${(b.totals.walkM / 1000).toFixed(1)} km`],
  ];
  return (
    <div className="table-wrap">
      <table className="branch-compare">
        <thead><tr><th scope="col"></th><th scope="col">{tx("Prima")}</th><th scope="col">{tx("Dopo")}</th></tr></thead>
        <tbody>{rows.map(([k, x, y]) => <tr key={k} className={x !== y ? 'changed' : ''}><th scope="row">{tx(k)}</th><td>{tx(x)}</td><td>{tx(y)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
