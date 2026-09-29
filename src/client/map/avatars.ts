/**
 * Pedine del gruppo: una per persona, con il colore scelto e il nome sotto.
 * Le differenze visive derivano solo dalle scelte dell'utente; i bambini sono
 * pedine più piccole perché indicati come tali.
 */
import type { Person } from '../../shared/types.ts';

/** Colori delle pedine: saturi ma armonici con la carta e l'inchiostro. */
export const PAWN_COLORS = ['#d2553a', '#2f6f7e', '#e0a33a', '#5b7f3a', '#7a5aa0', '#c2477a', '#3a5fa0', '#8a5a3a', '#2f8f6f', '#e07a3a', '#4a4a4a', '#9aa03a'];
/** compatibilità con il modulo precedente */
export const CLOTHES = PAWN_COLORS;

export function defaultAvatar(i: number): Person['avatar'] {
  return { color: PAWN_COLORS[i % PAWN_COLORS.length], accent: '#2a2622', hat: 'none', accessory: 'none', hair: 'short', tone: '#f0cfa8' };
}

const INK = '#2a2622';

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Pedina da gioco in SVG (DOM): testa, collare, corpo a campana e base. */
export function pawnSvg(color: string, size = 34, child = false): string {
  if (/^#[0-9a-f]{3}$/i.test(color)) color = '#' + [...color.slice(1)].map((c) => c + c).join('');
  color = /^#[0-9a-f]{6}$/i.test(color) ? color : PAWN_COLORS[0];
  size = Number.isFinite(size) ? Math.max(1, Math.min(200, size)) : 34;
  const s = child ? 0.8 : 1;
  const w = Math.round(size * 0.74 * s), h = Math.round(size * s);
  const dark = shade(color, 0.72);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 32 44" aria-hidden="true">
  <ellipse cx="16" cy="41.6" rx="10" ry="2.4" fill="#000" opacity="0.16"/>
  <g class="pawn" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round">
    <path d="M6 39.5 Q16 43 26 39.5 L25 35.5 Q16 38 7 35.5 Z" fill="${dark}"/>
    <path d="M9 35.5 Q10.5 24 13 19.5 L19 19.5 Q21.5 24 23 35.5 Q16 37.5 9 35.5 Z" fill="${color}"/>
    <ellipse cx="16" cy="19.5" rx="6.2" ry="2" fill="${color}"/>
    <circle cx="16" cy="11.5" r="7" fill="${color}"/>
  </g>
  <circle cx="13.4" cy="9" r="2.1" fill="#fff" opacity="0.5"/>
</svg>`;
}

export function avatarSvg(p: Pick<Person, 'avatar' | 'kind'>, size = 34): string {
  return pawnSvg(p.avatar.color, size, p.kind === 'child');
}

export function vehicleSvg(mode: string): string {
  const color = mode === 'boat' ? '#2f6f7e' : mode === 'funicular' ? '#b04a35' : mode === 'train' ? '#8e3b2e' : mode === 'cable_car' ? '#6c5a8e' : '#d99a2b';
  const body = mode === 'boat'
    ? `<path d="M4 20 L36 20 L31 28 L9 28 Z" fill="${color}" stroke="${INK}" stroke-width="1.4"/><rect x="12" y="12" width="16" height="8" rx="1.5" fill="#fbf8f2" stroke="${INK}" stroke-width="1.2"/><path d="M2 31 Q8 29 14 31 T26 31 T38 31" stroke="#6f97a0" stroke-width="1.2" fill="none"/>`
    : mode === 'funicular'
    ? `<rect x="7" y="10" width="26" height="15" rx="2.5" fill="${color}" stroke="${INK}" stroke-width="1.4" transform="rotate(-12 20 18)"/><rect x="10" y="12" width="6" height="5" fill="#fbf8f2" transform="rotate(-12 20 18)"/><rect x="18" y="12" width="6" height="5" fill="#fbf8f2" transform="rotate(-12 20 18)"/><rect x="26" y="12" width="4" height="5" fill="#fbf8f2" transform="rotate(-12 20 18)"/><path d="M3 30 L37 22" stroke="${INK}" stroke-width="1.4"/>`
    : `<rect x="4" y="9" width="32" height="17" rx="4" fill="${color}" stroke="${INK}" stroke-width="1.4"/><rect x="8" y="12" width="7" height="6" rx="1" fill="#fbf8f2"/><rect x="17" y="12" width="7" height="6" rx="1" fill="#fbf8f2"/><rect x="26" y="12" width="7" height="6" rx="1" fill="#fbf8f2"/><circle cx="11" cy="27" r="3" fill="${INK}"/><circle cx="29" cy="27" r="3" fill="${INK}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="36" viewBox="0 0 40 34" aria-hidden="true"><ellipse cx="20" cy="31" rx="15" ry="2.4" fill="#000" opacity="0.15"/>${body}</svg>`;
}
