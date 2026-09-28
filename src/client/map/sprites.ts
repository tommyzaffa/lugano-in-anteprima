/**
 * Texture e icone disegnate proceduralmente (nessun asset esterno):
 * grana della carta, puntinato del bosco, filari delle vigne, icone POI,
 * segnaposto delle tappe e piccoli disegni dei landmark.
 */
import type { Map as MLMap } from 'maplibre-gl';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}
function add(map: MLMap, id: string, c: HTMLCanvasElement, pixelRatio = 2, sdf = false) {
  const img = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  const data = { width: c.width, height: c.height, data: new Uint8Array(img.data.buffer) };
  // ridisegno (es. dopo il caricamento del carattere a mano): aggiornamento sul posto se le dimensioni coincidono
  if (map.hasImage(id)) {
    try { map.updateImage(id, data); return; } catch { map.removeImage(id); }
  }
  map.addImage(id, data, { pixelRatio, sdf });
}

// generatore pseudo-casuale deterministico
function rng(seed: number) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

const HAND_FONT = '"Architects Daughter", "Comic Sans MS", cursive';
const INK_C = '#2a2622';
const PAPER = '#f3eee4';
const ACCENT = '#d2553a';

const POI_GLYPH: Record<string, string> = {
  museum: 'M', gallery: 'A', viewpoint: '◉', attraction: '★', artwork: '✦', lodging: 'H', picnic: '⌂', info: 'i', restaurant: 'R', cafe: 'C', bar: 'B',
  ice_cream: 'G', fast_food: 'F', theatre: 'T', cinema: 'Ci', nightclub: 'D', casino: '♠', library: 'L', market: 'Mk', worship: '✝', toilets: 'WC', water: '~',
  fountain: 'f', playground: 'P', lido: '≈', park: '♣', nature: '♣', historic: '⌘', bakery: 'Pa', food_shop: 'Sh', shop: 'Sh', pier: '⚓',
};

/** Pedina da gioco stilizzata (usata anche per le figure decorative). */
export function drawPawn(g: CanvasRenderingContext2D, cx: number, base: number, h: number, fill: string, ink = INK_C) {
  const s = h / 44;
  g.save(); g.translate(cx - 16 * s, base - 44 * s); g.scale(s, s);
  g.lineJoin = 'round'; g.lineWidth = 1.6; g.strokeStyle = ink;
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(16, 41.5, 10, 2.4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = fill;
  g.beginPath(); g.moveTo(6, 39.5); g.quadraticCurveTo(16, 43, 26, 39.5); g.lineTo(25, 35.5); g.quadraticCurveTo(16, 38, 7, 35.5); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(9, 35.5); g.quadraticCurveTo(10.5, 24, 13, 19.5); g.lineTo(19, 19.5); g.quadraticCurveTo(21.5, 24, 23, 35.5); g.quadraticCurveTo(16, 37.5, 9, 35.5); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(16, 19.5, 6.2, 2, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.arc(16, 11.5, 7, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(13.5, 9, 2, 0, Math.PI * 2); g.fill();
  g.restore();
}

export function installImages(map: MLMap) {
  // figure decorative del modellino: pedine grigie, fisse (non rappresentano presenze reali)
  const TONES = ['#b9b1a4', '#a7a095', '#c4bcae', '#9c958a', '#b0a99c', '#cbc4b7'];
  for (let k = 0; k < 6; k++) {
    const { c, g } = canvas(24, 36);
    drawPawn(g, 12, 35, 32, TONES[k], '#5b554c');
    add(map, `npc-${k}`, c, 2);
  }
  // grana e fibre della carta
  {
    const { c, g } = canvas(256, 256);
    const r = rng(7);
    for (let i = 0; i < 2600; i++) {
      const x = r() * 256, y = r() * 256, a = r() * 0.07;
      g.fillStyle = r() > 0.45 ? `rgba(90,70,40,${a})` : `rgba(255,255,255,${a * 1.6})`;
      g.fillRect(x, y, 1 + r() * 1.6, 1 + r() * 1.6);
    }
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(110,90,60,${0.025 + r() * 0.04})`; g.lineWidth = 0.6 + r() * 0.6;
      g.beginPath(); const x = r() * 256, y = r() * 256, a = r() * Math.PI, l = 8 + r() * 26;
      g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + r() * 4, y + Math.sin(a) * l * 0.5 + r() * 4, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    add(map, 'paper-grain', c, 2);
  }
  // tratteggio orizzontale dell'acqua, a mano libera
  {
    const { c, g } = canvas(96, 48);
    const r = rng(23);
    g.strokeStyle = 'rgba(70,110,120,0.55)'; g.lineWidth = 1; g.lineCap = 'round';
    for (let y = 6; y < 48; y += 12) {
      let x = r() * 20;
      while (x < 96) {
        const l = 10 + r() * 22;
        g.beginPath(); g.moveTo(x, y + r() * 1.2); g.quadraticCurveTo(x + l / 2, y - 0.8 + r() * 1.6, Math.min(96, x + l), y + r() * 1.2); g.stroke();
        x += l + 6 + r() * 14;
      }
    }
    add(map, 'water-hatch', c, 2);
  }
  // alberi a cerchietti (simbolo d'architetto)
  {
    const { c, g } = canvas(96, 96);
    const r = rng(11);
    const pts: [number, number, number][] = [];
    for (let i = 0; i < 60 && pts.length < 11; i++) {
      const x = 8 + r() * 80, y = 8 + r() * 80, rad = 4.5 + r() * 3.5;
      if (pts.every(([px, py, pr]) => Math.hypot(px - x, py - y) > pr + rad + 3)) pts.push([x, y, rad]);
    }
    for (const [x, y, rad] of pts) {
      g.fillStyle = 'rgba(120,145,95,0.22)'; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(60,72,48,0.7)'; g.lineWidth = 1;
      g.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.3; a += 0.35) { const rr = rad + (r() - 0.5) * 1.2; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; a === 0 ? g.moveTo(px, py) : g.lineTo(px, py); }
      g.stroke();
      g.fillStyle = 'rgba(60,72,48,0.8)'; g.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
    }
    add(map, 'tree-scribble', c, 2);
    add(map, 'tree-stipple', c, 2);
  }
  // filari delle vigne
  {
    const { c, g } = canvas(32, 32);
    g.strokeStyle = 'rgba(90,100,50,0.6)'; g.lineWidth = 1; g.setLineDash([2, 2.5]);
    for (let y = 4; y < 32; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(32, y); g.stroke(); }
    add(map, 'vineyard-rows', c, 2);
  }
  // icone POI: cerchietto a inchiostro con una lettera
  for (const [cls, glyph] of Object.entries(POI_GLYPH)) {
    const { c, g } = canvas(30, 30);
    g.fillStyle = PAPER; g.strokeStyle = INK_C; g.lineWidth = 1.4;
    g.beginPath(); g.arc(15, 15, 11, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = INK_C; g.font = `${glyph.length > 1 ? 10 : 13}px ${HAND_FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(glyph, 15, 16);
    add(map, `poi-${cls}`, c, 2);
  }
  // tappe numerate: cerchio rosso matita con numero a mano
  for (let n = 1; n <= 12; n++) {
    const { c, g } = canvas(48, 56);
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.ellipse(24, 52, 9, 2.6, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK_C; g.lineWidth = 2; g.beginPath(); g.moveTo(24, 50); g.lineTo(24, 38); g.stroke();
    g.fillStyle = ACCENT; g.beginPath(); g.arc(24, 21, 17, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK_C; g.lineWidth = 2.2; g.beginPath(); g.arc(24, 21, 17, -0.2, Math.PI * 1.93); g.stroke();
    g.fillStyle = '#fff8ef'; g.font = `bold 21px ${HAND_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 24, 23);
    add(map, `stop-${n}`, c, 2);
  }
  // partenza: bandierina; arrivo: casetta
  {
    const { c, g } = canvas(40, 52);
    g.strokeStyle = INK_C; g.lineWidth = 2.4; g.beginPath(); g.moveTo(8, 50); g.lineTo(8, 4); g.stroke();
    g.fillStyle = '#2f6f7e'; g.beginPath(); g.moveTo(9, 5); g.lineTo(35, 12); g.lineTo(9, 20); g.closePath(); g.fill(); g.lineWidth = 1.8; g.stroke();
    add(map, 'flag-start', c, 2);
  }
  {
    const { c, g } = canvas(44, 44);
    g.fillStyle = PAPER; g.strokeStyle = INK_C; g.lineWidth = 2;
    g.beginPath(); g.moveTo(22, 5); g.lineTo(39, 20); g.lineTo(34, 20); g.lineTo(34, 39); g.lineTo(10, 39); g.lineTo(10, 20); g.lineTo(5, 20); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = ACCENT; g.fillRect(18, 27, 8, 12);
    add(map, 'flag-end', c, 2);
  }
  // decisione: rombo ocra con punto di domanda
  {
    const { c, g } = canvas(40, 40);
    g.fillStyle = '#e8b64a'; g.strokeStyle = INK_C; g.lineWidth = 2;
    g.beginPath(); g.moveTo(20, 3); g.lineTo(37, 20); g.lineTo(20, 37); g.lineTo(3, 20); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = INK_C; g.font = `bold 20px ${HAND_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 20, 22);
    add(map, 'decision', c, 2);
  }
  // disegni dei landmark
  for (const [id, draw] of Object.entries(LANDMARKS)) {
    const { c, g } = canvas(96, 96);
    g.lineJoin = 'round'; g.lineCap = 'round';
    draw(g);
    add(map, `lm-${id}`, c, 2);
  }
  // luoghi del catalogo: pallino a inchiostro con velatura di categoria
  for (const [id, color] of Object.entries({ culture: '#8a6fa8', nature: '#c9d6b6', food: '#d2553a', views: '#e0a33a', night: '#5b4a7a', village: '#8a6d4c', family: '#2f6f7e', default: '#8f887c' })) {
    const { c, g } = canvas(28, 28);
    g.fillStyle = color; g.beginPath(); g.arc(14, 14, 7.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK_C; g.lineWidth = 1.5; g.beginPath(); g.arc(14, 14, 7.5, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = PAPER; g.lineWidth = 1.2; g.beginPath(); g.arc(14, 14, 10, 0, Math.PI * 2); g.stroke();
    add(map, `place-${id}`, c, 2);
  }
}

type Draw = (g: CanvasRenderingContext2D) => void;
const INK = '#2a2622';
function stroke(g: CanvasRenderingContext2D, w = 2.2) { g.strokeStyle = INK; g.lineWidth = w; g.stroke(); }
const LANDMARKS: Record<string, Draw> = {
  church: (g) => {
    g.fillStyle = '#f7f2e8'; g.beginPath(); g.rect(22, 44, 40, 40); g.fill(); stroke(g);
    g.fillStyle = '#d9876c'; g.beginPath(); g.moveTo(18, 46); g.lineTo(42, 26); g.lineTo(66, 46); g.closePath(); g.fill(); stroke(g);
    g.fillStyle = '#f2ece0'; g.beginPath(); g.rect(62, 22, 16, 62); g.fill(); stroke(g);
    g.fillStyle = '#d9876c'; g.beginPath(); g.moveTo(60, 24); g.lineTo(70, 8); g.lineTo(80, 24); g.closePath(); g.fill(); stroke(g);
    g.fillStyle = INK; g.beginPath(); g.arc(42, 62, 6, Math.PI, 0); g.lineTo(48, 84); g.lineTo(36, 84); g.closePath(); g.fill();
  },
  museum: (g) => {
    g.fillStyle = '#f4efe6'; g.beginPath(); g.rect(10, 40, 76, 42); g.fill(); stroke(g);
    g.fillStyle = '#c9d8da'; for (let x = 16; x < 82; x += 12) { g.fillRect(x, 48, 7, 26); }
    g.fillStyle = '#2b2a27'; g.beginPath(); g.moveTo(6, 40); g.lineTo(90, 40); g.lineTo(84, 32); g.lineTo(12, 32); g.closePath(); g.fill();
  },
  summit: (g) => {
    g.fillStyle = '#e4e8d6'; g.beginPath(); g.moveTo(4, 88); g.lineTo(48, 22); g.lineTo(92, 88); g.closePath(); g.fill(); stroke(g);
    g.fillStyle = '#fbf8f2'; g.beginPath(); g.moveTo(38, 37); g.lineTo(48, 22); g.lineTo(58, 37); g.lineTo(52, 34); g.lineTo(48, 39); g.lineTo(44, 34); g.closePath(); g.fill(); stroke(g, 1.6);
    g.beginPath(); g.moveTo(48, 22); g.lineTo(48, 6); g.moveTo(42, 11); g.lineTo(54, 11); stroke(g, 2.6);
  },
  funicular: (g) => {
    g.beginPath(); g.moveTo(6, 86); g.lineTo(90, 26); stroke(g, 3);
    g.save(); g.translate(48, 56); g.rotate(-0.62);
    g.fillStyle = '#e6b9a6'; g.beginPath(); g.rect(-20, -13, 40, 22); g.fill(); stroke(g);
    g.fillStyle = '#fbf8f2'; g.fillRect(-15, -8, 8, 8); g.fillRect(-4, -8, 8, 8); g.fillRect(7, -8, 8, 8);
    g.restore();
  },
  village: (g) => {
    const house = (x: number, y: number, w: number, h: number) => {
      g.fillStyle = '#f7f2e8'; g.beginPath(); g.rect(x, y, w, h); g.fill(); stroke(g, 1.8);
      g.fillStyle = '#d9876c'; g.beginPath(); g.moveTo(x - 3, y + 1); g.lineTo(x + w / 2, y - h * 0.45); g.lineTo(x + w + 3, y + 1); g.closePath(); g.fill(); stroke(g, 1.8);
      g.fillStyle = INK; g.fillRect(x + w * 0.35, y + h * 0.4, w * 0.3, h * 0.35);
    };
    house(14, 58, 22, 26); house(40, 46, 24, 38); house(66, 60, 20, 24);
  },
  villa: (g) => {
    g.fillStyle = '#f7f1e6'; g.beginPath(); g.rect(14, 44, 68, 38); g.fill(); stroke(g);
    g.fillStyle = '#d9876c'; g.beginPath(); g.moveTo(10, 46); g.lineTo(48, 26); g.lineTo(86, 46); g.closePath(); g.fill(); stroke(g);
    g.fillStyle = '#c9d8da'; for (let x = 20; x < 80; x += 14) { g.fillRect(x, 52, 7, 10); g.fillRect(x, 66, 7, 10); }
    g.fillStyle = '#c9d6b6'; g.beginPath(); g.arc(8, 76, 8, 0, Math.PI * 2); g.arc(88, 74, 9, 0, Math.PI * 2); g.fill();
  },
  tower: (g) => {
    g.fillStyle = '#f2ece0'; g.beginPath(); g.rect(34, 26, 28, 58); g.fill(); stroke(g);
    g.fillStyle = '#d9876c'; g.beginPath(); g.moveTo(30, 28); g.lineTo(48, 8); g.lineTo(66, 28); g.closePath(); g.fill(); stroke(g);
    g.fillStyle = INK; g.fillRect(44, 38, 8, 10); g.fillRect(44, 58, 8, 10);
  },
  boat: (g) => {
    g.fillStyle = '#cfdfe0'; g.beginPath(); g.moveTo(8, 56); g.lineTo(88, 56); g.lineTo(76, 74); g.lineTo(20, 74); g.closePath(); g.fill(); stroke(g);
    g.fillStyle = '#fbf8f2'; g.beginPath(); g.rect(28, 40, 40, 16); g.fill(); stroke(g, 1.8);
    g.beginPath(); g.moveTo(4, 82); g.bezierCurveTo(20, 76, 30, 88, 48, 82); g.bezierCurveTo(64, 76, 76, 88, 92, 82); g.strokeStyle = '#c9d8da'; g.lineWidth = 2.4; g.stroke();
  },
  park: (g) => {
    const tree = (x: number, y: number, r: number) => { g.fillStyle = '#dfe6cf'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); stroke(g, 1.8); g.beginPath(); g.moveTo(x, y + r); g.lineTo(x, y + r + 12); stroke(g, 2.4); };
    tree(30, 46, 16); tree(62, 40, 20); tree(78, 62, 11);
  },
  miniature: (g) => {
    g.fillStyle = '#f7f2e8'; g.beginPath(); g.rect(12, 56, 20, 20); g.fill(); stroke(g, 1.6);
    g.fillStyle = '#d9876c'; g.beginPath(); g.moveTo(10, 57); g.lineTo(22, 46); g.lineTo(34, 57); g.closePath(); g.fill(); stroke(g, 1.6);
    g.fillStyle = '#e4e8d6'; g.beginPath(); g.moveTo(40, 78); g.lineTo(62, 36); g.lineTo(84, 78); g.closePath(); g.fill(); stroke(g, 1.6);
    g.fillStyle = '#d2553a'; g.fillRect(8, 80, 80, 6); stroke(g, 1.4);
  },
};

/** Sceglie il disegno di landmark per un luogo del catalogo. */
export function landmarkFor(id: string, category: string): string | null {
  const byId: Record<string, string> = {
    lac: 'museum', 'masi-palazzo-reali': 'museum', musec: 'villa', 'villa-ciani': 'villa', 'parco-ciani': 'park', 'cattedrale-san-lorenzo': 'church', 'santa-maria-angioli': 'church',
    'monte-bre': 'summit', 'san-salvatore': 'summit', 'monte-boglia': 'summit', gandria: 'village', carona: 'village', 'bre-paese': 'village', swissminiatur: 'miniature',
    'museo-hesse': 'tower', 'parco-heleneum': 'villa', 'museo-doganale': 'boat', 'madonna-ghirli': 'church', 'sant-abbondio-gentilino': 'church', 'parco-san-grato': 'park',
  };
  if (byId[id]) return byId[id];
  if (category === 'summit') return 'summit';
  if (category === 'village') return 'village';
  if (category === 'church') return 'church';
  if (category === 'museum') return 'museum';
  return null;
}

export function placeIconFor(category: string): string {
  if (['museum', 'culture', 'church', 'show'].includes(category)) return 'place-culture';
  if (['park', 'walk', 'hike', 'lido', 'playground'].includes(category)) return 'place-nature';
  if (['restaurant', 'cafe', 'gelato', 'market'].includes(category)) return 'place-food';
  if (['viewpoint', 'summit', 'lift'].includes(category)) return 'place-views';
  if (['bar', 'nightlife'].includes(category)) return 'place-night';
  if (['village'].includes(category)) return 'place-village';
  if (['attraction'].includes(category)) return 'place-family';
  return 'place-default';
}
