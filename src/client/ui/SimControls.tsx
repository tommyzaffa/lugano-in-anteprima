import { useMemo } from 'react';
import { useApp, useSim } from '../store.ts';
import { buildTimeline, stateAt } from '../../shared/simulation.ts';
import { hhmm } from '../../shared/time.ts';
import { fmtRange } from '../../shared/pricing.ts';
import { play, pause, setSpeed, skipMove, nextDecision, goToSummary, seek, cameraMode } from '../sim/actions.ts';
import { t as tr } from '../i18n.ts';

export default function SimControls() {
  const plan = useApp((s) => s.branches.find((b) => b.id === s.currentBranch)?.plan ?? null);
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const { t, playing, speed, camera } = useSim();
  const tl = useMemo(() => (plan ? buildTimeline(plan) : null), [plan]);
  if (!plan || !tl) return null;
  const st = stateAt(tl, t);
  const span = tl.end - tl.start || 1;
  const pct = (x: number) => `${((x - tl.start) / span) * 100}%`;
  return (
    <div className="sim-controls" role="region" aria-label="Comandi della simulazione">
      <div className="sim-row">
        <div className="clock" aria-live="off"><span className="clock-time">{hhmm(t)}</span><span className="clock-label">{st.pendingDecision ? 'In attesa di una scelta' : st.label}</span></div>
        <div className="sim-buttons">
          {playing ? <button className="ctl" onClick={pause} aria-label={tr('sim.pause')}>⏸<span>{tr('sim.pause')}</span></button> : <button className="ctl primary" onClick={play} aria-label={tr('sim.play')} disabled={st.finished || !!st.pendingDecision}>▶<span>{tr('sim.play')}</span></button>}
          <div className="speed" role="group" aria-label="Velocità">
            {([1, 4, 10] as const).map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)} aria-pressed={speed === s}>{s}×</button>)}
          </div>
          <button className="ctl" onClick={skipMove} disabled={st.finished || !!st.pendingDecision} title="Raggiunge la fine dello spostamento con tutte le conseguenze" aria-label={tr('sim.skipMove')}>⏭<span>{tr('sim.skipMove')}</span></button>
          <button className="ctl" onClick={nextDecision} disabled={st.finished} aria-label={tr('sim.nextDecision')}>◆<span>{tr('sim.nextDecision')}</span></button>
          <button className="ctl" onClick={goToSummary} aria-label={tr('sim.summary')}>☰<span>{tr('sim.summary')}</span></button>
        </div>
        <div className="spent" title="Spesa simulata maturata: non è un addebito reale">
          <span className="k">Spesa simulata</span>
          <span className="v">{fmtRange(st.spent.min, st.spent.max)}{st.spent.unknown ? ' + ?' : ''}</span>
        </div>
      </div>
      <div className="timeline" aria-label="Linea del tempo">
        <input type="range" min={tl.start} max={tl.end} step={60000} value={t} onChange={(e) => { pause(); seek(Number(e.target.value)); }} aria-label="Ora simulata" aria-valuetext={hhmm(t)} />
        <div className="tl-track" aria-hidden>
          {tl.segments.filter((s) => s.kind === 'activity' || s.kind === 'pause').map((s) => <div key={s.id} className="tl-act" style={{ left: pct(s.start), width: `${((s.end - s.start) / span) * 100}%` }} title={s.label} />)}
          {tl.segments.filter((s) => s.kind === 'ride').map((s) => <div key={s.id} className={`tl-ride tl-${s.mode}`} style={{ left: pct(s.start), width: `${((s.end - s.start) / span) * 100}%` }} />)}
          <div className="tl-needle" style={{ left: pct(t) }} />
        </div>
        <div className="tl-cps">
          {tl.checkpoints.filter((c) => c.kind === 'arrive' || c.kind === 'decision' || c.kind === 'start' || c.kind === 'end').map((c) => (
            <button key={c.id} className={`tl-cp tl-cp-${c.kind}`} style={{ left: pct(c.t) }} onClick={() => { pause(); seek(c.t); }} title={`${hhmm(c.t)} · ${c.label}`} aria-label={`Vai a ${hhmm(c.t)}: ${c.label}`}>{c.kind === 'decision' ? '◆' : c.kind === 'arrive' ? (c.stopIndex ?? 0) + 1 : c.kind === 'start' ? '▸' : '■'}</button>
          ))}
        </div>
      </div>
      <div className="sim-row small">
        <div className="seg" role="group" aria-label="Camera">
          <button className={camera === 'follow' ? 'on' : ''} onClick={() => cameraMode('follow')}>{tr('sim.follow')}</button>
          <button className={camera === 'free' ? 'on' : ''} onClick={() => cameraMode('free')}>{tr('sim.free')}</button>
          <button className={camera === 'overview' ? 'on' : ''} onClick={() => cameraMode('overview')}>{tr('sim.overview')}</button>
        </div>
        <label className="check"><input type="checkbox" checked={settings.cutscenes && !settings.reducedMotion} disabled={settings.reducedMotion} onChange={(e) => setSettings({ cutscenes: e.target.checked })} /> Cutscene</label>
        <label className="check"><input type="checkbox" checked={!settings.reducedMotion} onChange={(e) => setSettings({ reducedMotion: !e.target.checked })} /> Animazioni</label>
        <label className="check"><input type="checkbox" checked={settings.dialogues} onChange={(e) => setSettings({ dialogues: e.target.checked })} /> Battute</label>
      </div>
    </div>
  );
}
