import { useMemo, useState } from 'react';
import { useApp, useSim } from '../store.ts';
import { buildTimeline, stateAt } from '../../shared/simulation.ts';
import { hhmm, fmtDuration } from '../../shared/time.ts';
import { fmtRange } from '../../shared/pricing.ts';
import PlanDetail, { FeasibilityBadge, SourceBadge, TotalsLine } from './PlanDetail.tsx';
import { requestChange, applyPending, switchBranch, chooseDecision, play } from '../sim/actions.ts';
import { Badge, Modal, Spinner } from './common.tsx';
import { SaveShareButtons } from './SaveShare.tsx';
import type { PlanDiff } from '../../shared/types.ts';

export default function SimPanel() {
  const plan = useApp((s) => s.branches.find((b) => b.id === s.currentBranch)?.plan ?? null);
  const branches = useApp((s) => s.branches);
  const current = useApp((s) => s.currentBranch);
  const compare = useApp((s) => s.compareBranch);
  const pending = useApp((s) => s.pending);
  const set = useApp((s) => s.set);
  const t = useSim((s) => s.t);
  const tl = useMemo(() => (plan ? buildTimeline(plan) : null), [plan]);
  const [menu, setMenu] = useState(false);
  if (!plan || !tl) return null;
  const st = stateAt(tl, t);
  const futureStops = plan.stops.filter((s) => Date.parse(s.departure) > t);
  const curStop = st.stopIndex != null && (st.scene === 'activity' || st.scene === 'wait' || st.scene === 'pause') ? plan.stops[st.stopIndex] : null;
  const cmpPlan = compare ? branches.find((b) => b.id === compare)?.plan : null;

  return (
    <div className="sim-panel">
      <div className="sim-title">
        <h2>{plan.title}</h2>
        <div className="alt-badges"><FeasibilityBadge plan={plan} /> <SourceBadge plan={plan} />{plan.hypothetical?.length ? <Badge kind="info">ipotesi</Badge> : null}</div>
      </div>

      {st.pendingDecision ? (
        <div className="decision-box" role="alertdialog" aria-labelledby="dec-t">
          <h3 id="dec-t">◆ {st.pendingDecision.prompt}</h3>
          <p className="hint">Entrambe le opzioni sono già verificate su orari e collegamenti.</p>
          {st.pendingDecision.options.map((o) => (
            <button key={o.id} className="decision-opt" onClick={() => chooseDecision(st.pendingDecision!, o.id)} onMouseEnter={() => o.plan && set({ compareBranch: null })}>
              <strong>{o.label}</strong><span>{o.detail}</span>
              {o.diff ? <DiffLine diff={o.diff} /> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="now">
        <div><span className="k">Ora simulata</span><span className="v">{hhmm(t)}</span></div>
        <div><span className="k">Tappe</span><span className="v">{st.completedStops}/{plan.stops.length}</span></div>
        <div><span className="k">Spesa maturata</span><span className="v">{fmtRange(st.spent.min, st.spent.max)}{st.spent.unknown ? ' + ?' : ''}</span></div>
      </div>
      <p className="fineprint">La spesa simulata non è un addebito: nessuna prenotazione o acquisto avviene facendo avanzare il gioco.</p>

      <div className="change-bar">
        <button className="btn" onClick={() => setMenu(!menu)} aria-expanded={menu}>Cambia idea…</button>
        {curStop ? <>
          <button className="btn-ghost" onClick={() => requestChange({ kind: 'extend', minutes: 15, stopId: curStop.id })}>+15 min</button>
          <button className="btn-ghost" onClick={() => requestChange({ kind: 'extend', minutes: 30, stopId: curStop.id })}>+30</button>
          <button className="btn-ghost" onClick={() => requestChange({ kind: 'extend', minutes: 60, stopId: curStop.id })}>+60</button>
        </> : null}
      </div>
      {menu ? <ChangeMenu futureStops={futureStops} onClose={() => setMenu(false)} /> : null}

      {branches.length > 1 ? (
        <div className="branches">
          <h3>Rami</h3>
          <ul>
            {branches.map((b) => (
              <li key={b.id} className={b.id === current ? 'current' : ''}>
                <button className="link" onClick={() => switchBranch(b.id)} aria-current={b.id === current}>{b.label}</button>
                <span className="muted"> · rientro {hhmm(b.plan.totals.endsAt)} · {fmtRange(b.plan.totals.cost.perPersonMin, b.plan.totals.cost.perPersonMax)} a pers.</span>
                {b.id !== current ? <button className="link" onClick={() => set({ compareBranch: compare === b.id ? null : b.id })}>{compare === b.id ? 'chiudi confronto' : 'confronta'}</button> : null}
              </li>
            ))}
          </ul>
          {cmpPlan ? <BranchCompare a={cmpPlan} b={plan} /> : null}
        </div>
      ) : null}

      <TotalsLine plan={plan} />
      <SaveShareButtons />
      <PlanDetail plan={plan} compact={false} />

      {pending ? <PendingDialog /> : null}
    </div>
  );
}

function ChangeMenu({ futureStops, onClose }: { futureStops: { id: string; name: string; placeId: string; locked: boolean }[]; onClose: () => void }) {
  const [stop, setStop] = useState(futureStops[0]?.id ?? '');
  const [budget, setBudget] = useState('');
  const [endTime, setEndTime] = useState('');
  const req = useApp((s) => s.plan()?.request);
  const run = (d: Parameters<typeof requestChange>[0]) => { onClose(); void requestChange(d); };
  return (
    <div className="change-menu">
      <div className="cm-group">
        <h4>Il programma</h4>
        <label>Tappa <select value={stop} onChange={(e) => setStop(e.target.value)}>{futureStops.map((s) => <option key={s.id} value={s.id}>{s.name}{s.locked ? ' 🔒' : ''}</option>)}</select></label>
        <div className="row wrap">
          <button className="btn-ghost" disabled={!stop} onClick={() => run({ kind: 'skip', stopId: stop })}>Salta</button>
          <button className="btn-ghost" disabled={!stop} onClick={() => run({ kind: 'replace', stopId: stop })}>Sostituisci</button>
          <button className="btn-ghost" disabled={!stop} onClick={() => run({ kind: 'lock', stopId: stop })}>Non voglio perderla (blocca)</button>
        </div>
        <div className="row wrap">
          <button className="btn-ghost" onClick={() => run({ kind: 'less_walking' })}>Meno cammino</button>
          <button className="btn-ghost" onClick={() => run({ kind: 'add_pause', minutes: 20 })}>Una pausa (20 min)</button>
          <button className="btn-ghost" onClick={() => run({ kind: 'indoor' })}>Solo al coperto</button>
        </div>
        <div className="row wrap">
          <input type="number" min={0} placeholder={`budget residuo CHF ${req?.budget.per === 'group' ? 'totale' : 'a persona'}`} value={budget} onChange={(e) => setBudget(e.target.value)} aria-label="Nuovo budget residuo" />
          <button className="btn-ghost" disabled={budget === ''} onClick={() => run({ kind: 'reduce_budget', budget: Number(budget) })}>Riduci budget</button>
        </div>
        <div className="row wrap">
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="Nuovo orario di rientro" />
          <button className="btn-ghost" disabled={!endTime} onClick={() => run({ kind: 'change_return', endTime })}>Cambia orario di rientro</button>
        </div>
      </div>
      <div className="cm-group whatif">
        <h4>E se… <span className="muted">(ipotesi, non notizie reali)</span></h4>
        <div className="row wrap">
          <button className="btn-ghost" onClick={() => run({ kind: 'whatif_missed_bus' })}>…perdiamo la prossima corsa</button>
          <button className="btn-ghost" onClick={() => run({ kind: 'whatif_stay_30' })}>…restiamo mezz'ora in più</button>
          <button className="btn-ghost" onClick={() => run({ kind: 'whatif_rain' })}>…piove</button>
          <button className="btn-ghost" disabled={!stop} onClick={() => run({ kind: 'whatif_unavailable', stopId: stop })}>…la tappa scelta non è disponibile</button>
        </div>
      </div>
    </div>
  );
}

export function DiffLine({ diff }: { diff: PlanDiff }) {
  const parts: string[] = [];
  if (diff.endTimeDeltaMin) parts.push(`rientro ${diff.endTimeDeltaMin > 0 ? '+' : ''}${diff.endTimeDeltaMin} min`);
  if (Math.abs(diff.costDeltaMax) >= 0.5) parts.push(`costo ${diff.costDeltaMax > 0 ? '+' : ''}${Math.round(diff.costDeltaMax)} CHF (max, gruppo)`);
  if (Math.abs(diff.walkDeltaM) >= 100) parts.push(`${diff.walkDeltaM > 0 ? '+' : ''}${(diff.walkDeltaM / 1000).toFixed(1)} km a piedi`);
  if (diff.added.length) parts.push(`+ ${diff.added.join(', ')}`);
  if (diff.removed.length) parts.push(`− ${diff.removed.join(', ')}`);
  return <span className="diff-line">{parts.join(' · ') || 'nessuna differenza rilevante'}</span>;
}

function PendingDialog() {
  const pending = useApp((s) => s.pending)!;
  const set = useApp((s) => s.set);
  const before = useApp((s) => s.plan());
  const loading = !pending.plan && pending.explanation[0]?.includes('corso');
  return (
    <Modal title={pending.label} onClose={() => set({ pending: null })} wide>
      {pending.hypothetical ? <div className="notice info">Scenario ipotetico attivato da voi: non è una notizia sul mondo reale.</div> : null}
      {loading ? <p><Spinner /> Ricalcolo solo di ciò che serve, il passato resta invariato…</p> : null}
      <ul className="explain">{pending.explanation.filter((e) => !e.includes('corso')).map((e, i) => <li key={i}>{e}</li>)}</ul>
      {pending.plan && pending.diff && before ? (
        <>
          <h3>Cosa cambia</h3>
          <BranchCompare a={before} b={pending.plan} />
          {pending.diff.lostConnections.length ? <div className="notice warn">Coincidenze perse: {pending.diff.lostConnections.join('; ')}</div> : null}
          {pending.diff.returnChange ? <div className="notice">{pending.diff.returnChange}</div> : null}
          <div className="row">
            <button className="btn primary" onClick={() => { applyPending(); play(); }}>Applica e continua</button>
            <button className="btn-ghost" onClick={() => applyPending()}>Crea il ramo senza ripartire</button>
            <button className="btn-ghost" onClick={() => set({ pending: null })}>Annulla</button>
          </div>
        </>
      ) : !loading ? (
        <div className="row"><button className="btn-ghost" onClick={() => set({ pending: null })}>Chiudi</button></div>
      ) : null}
    </Modal>
  );
}

export function BranchCompare({ a, b }: { a: import('../../shared/types.ts').Plan; b: import('../../shared/types.ts').Plan }) {
  const rows: [string, string, string][] = [
    ['Rientro', hhmm(a.totals.endsAt), hhmm(b.totals.endsAt)],
    ['Durata', fmtDuration(a.totals.durationMin), fmtDuration(b.totals.durationMin)],
    ['Spesa a persona', fmtRange(a.totals.cost.perPersonMin, a.totals.cost.perPersonMax), fmtRange(b.totals.cost.perPersonMin, b.totals.cost.perPersonMax)],
    ['A piedi', `${(a.totals.walkM / 1000).toFixed(1)} km`, `${(b.totals.walkM / 1000).toFixed(1)} km`],
    ['Salita', `${a.totals.ascentM} m`, `${b.totals.ascentM} m`],
    ['Tappe', a.stops.map((s) => s.name).join(' → '), b.stops.map((s) => s.name).join(' → ')],
    ['Stato', a.feasibility, b.feasibility],
  ];
  return (
    <div className="table-wrap">
      <table className="branch-compare">
        <thead><tr><th scope="col"></th><th scope="col">Prima</th><th scope="col">Dopo</th></tr></thead>
        <tbody>{rows.map(([k, x, y]) => <tr key={k} className={x !== y ? 'changed' : ''}><th scope="row">{k}</th><td>{x}</td><td>{y}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
