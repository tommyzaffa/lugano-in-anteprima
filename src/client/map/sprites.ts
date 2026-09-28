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
  if (map.hasImage(id)) map.removeImage(id);
  const img = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  map.addImage(id, { width: c.width, height: c.height, data: new Uint8Array(img.data.buffer) }, { pixelRatio, sdf });
}

// generatore pseudo-casuale deterministico
function rng(seed: number) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

const POI_GLYPH: Record<string, string> = {
  museum: 'M', gallery: 'A', viewpoint: '◉', attraction: '★', artwork: '✦', lodging: 'H', picnic: '⌂', info: 'i', restaurant: '🍴', cafe: 'C', bar: 'B',
  ice_cream: 'G', fast_food: 'F', theatre: 'T', cinema: 'Ci', nightclub: 'D', casino: '♠', library: 'L', market: 'Mk', worship: '✝', toilets: 'WC', water: '💧',
  fountain: '⛲', playground: 'P', lido: '≈', park: '♣', nature: '♣', historic: '⌘', bakery: 'Pa', food_shop: 'Sh', shop: 'Sh', pier: '⚓',
};
const POI_COLOR: Record<string, string> = {
  museum: '#7c5e9a', gallery: '#7c5e9a', viewpoint: '#c8643c', attraction: '#c8643c', artwork: '#b94a5a', restaurant: '#b5643c', cafe: '#8a6d4c', bar: '#8a4a6d', ice_cream: '#d06f9a',
  theatre: '#7c5e9a', cinema: '#7c5e9a', nightclub: '#5b3a6d', worship: '#6b6b6b', toilets: '#3f7f93', water: '#3f7f93', playground: '#6f8f4e', lido: '#3f7f93', park: '#6f8f4e',
  nature: '#6f8f4e', historic: '#8a6d4c', pier: '#3f7f93', market: '#d9a441',
};

export function installImages(map: MLMap) {
  // figure decorative del modellino (non rappresentano presenze reali)
  const DRESS = ['#8a6d4c', '#3f7f93', '#b94a5a', '#6f8f4e', '#d9a441', '#7c5e9a'];
  for (let k = 0; k < 6; k++) {
    const { c, g } = canvas(20, 40);
    const r = rng(101 + k);
    g.fillStyle = 'rgba(43,42,39,0.18)'; g.beginPath(); g.ellipse(10, 37, 6, 2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3b3a37'; g.fillRect(6.5, 26, 2.6, 10); g.fillRect(10.9, 26, 2.6, 10);
    g.fillStyle = DRESS[k]; g.beginPath(); g.moveTo(4.5, 27); g.lineTo(15.5, 27); g.lineTo(14, 13); g.lineTo(6, 13); g.closePath(); g.fill();
    g.strokeStyle = '#2b2a27'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = ['#f0cfa8', '#c99a6b', '#8d5a3b'][Math.floor(r() * 3)]; g.beginPath(); g.arc(10, 8.5, 4.3, 0, Math.PI * 2); g.fill(); g.stroke();
    if (k % 3 === 1) { g.fillStyle = '#e9d8b4'; g.fillRect(5, 3.4, 10, 2.2); g.strokeRect(5, 3.4, 10, 2.2); }
    add(map, `npc-${k}`, c, 2);
  }
  // grana della carta
  {
    const { c, g } = canvas(128, 128);
    const r = rng(7);
    g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const x = r() * 128, y = r() * 128, a = r() * 0.06;
      g.fillStyle = r() > 0.5 ? `rgba(90,70,40,${a})` : `rgba(255,255,255,${a * 1.4})`;
      g.fillRect(x, y, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(110,90,60,${0.03 + r() * 0.03})`;
      g.beginPath(); const y = r() * 128; g.moveTo(0, y); g.bezierCurveTo(40, y + r() * 8 - 4, 90, y + r() * 8 - 4, 128, y + r() * 6 - 3); g.stroke();
    }
    add(map, 'paper-grain', c, 2);
  }
  // puntinato del bosco (chiome stilizzate)
  {
    const { c, g } = canvas(64, 64);
    const r = rng(11);
    for (let i = 0; i < 9; i++) {
      const x = 4 + r() * 56, y = 4 + r() * 56, rad = 3 + r() * 2.5;
      g.fillStyle = 'rgba(95,120,70,0.45)'; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(55,70,40,0.55)'; g.lineWidth = 0.8; g.beginPath(); g.arc(x, y, rad, Math.PI * 0.9, Math.PI * 2.2); g.stroke();
    }
    add(map, 'tree-stipple', c, 2);
  }
  // filari delle vigne
  {
    const { c, g } = canvas(32, 32);
    g.strokeStyle = 'rgba(110,120,60,0.6)'; g.lineWidth = 1.2; g.setLineDash([2, 2]);
    for (let y = 4; y < 32; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(32, y); g.stroke(); }
    add(map, 'vineyard-rows', c, 2);
  }
  // icone POI
  for (const [cls, glyph] of Object.entries(POI_GLYPH)) {
    const { c, g } = canvas(34, 34);
    g.fillStyle = '#fbf6ea'; g.strokeStyle = POI_COLOR[cls] ?? '#5d574c'; g.lineWidth = 2.4;
    g.beginPath(); g.arc(17, 17, 13, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = POI_COLOR[cls] ?? '#5d574c';
    g.font = `bold ${glyph.length > 1 && !/\p{Extended_Pictographic}/u.test(glyph) ? 11 : 14}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(glyph, 17, 18);
    add(map, `poi-${cls}`, c, 2);
  }
  // segnaposto delle tappe numerate (colorati via SDF non servono: disegniamo 12 varianti)
  for (let n = 1; n <= 12; n++) {
    const { c, g } = canvas(48, 60);
    g.fillStyle = '#c8643c'; g.strokeStyle = '#2b2a27'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(24, 58); g.bezierCurveTo(8, 38, 4, 30, 4, 22); g.arc(24, 22, 20, Math.PI, 0); g.bezierCurveTo(44, 30, 40, 38, 24, 58); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fbf6ea'; g.beginPath(); g.arc(24, 22, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2b2a27'; g.font = 'bold 17px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 24, 23);
    add(map, `stop-${n}`, c, 2);
  }
  // bandierina partenza/arrivo
  {
    const { c, g } = canvas(40, 52);
    g.strokeStyle = '#2b2a27'; g.lineWidth = 3; g.beginPath(); g.moveTo(8, 50); g.lineTo(8, 4); g.stroke();
    g.fillStyle = '#2f8f7a'; g.beginPath(); g.moveTo(9, 5); g.lineTo(36, 12); g.lineTo(9, 20); g.closePath(); g.fill(); g.lineWidth = 2; g.stroke();
    add(map, 'flag-start', c, 2);
  }
  {
    const { c, g } = canvas(44, 44);
    g.fillStyle = '#fbf6ea'; g.strokeStyle = '#2b2a27'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(22, 4); g.lineTo(40, 20); g.lineTo(34, 20); g.lineTo(34, 40); g.lineTo(10, 40); g.lineTo(10, 20); g.lineTo(4, 20); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#c8643c'; g.fillRect(18, 27, 8, 13);
    add(map, 'flag-end', c, 2);
  }
  // decisione
  {
    const { c, g } = canvas(40, 40);
    g.fillStyle = '#d9a441'; g.strokeStyle = '#2b2a27'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(20, 3); g.lineTo(37, 20); g.lineTo(20, 37); g.lineTo(3, 20); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#2b2a27'; g.font = 'bold 20px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 20, 21);
    add(map, 'decision', c, 2);
  }
  // disegni dei landmark
  for (const [id, draw] of Object.entries(LANDMARKS)) {
    const { c, g } = canvas(96, 96);
    g.lineJoin = 'round'; g.lineCap = 'round';
    draw(g);
    add(map, `lm-${id}`, c, 2);
  }
  // luogo del catalogo (pallino con bordo)
  for (const [id, color] of Object.entries({ culture: '#7c5e9a', nature: '#6f8f4e', food: '#b5643c', views: '#c8643c', night: '#5b3a6d', village: '#8a6d4c', family: '#3f7f93', default: '#5d574c' })) {
    const { c, g } = canvas(30, 30);
    g.fillStyle = color; g.strokeStyle = '#fbf6ea'; g.lineWidth = 3;
    g.beginPath(); g.arc(15, 15, 10, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = '#2b2a27'; g.lineWidth = 1.2; g.beginPath(); g.arc(15, 15, 12, 0, Math.PI * 2); g.stroke();
    add(map, `place-${id}`, c, 2);
  }
}

type Draw = (g: CanvasRenderingContext2D) => void;
const INK = '#2b2a27';
function stroke(g: CanvasRenderingContext2D, w = 2.2) { g.strokeStyle = INK; g.lineWidth = w; g.stroke(); }
const LANDMARKS: Record<string, Draw> = {
  church: (g) => {
    g.fillStyle = '#f1e3cc'; g.beginPath(); g.rect(22, 44, 40, 40); g.fill(); stroke(g);
    g.fillStyle = '#c6653f'; g.beginPath(); g.moveTo(18, 46); g.lineTo(42, 26); g.lineTo(66, 46); g.closePath(); g.fill(); stroke(g);
    g.fillStyle = '#ecdcc3'; g.beginPath(); g.rect(62, 22, 16, 62); g.fill(); stroke(g);
    g.fillStyle = '#c6653f'; g.beginPath(); g.moveTo(60, 24); g.lineTo(70, 8); g.lineTo(80, 24); g.closePath(); g.fill(); stroke(g);
    g.fillStyle = INK; g.beginPath(); g.arc(42, 62, 6, Math.PI, 0); g.lineTo(48, 84); g.lineTo(36, 84); g.closePath(); g.fill();
  },
  museum: (g) => {
    g.fillStyle = '#e8e2d6'; g.beginPath(); g.rect(10, 40, 76, 42); g.fill(); stroke(g);
    g.fillStyle = '#4d8795'; for (let x = 16; x < 82; x += 12) { g.fillRect(x, 48, 7, 26); }
    g.fillStyle = '#2b2a27'; g.beginPath(); g.moveTo(6, 40); g.lineTo(90, 40); g.lineTo(84, 32); g.lineTo(12, 32); g.closePath(); g.fill();
  },
  summit: (g) => {
    g.fillStyle = '#b3c496'; g.beginPath(); g.moveTo(4, 88); g.lineTo(48, 22); g.lineTo(92, 88); g.closePath(); g.fill(); stroke(g);
    g.fillStyle = '#f8f3e8'; g.beginPath(); g.moveTo(38, 37); g.lineTo(48, 22); g.lineTo(58, 37); g.lineTo(52, 34); g.lineTo(48, 39); g.lineTo(44, 34); g.closePath(); g.fill(); stroke(g, 1.6);
    g.beginPath(); g.moveTo(48, 22); g.lineTo(48, 6); g.moveTo(42, 11); g.lineTo(54, 11); stroke(g, 2.6);
  },
  funicular: (g) => {
    g.beginPath(); g.moveTo(6, 86); g.lineTo(90, 26); stroke(g, 3);
    g.save(); g.translate(48, 56); g.rotate(-0.62);
    g.fillStyle = '#b0442c'; g.beginPath(); g.rect(-20, -13, 40, 22); g.fill(); stroke(g);
    g.fillStyle = '#f8f3e8'; g.fillRect(-15, -8, 8, 8); g.fillRect(-4, -8, 8, 8); g.fillRect(7, -8, 8, 8);
    g.restore();
  },
  village: (g) => {
    const house = (x: number, y: number, w: number, h: number) => {
      g.fillStyle = '#f1e3cc'; g.beginPath(); g.rect(x, y, w, h); g.fill(); stroke(g, 1.8);
      g.fillStyle = '#c6653f'; g.beginPath(); g.moveTo(x - 3, y + 1); g.lineTo(x + w / 2, y - h * 0.45); g.lineTo(x + w + 3, y + 1); g.closePath(); g.fill(); stroke(g, 1.8);
      g.fillStyle = INK; g.fillRect(x + w * 0.35, y + h * 0.4, w * 0.3, h * 0.35);
    };
    house(14, 58, 22, 26); house(40, 46, 24, 38); house(66, 60, 20, 24);
  },
  villa: (g) => {
    g.fillStyle = '#f0e0c2'; g.beginPath(); g.rect(14, 44, 68, 38); g.fill(); stroke(g);
    g.fillStyle = '#c6653f'; g.beginPath(); g.moveTo(10, 46); g.lineTo(48, 26); g.lineTo(86, 46); g.closePath(); g.fill(); stroke(g);
    g.fillStyle = '#4d8795'; for (let x = 20; x < 80; x += 14) { g.fillRect(x, 52, 7, 10); g.fillRect(x, 66, 7, 10); }
    g.fillStyle = '#6f8f4e'; g.beginPath(); g.arc(8, 76, 8, 0, Math.PI * 2); g.arc(88, 74, 9, 0, Math.PI * 2); g.fill();
  },
  tower: (g) => {
    g.fillStyle = '#ecdcc3'; g.beginPath(); g.rect(34, 26, 28, 58); g.fill(); stroke(g);
    g.fillStyle = '#c6653f'; g.beginPath(); g.moveTo(30, 28); g.lineTo(48, 8); g.lineTo(66, 28); g.closePath(); g.fill(); stroke(g);
    g.fillStyle = INK; g.fillRect(44, 38, 8, 10); g.fillRect(44, 58, 8, 10);
  },
  boat: (g) => {
    g.fillStyle = '#3f7f93'; g.beginPath(); g.moveTo(8, 56); g.lineTo(88, 56); g.lineTo(76, 74); g.lineTo(20, 74); g.closePath(); g.fill(); stroke(g);
    g.fillStyle = '#f8f3e8'; g.beginPath(); g.rect(28, 40, 40, 16); g.fill(); stroke(g, 1.8);
    g.beginPath(); g.moveTo(4, 82); g.bezierCurveTo(20, 76, 30, 88, 48, 82); g.bezierCurveTo(64, 76, 76, 88, 92, 82); g.strokeStyle = '#4d8795'; g.lineWidth = 2.4; g.stroke();
  },
  park: (g) => {
    const tree = (x: number, y: number, r: number) => { g.fillStyle = '#8fa870'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); stroke(g, 1.8); g.beginPath(); g.moveTo(x, y + r); g.lineTo(x, y + r + 12); stroke(g, 2.4); };
    tree(30, 46, 16); tree(62, 40, 20); tree(78, 62, 11);
  },
  miniature: (g) => {
    g.fillStyle = '#f1e3cc'; g.beginPath(); g.rect(12, 56, 20, 20); g.fill(); stroke(g, 1.6);
    g.fillStyle = '#c6653f'; g.beginPath(); g.moveTo(10, 57); g.lineTo(22, 46); g.lineTo(34, 57); g.closePath(); g.fill(); stroke(g, 1.6);
    g.fillStyle = '#b3c496'; g.beginPath(); g.moveTo(40, 78); g.lineTo(62, 36); g.lineTo(84, 78); g.closePath(); g.fill(); stroke(g, 1.6);
    g.fillStyle = '#c0392b'; g.fillRect(8, 80, 80, 6); stroke(g, 1.4);
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
