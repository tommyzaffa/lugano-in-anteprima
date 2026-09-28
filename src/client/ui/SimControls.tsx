import { useMemo } from 'react';
import { useApp, useSim } from '../store.ts';
import { buildTimeline, stateAt } from '../../shared/simulation.ts';
import { hhmm } from '../../shared/time.ts';
import { play, pause, setSpeed, skipMove, goToSummary, seek, cameraMode } from '../sim/actions.ts';
import { track } from '../api.ts';

const SPEEDS = [1, 4, 10] as const;

/** Comandi della simulazione: orologio, avvio/pausa, velocità, salto, fine; sotto, l'avanzamento con le tappe. */
export default function SimControls() {
  const plan = useApp((s) => s.branches.find((b) => b.id === s.currentBranch)?.plan ?? null);
  const { t, playing, speed, camera } = useSim();
  const tl = useMemo(() => (plan ? buildTimeline(plan) : null), [plan]);
  if (!plan || !tl) return null;
  const st = stateAt(tl, t);
  const span = tl.end - tl.start || 1;
  const pct = (x: number) => `${Math.max(0, Math.min(100, ((x - tl.start) / span) * 100))}%`;
  const blocked = !!st.pendingDecision;
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  return (
    <>
      {camera === 'free' ? <button className="follow-chip" onClick={() => cameraMode('follow')}>◎ Segui il gruppo</button> : null}
      <div className="sim-controls" role="region" aria-label="Comandi della simulazione">
        <div className="sim-pill">
          <div className="sim-row">
            <div className="clock"><span className="clock-time">{hhmm(t)}</span><span className="clock-label">{blocked ? 'Tocca a voi scegliere' : st.label}</span></div>
            <button className="ctl speed" onClick={() => setSpeed(nextSpeed)} aria-label={`Velocità ${speed}×: passa a ${nextSpeed}×`} title="Velocità">{speed}×</button>
            {playing
              ? <button className="ctl play" onClick={pause} aria-label="Pausa">❚❚</button>
              : <button className="ctl play" onClick={play} aria-label="Avvia" disabled={st.finished || blocked}>▶</button>}
            <button className="ctl" onClick={skipMove} disabled={st.finished || blocked} aria-label="Salta spostamento" title="Salta lo spostamento">⏭</button>
            <button className="ctl" onClick={goToSummary} aria-label="Fine: riepilogo" title="Vai al riepilogo"><span aria-hidden>✓</span><span className="lbl">Fine</span></button>
          </div>
          <div className="progress">
            <div className="bar" />
            <div className="fill" style={{ width: pct(t) }} />
            {tl.checkpoints.filter((c) => c.kind === 'arrive' || c.kind === 'decision').map((c) => (
              <button key={c.id} className={`cp ${c.kind === 'decision' ? 'decision' : ''} ${c.t <= t ? 'passed' : ''}`} style={{ left: pct(c.t) }} onClick={() => { pause(); seek(c.t); track('sim_checkpoint'); }} title={`${hhmm(c.t)} · ${c.label}`} aria-label={`Vai a ${hhmm(c.t)}: ${c.label}`} tabIndex={-1} />
            ))}
            <div className="knob" style={{ left: pct(t) }} />
            <input type="range" min={tl.start} max={tl.end} step={60000} value={t} onChange={(e) => { pause(); seek(Number(e.target.value)); }} aria-label="Ora simulata" aria-valuetext={hhmm(t)} />
          </div>
        </div>
      </div>
    </>
  );
}
