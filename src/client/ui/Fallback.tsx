import { useMemo } from 'react';
import { useApp, useSim } from '../store.ts';
import { buildTimeline, stateAt } from '../../shared/simulation.ts';
import { hhmm } from '../../shared/time.ts';
import { MODE } from '../i18n.ts';

/**
 * Vista semplificata senza WebGL (o a scelta dell'utente): schema del percorso
 * in SVG e descrizione testuale dello stato. Contiene le stesse informazioni
 * essenziali della mappa.
 */
export default function Fallback() {
  const webgl = useApp((s) => s.webgl);
  const view = useApp((s) => s.view);
  const plan = useApp((s) => s.branches.find((b) => b.id === s.currentBranch)?.plan ?? (s.view === 'results' ? s.result?.alternatives[s.selected] : null) ?? null);
  const t = useSim((s) => s.t);
  const tl = useMemo(() => (plan ? buildTimeline(plan) : null), [plan]);
  const setS = useApp((s) => s.setSettings);
  const st = tl ? stateAt(tl, t) : null;
  const svg = useMemo(() => {
    if (!plan) return null;
    const pts = [...plan.trips.flatMap((tr) => tr.legs.flatMap((l) => l.geometry)), ...plan.stops.map((s) => [s.lon, s.lat] as [number, number])].filter(([x, y]) => x && y);
    if (!pts.length) return null;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
    const w = (maxX - minX) * k || 0.01, h = maxY - minY || 0.01;
    const W = 600, H = Math.max(260, Math.min(520, (600 * h) / w));
    const sx = (x: number) => 20 + ((x - minX) * k / w) * (W - 40);
    const sy = (y: number) => 20 + ((maxY - y) / h) * (H - 40);
    return { W, H, sx, sy };
  }, [plan]);
  return (
    <div className="fallback" role="region" aria-label="Vista semplificata del percorso">
      {webgl !== 'ok' ? (
        <div className="notice warn">
          {webgl === 'lost' ? 'La scheda grafica ha perso il contesto WebGL: mostriamo una vista semplificata.' : 'WebGL non è disponibile su questo dispositivo: mostriamo una vista semplificata con tutte le informazioni.'}
          {webgl === 'lost' ? <button className="btn-ghost" onClick={() => location.reload()}>Ricarica la mappa</button> : null}
        </div>
      ) : <div className="notice">Vista elenco attiva. <button className="link" onClick={() => setS({ listView: false })}>Torna alla mappa</button></div>}
      {plan && svg ? (
        <svg viewBox={`0 0 ${svg.W} ${svg.H}`} className="fallback-svg" role="img" aria-label={`Schema del percorso: ${plan.stops.map((s) => s.name).join(', ')}`}>
          <rect width={svg.W} height={svg.H} fill="#f3ede0" />
          {plan.trips.flatMap((tr, i) => tr.legs.filter((l) => l.geometry.length > 1).map((l, j) => (
            <polyline key={`${i}-${j}`} fill="none" stroke={l.transit ? '#3f7f93' : l.mode === 'hike' ? '#b8452e' : '#2b2a27'} strokeWidth={l.transit ? 3 : 2} strokeDasharray={l.transit ? undefined : '4 3'} points={l.geometry.map(([x, y]) => `${svg.sx(x)},${svg.sy(y)}`).join(' ')} />
          )))}
          {plan.stops.map((s, i) => (
            <g key={s.id}><circle cx={svg.sx(s.lon)} cy={svg.sy(s.lat)} r={10} fill="#b55a36" stroke="#2b2a27" /><text x={svg.sx(s.lon)} y={svg.sy(s.lat) + 4} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="bold">{i + 1}</text><text x={svg.sx(s.lon) + 13} y={svg.sy(s.lat) + 4} fontSize="11" fill="#2b2a27">{s.name.slice(0, 28)}</text></g>
          ))}
          {st && view === 'sim' ? <circle cx={svg.sx(st.position[0])} cy={svg.sy(st.position[1])} r={7} fill="#2f8f7a" stroke="#fff" strokeWidth={2} /> : null}
        </svg>
      ) : <p className="muted">Scegliete un programma per vederne lo schema.</p>}
      {st && plan && view === 'sim' ? (
        <div className="text-state" aria-live="polite">
          <strong>{hhmm(t)}</strong> — {st.pendingDecision ? `Decisione: ${st.pendingDecision.prompt}` : st.scene === 'ride' ? `${MODE[st.mode ?? 'bus']}: ${st.label}` : st.label}
          {' · '}tappe completate {st.completedStops}/{plan.stops.length}
        </div>
      ) : null}
    </div>
  );
}
