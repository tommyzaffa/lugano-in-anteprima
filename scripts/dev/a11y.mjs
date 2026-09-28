// Audit di accessibilità (axe-core, WCAG 2.1 A/AA) sulle viste principali.
// Uso: node scripts/dev/a11y.mjs [url]
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const audit = async (name) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.maplibregl-canvas').analyze();
  console.log(`\n## ${name}: ${r.violations.length} violazioni`);
  for (const v of r.violations) {
    console.log(`- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
    for (const n of v.nodes.slice(0, 4)) console.log(`    ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`);
  }
};
await page.goto(base + '/');
await page.waitForTimeout(3000);
await audit('home');
await page.getByRole('button', { name: /Organizza una giornata/ }).click();
await page.waitForTimeout(500);
await audit('modulo passo 1');
for (let i = 0; i < 5; i++) { const b = page.getByRole('button', { name: 'Avanti' }); if (await b.count()) { await b.click(); await page.waitForTimeout(300); } }
await audit('modulo riepilogo');
await page.getByRole('button', { name: 'Torna all\'inizio' }).click();
await page.getByText('Serata fra amici').click();
await page.getByRole('button', { name: 'Proponi programmi' }).click();
await page.getByRole('heading', { name: /^\d propost[ae]$/ }).waitFor({ timeout: 60000 });
await audit('proposte');
await page.locator('.alt-card').first().getByRole('button', { name: 'Scegli e simula' }).click();
await page.waitForTimeout(1500);
await audit('simulazione');
await page.getByRole('button', { name: 'Vai al riepilogo' }).click();
await page.waitForTimeout(800);
const d = page.locator('.decision-box .decision-opt');
if (await d.count()) { await d.first().click(); await page.waitForTimeout(1200); await page.getByRole('button', { name: 'Vai al riepilogo' }).click(); await page.waitForTimeout(800); }
await audit('riepilogo');
await page.getByRole('button', { name: 'Esplora' }).first().click();
await page.waitForTimeout(1500);
await audit('esplora');
await page.getByRole('button', { name: 'Eventi' }).first().click();
await page.waitForTimeout(1000);
await audit('eventi');
await page.getByRole('button', { name: 'Impostazioni' }).click();
await page.waitForTimeout(500);
await audit('impostazioni');
await browser.close();
