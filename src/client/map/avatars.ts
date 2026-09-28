/**
 * Personaggi stilizzati in SVG («figurine di carta»). Le differenze visive
 * derivano solo dalle scelte dell'utente (colore, cappello, accessorio,
 * capelli, tono); i bambini sono più piccoli perché indicati come tali.
 */
import type { Person } from '../../shared/types.ts';

export const CLOTHES = ['#c8643c', '#3f7f93', '#6f8f4e', '#d9a441', '#7c5e9a', '#b94a5a', '#4a6fb3', '#8a6d4c', '#2f8f7a', '#d06f9a', '#5b6b7a', '#e08a3c'];
export const TONES = ['#f3d7b6', '#e8bf94', '#d6a37a', '#b9825c', '#8d5f40', '#6b4631', '#f0cfa8', '#c9956c'];
export const HATS = ['none', 'cap', 'beret', 'sunhat', 'beanie'] as const;
export const ACCESSORIES = ['none', 'backpack', 'camera', 'scarf', 'umbrella', 'balloon'] as const;
export const HAIRS = ['short', 'long', 'curly', 'bun', 'none'] as const;

export function defaultAvatar(i: number): Person['avatar'] {
  return {
    color: CLOTHES[i % CLOTHES.length],
    accent: CLOTHES[(i + 5) % CLOTHES.length],
    hat: HATS[(i * 3) % HATS.length],
    accessory: ACCESSORIES[(i * 2 + 1) % ACCESSORIES.length],
    hair: HAIRS[(i + 1) % HAIRS.length],
    tone: TONES[(i * 5 + 2) % TONES.length],
  };
}

const INK = '#2b2a27';

export function avatarSvg(p: Pick<Person, 'avatar' | 'kind'>, size = 34): string {
  const a = p.avatar;
  const s = p.kind === 'child' ? 0.78 : 1;
  const w = Math.round(size * 0.8 * s), h = Math.round(size * s);
  const hair = a.hair === 'long' ? `<path d="M9 9 Q7 20 10 22 L22 22 Q25 20 23 9 Z" fill="#3b2f27"/>`
    : a.hair === 'curly' ? `<g fill="#3b2f27"><circle cx="11" cy="8" r="3"/><circle cx="16" cy="6" r="3.2"/><circle cx="21" cy="8" r="3"/></g>`
    : a.hair === 'bun' ? `<circle cx="16" cy="3.2" r="2.6" fill="#3b2f27"/><path d="M10 9 Q16 3 22 9 Z" fill="#3b2f27"/>`
    : a.hair === 'short' ? `<path d="M10 9 Q16 3.5 22 9 L22 10 Q16 7 10 10 Z" fill="#3b2f27"/>` : '';
  const hat = a.hat === 'cap' ? `<path d="M10 8.5 Q16 2 22 8.5 Z" fill="${a.accent}" stroke="${INK}" stroke-width="0.8"/><path d="M21 8.3 L26 9" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`
    : a.hat === 'beret' ? `<ellipse cx="16" cy="6.2" rx="6.8" ry="2.6" fill="${a.accent}" stroke="${INK}" stroke-width="0.8"/>`
    : a.hat === 'sunhat' ? `<ellipse cx="16" cy="7.4" rx="9" ry="2" fill="#e9d59a" stroke="${INK}" stroke-width="0.8"/><path d="M11.5 7 Q16 1.5 20.5 7 Z" fill="#e9d59a" stroke="${INK}" stroke-width="0.8"/>`
    : a.hat === 'beanie' ? `<path d="M10 8.8 Q16 1 22 8.8 Z" fill="${a.accent}" stroke="${INK}" stroke-width="0.8"/><circle cx="16" cy="2.6" r="1.4" fill="${a.accent}" stroke="${INK}" stroke-width="0.6"/>` : '';
  const acc = a.accessory === 'backpack' ? `<rect x="5.5" y="15" width="5" height="8" rx="1.5" fill="${a.accent}" stroke="${INK}" stroke-width="0.8"/>`
    : a.accessory === 'camera' ? `<rect x="13" y="17.5" width="6" height="4" rx="1" fill="${INK}"/><circle cx="16" cy="19.5" r="1.1" fill="#9fc6d0"/>`
    : a.accessory === 'scarf' ? `<path d="M11.5 14.2 L20.5 14.2 L20 16 L12 16 Z M18 15.5 L19.5 20 L17.6 20 Z" fill="${a.accent}" stroke="${INK}" stroke-width="0.6"/>`
    : a.accessory === 'umbrella' ? `<path d="M24 13 L24 27" stroke="${INK}" stroke-width="0.9"/><path d="M19 13 Q24 7 29 13 Z" fill="${a.accent}" stroke="${INK}" stroke-width="0.8"/>`
    : a.accessory === 'balloon' ? `<path d="M24 21 Q25 14 26 9" stroke="${INK}" stroke-width="0.6" fill="none"/><ellipse cx="26.5" cy="6.5" rx="3" ry="3.6" fill="${a.accent}" stroke="${INK}" stroke-width="0.7"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 32 40" aria-hidden="true">
  <ellipse cx="16" cy="38" rx="8" ry="2" fill="#000" opacity="0.18"/>
  <g class="av-body">
    ${a.accessory === 'backpack' ? acc : ''}
    <path class="av-leg-l" d="M12.5 29 L12 37" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
    <path class="av-leg-r" d="M19.5 29 L20 37" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M10 15 Q16 12.5 22 15 L24 30 Q16 32 8 30 Z" fill="${a.color}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <circle cx="16" cy="10.5" r="5.6" fill="${a.tone ?? '#f0cfa8'}" stroke="${INK}" stroke-width="1.1"/>
    ${hair}${hat}
    <circle cx="14" cy="10.8" r="0.6" fill="${INK}"/><circle cx="18" cy="10.8" r="0.6" fill="${INK}"/>
    ${a.accessory !== 'backpack' ? acc : ''}
  </g>
</svg>`;
}

export function vehicleSvg(mode: string): string {
  const color = mode === 'boat' ? '#3f7f93' : mode === 'funicular' ? '#b0442c' : mode === 'train' ? '#c0392b' : mode === 'cable_car' ? '#7c5e9a' : '#d9a441';
  const body = mode === 'boat'
    ? `<path d="M4 20 L36 20 L31 28 L9 28 Z" fill="${color}" stroke="${INK}" stroke-width="1.3"/><rect x="12" y="12" width="16" height="8" rx="1.5" fill="#f8f3e8" stroke="${INK}" stroke-width="1.1"/><path d="M2 31 Q8 29 14 31 T26 31 T38 31" stroke="#4d8795" stroke-width="1.2" fill="none"/>`
    : mode === 'funicular'
    ? `<path d="M6 26 L34 16 L34 26 Z" fill="none"/><rect x="7" y="10" width="26" height="15" rx="2.5" fill="${color}" stroke="${INK}" stroke-width="1.3" transform="rotate(-12 20 18)"/><rect x="10" y="12" width="6" height="5" fill="#f8f3e8" transform="rotate(-12 20 18)"/><rect x="18" y="12" width="6" height="5" fill="#f8f3e8" transform="rotate(-12 20 18)"/><rect x="26" y="12" width="4" height="5" fill="#f8f3e8" transform="rotate(-12 20 18)"/><path d="M3 30 L37 22" stroke="${INK}" stroke-width="1.4"/>`
    : `<rect x="4" y="9" width="32" height="17" rx="4" fill="${color}" stroke="${INK}" stroke-width="1.3"/><rect x="8" y="12" width="7" height="6" rx="1" fill="#f8f3e8"/><rect x="17" y="12" width="7" height="6" rx="1" fill="#f8f3e8"/><rect x="26" y="12" width="7" height="6" rx="1" fill="#f8f3e8"/><circle cx="11" cy="27" r="3" fill="${INK}"/><circle cx="29" cy="27" r="3" fill="${INK}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="36" viewBox="0 0 40 34" aria-hidden="true"><ellipse cx="20" cy="31" rx="15" ry="2.4" fill="#000" opacity="0.15"/>${body}</svg>`;
}
