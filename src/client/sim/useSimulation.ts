/**
 * Ciclo di riproduzione. L'orologio simulato avanza a «ritmo di riproduzione»
 * (1× = 1 minuto simulato per secondo reale) moltiplicato per la velocità.
 * Le cutscene sono solo presentazione: fermano l'orologio per un istante e
 * muovono la camera, senza cambiare lo stato logico. Nessuna chiamata AI qui.
 */
import { useEffect, useMemo, useRef } from 'react';
import { buildTimeline, advance, stateAt } from '../../shared/simulation.ts';
import { useApp, useSim } from '../store.ts';
import { getMap } from '../map/MapView.tsx';
import { hhmm } from '../../shared/time.ts';
import { track } from '../api.ts';
import { ambient } from './sound.ts';

export const BASE_RATE = 60; // ms simulati per ms reale a 1×

export function useSimulation() {
  const view = useApp((s) => s.view);
  const plan = useApp((s) => s.branches.find((b) => b.id === s.currentBranch)?.plan ?? null);
  const tl = useMemo(() => (plan ? buildTimeline(plan) : null), [plan]);
  const tlRef = useRef(tl);
  tlRef.current = tl;
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    if (view !== 'sim' || !tl) return;
    let raf = 0;
    let last = performance.now();
    let cutsceneUntilReal = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(250, now - last);
      last = now;
      const sim = useSim.getState();
      const app = useApp.getState();
      const timeline = tlRef.current;
      if (!timeline) return;
      // cutscene in corso: l'orologio simulato resta fermo
      if (sim.cutscene) {
        if (now >= cutsceneUntilReal) sim.set({ cutscene: null });
        return;
      }
      if (!sim.playing) return;
      if (startedRef.current !== timeline.planId) { startedRef.current = timeline.planId; track('sim_started'); }
      const prev = sim.t;
      const { t, stoppedAt } = advance(timeline, prev, dt, BASE_RATE * sim.speed);
      // battute dei personaggi fra prev e t
      const plan = app.plan();
      if (plan && app.settings.dialogues) {
        const fresh = plan.narrative.lines.filter((l) => { const a = Date.parse(l.at); return a > prev && a <= t; });
        if (fresh.length) {
          const until = Date.now() + 3800;
          sim.set({ bubbles: [...sim.bubbles.filter((b) => b.until > Date.now()), ...fresh.map((l) => ({ speaker: l.speaker, text: l.text, until }))].slice(-4) });
        }
      }
      // cutscene agli arrivi e alle salite su funicolare/battello
      const cps = timeline.checkpoints.filter((c) => c.t > prev && c.t <= t && (c.kind === 'arrive' || c.kind === 'board'));
      const cutscenesOn = app.settings.cutscenes && !app.settings.reducedMotion;
      if (cps.length && cutscenesOn) {
        const cp = cps[0];
        const isBoard = cp.kind === 'board';
        const worth = !isBoard || /funicolare|battello|Funicolare|lago/.test(cp.label) || isSpecialRide(timeline, cp.t);
        if (worth) {
          sim.set({ t: cp.t });
          const st = stateAt(timeline, cp.t);
          const map = getMap();
          const dur = isBoard ? 1500 : 2300;
          cutsceneUntilReal = now + dur;
          sim.set({ cutscene: { title: cp.label, subtitle: hhmm(cp.t), until: Date.now() + dur } });
          if (map && sim.camera !== 'free') {
            map.easeTo({ center: st.position, zoom: isBoard ? 15.2 : 16.4, pitch: app.settings.threeD ? 55 : 0, bearing: map.getBearing() + (isBoard ? 0 : 18), duration: dur * 0.8 });
          }
          return;
        }
      }
      sim.set({ t });
      if (stoppedAt) { sim.set({ playing: false }); track('sim_decision'); }
      if (t >= timeline.end) { sim.set({ playing: false }); track('sim_finished'); app.notify('Programma completato: aprite il riepilogo pratico.', 'ok'); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [view, tl]);

  // audio ambientale opzionale (mai avviato senza consenso)
  const sound = useApp((s) => s.settings.sound);
  const playing = useSim((s) => s.playing);
  useEffect(() => {
    if (sound && playing && view === 'sim') ambient.start(); else ambient.stop();
    return () => ambient.stop();
  }, [sound, playing, view]);

  return tl;
}

function isSpecialRide(tl: NonNullable<ReturnType<typeof buildTimeline>>, t: number): boolean {
  const seg = tl.segments.find((s) => s.start === t && s.kind === 'ride');
  return !!seg && (seg.mode === 'funicular' || seg.mode === 'boat' || seg.mode === 'cable_car');
}
