// Genera i glifi SDF (PBF, formato MapLibre) di un carattere web per le etichette della mappa.
// Usa Chromium (Playwright) e TinySDF con gli stessi parametri di MapLibre (24 px, buffer 3,
// raggio 8, cutoff 0.25); i caratteri mancanti nel font ricadono sul sans-serif di sistema.
//
// Uso: node scripts/dev/build-glyphs.mjs [file.woff2] ["Nome Fontstack"]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { PbfWriter as Pbf } from 'pbf';

const FONT = process.argv[2] ?? 'node_modules/@fontsource/architects-daughter/files/architects-daughter-latin-400-normal.woff2';
const STACK = process.argv[3] ?? 'Architects Daughter Regular';
const RANGES = [0, 256, 8192, 9472]; // latino, latino esteso, punteggiatura (’ – …), forme geometriche (▲)
const tinySdf = readFileSync('node_modules/@mapbox/tiny-sdf/index.js', 'utf8').replace(/export default class/, 'class').concat('\nwindow.TinySDF = TinySDF;');
const font64 = readFileSync(FONT).toString('base64');

const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage();
await page.setContent(`<style>@font-face{font-family:'GlyphFont';src:url(data:font/woff2;base64,${font64}) format('woff2');}</style><div style="font-family:GlyphFont">Lugano àèéìòù</div>`);
await page.addScriptTag({ content: tinySdf });
await page.evaluate(() => document.fonts.ready);

const outDir = `public/glyphs/${STACK}`;
mkdirSync(outDir, { recursive: true });
for (const start of RANGES) {
  const glyphs = await page.evaluate((start) => {
    const sdf = new window.TinySDF({ fontSize: 24, buffer: 3, radius: 8, cutoff: 0.25, fontFamily: 'GlyphFont, sans-serif', fontWeight: 'normal' });
    const out = [];
    for (let id = start; id < start + 256; id++) {
      if (id < 32 || (id >= 127 && id < 160)) continue;
      const g = sdf.draw(String.fromCodePoint(id));
      out.push({ id, data: Array.from(g.data), width: g.glyphWidth, height: g.glyphHeight, left: g.glyphLeft, top: g.glyphTop, advance: g.glyphAdvance, bw: g.width, bh: g.height });
    }
    return out;
  }, start);
  const pbf = new Pbf();
  pbf.writeMessage(1, (_, p) => {
    p.writeStringField(1, STACK);
    p.writeStringField(2, `${start}-${start + 255}`);
    for (const g of glyphs) {
      p.writeMessage(3, (gl, q) => {
        q.writeVarintField(1, gl.id);
        // senza disegno (spazi): nessuna bitmap, dimensioni 0
        if (gl.width > 0 && gl.height > 0) q.writeBytesField(2, Uint8Array.from(gl.data));
        q.writeVarintField(3, gl.width > 0 && gl.height > 0 ? gl.width : 0);
        q.writeVarintField(4, gl.width > 0 && gl.height > 0 ? gl.height : 0);
        q.writeSVarintField(5, Math.round(gl.left + 0.5));
        q.writeSVarintField(6, Math.round(gl.top - 27));
        q.writeVarintField(7, Math.round(gl.advance));
      }, g);
    }
  });
  writeFileSync(`${outDir}/${start}-${start + 255}.pbf`, pbf.finish());
  console.log(`${outDir}/${start}-${start + 255}.pbf: ${glyphs.length} glifi`);
}
await browser.close();
