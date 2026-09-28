// Misura: tempo fino all'interfaccia utilizzabile e alla mappa pronta; fps durante la simulazione.
import { chromium } from '@playwright/test';
const [,, url = 'http://127.0.0.1:8790/', mode = 'gpu', w = '1280', h = '800'] = process.argv;
const args = mode === 'gpu' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
if (process.env.NET === '4g') {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  // profilo 4G di riferimento: 9 Mbit/s giù, 1.5 Mbit/s su, 60 ms di latenza
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 });
}
const t0 = Date.now();
await page.goto(url);
await page.getByText('Organizza una giornata').waitFor();
const uiReady = Date.now() - t0;
await page.waitForFunction(() => (window).__mapReady === true || !!document.querySelector('.maplibregl-canvas'), null, { timeout: 30000 });
await page.waitForTimeout(200);
const mapIdle = await page.evaluate(() => new Promise((res) => { const s = performance.now(); const check = () => { const c = document.querySelector('.maplibregl-canvas'); if (c) res(performance.now()); else setTimeout(check, 50); }; check(); }));
await page.waitForFunction(() => performance.getEntriesByName('map-idle').length > 0, null, { timeout: 30000 }).catch(() => {});
const mapMarks = await page.evaluate(() => ({ mapLoad: Math.round(performance.getEntriesByName('map-load')[0]?.startTime ?? -1), mapIdle: Math.round(performance.getEntriesByName('map-idle')[0]?.startTime ?? -1) }));
const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const fcp = performance.getEntriesByName('first-contentful-paint')[0]; return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null }; });
const gl = await page.evaluate(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/d'; });
// pianificazione + simulazione
await page.getByText('Serata fra amici').click();
const tp = Date.now();
await page.getByRole('button', { name: 'Proponi programmi' }).click();
await page.getByRole('heading', { name: /^\d proposte$/ }).waitFor({ timeout: 60000 });
const planMs = Date.now() - tp;
await page.locator('.alt-card').first().getByRole('button', { name: 'Scegli e simula' }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /^4×$/ }).click();
await page.getByRole('button', { name: 'Avvia' }).click();
await page.waitForTimeout(1500);
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 5000) requestAnimationFrame(f); else res(Math.round((n / (performance.now() - s)) * 10000) / 10); }; requestAnimationFrame(f); }));
const detail = await page.evaluate(() => (window).__detailLevel ?? 0);
console.log(JSON.stringify({ net: process.env.NET ?? 'locale', mode, viewport: `${w}x${h}`, renderer: gl, uiReadyMs: uiReady, ...nav, ...mapMarks, planMs, simFps4x: fps, detailLevel: detail }));
await browser.close();
