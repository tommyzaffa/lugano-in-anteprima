/**
 * Cartolina illustrata del percorso: istantanea della mappa + cornice, titolo,
 * tappe e personaggi. Nessun dettaglio privato (partenza e alloggio esclusi).
 */
import type { Plan } from '../../shared/types.ts';
import { getMap, boundsOf, planCoords } from '../map/MapView.tsx';
import { avatarSvg } from '../map/avatars.ts';
import { hhmm, formatDateIt } from '../../shared/time.ts';
import { useApp } from '../store.ts';
import { track } from '../api.ts';

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

export async function makePostcard(plan: Plan) {
  const map = getMap();
  if (!map) { useApp.getState().notify('Cartolina non disponibile senza mappa.', 'error'); return; }
  const bb = boundsOf(plan.stops.map((s) => [s.lon, s.lat] as [number, number]).concat(planCoords(plan).filter((_, i) => i % 7 === 0)));
  if (bb) map.fitBounds(bb, { padding: 60, duration: 0 });
  await new Promise<void>((r) => map.once('idle', () => r()));
  const shot = map.getCanvas().toDataURL('image/png');
  const W = 1600, H = 1100;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3ede0'; g.fillRect(0, 0, W, H);
  const img = await loadImg(shot);
  const mw = 1000, mh = 1000 * (img.height / img.width);
  const my = (H - Math.min(mh, 900)) / 2;
  g.save(); g.translate(60, my); g.rotate(-0.012);
  g.fillStyle = '#fff'; g.fillRect(-14, -14, mw + 28, Math.min(mh, 900) + 28);
  g.drawImage(img, 0, 0, img.width, Math.min(img.height, img.width * 0.9), 0, 0, mw, Math.min(mh, 900));
  g.strokeStyle = '#2b2a27'; g.lineWidth = 3; g.strokeRect(0, 0, mw, Math.min(mh, 900));
  g.restore();
  g.fillStyle = '#2b2a27';
  g.font = 'italic 30px Georgia, serif'; g.fillText('Saluti dalla piccola Lugano', 1110, 110);
  g.font = 'bold 38px Georgia, serif';
  wrap(g, plan.title, 1110, 170, 440, 44);
  g.font = '22px Georgia, serif'; g.fillStyle = '#5d574c';
  g.fillText(formatDateIt(plan.request.date), 1110, 290);
  g.font = '21px system-ui, sans-serif'; g.fillStyle = '#2b2a27';
  plan.stops.slice(0, 9).forEach((s, i) => { g.fillText(`${hhmm(s.start)}  ${s.name.replace(/\s*\(.*?\)\s*/g, '').slice(0, 30)}`, 1110, 350 + i * 40); });
  let x = 1110;
  for (const p of plan.request.people.slice(0, 12)) {
    const svg = avatarSvg({ ...p, kind: p.kind }, 58);
    const im = await loadImg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    g.drawImage(im, x, 760, im.width, im.height);
    x += 40;
  }
  g.strokeStyle = '#c8643c'; g.lineWidth = 6; g.strokeRect(20, 20, W - 40, H - 40);
  g.font = '15px system-ui, sans-serif'; g.fillStyle = '#5d574c';
  g.fillText('Lugano in anteprima · mappa © OpenStreetMap contributors · programma simulato', 1110, H - 60);
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'cartolina-lugano.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    track('postcard');
  }, 'image/png');
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > max && line) { g.fillText(line, x, y); line = w; y += lh; } else line = test;
  }
  g.fillText(line, x, y);
}
