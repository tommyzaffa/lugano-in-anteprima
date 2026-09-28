// Screenshot di verifica visiva con Chrome di sistema (Playwright).
import { chromium } from '@playwright/test';
const [,, url = 'http://127.0.0.1:5173/', out = 'shot.png', w = '1280', h = '800', wait = '6000', ...actions] = process.argv;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(Number(wait));
for (const a of actions) {
  const [kind, ...rest] = a.split(':');
  const arg = rest.join(':');
  if (kind === 'click') await page.getByText(arg, { exact: false }).first().click();
  if (kind === 'role') { const [role, name] = arg.split('|'); await page.getByRole(role, { name }).first().click(); }
  if (kind === 'wait') await page.waitForTimeout(Number(arg));
  if (kind === 'eval') console.log(JSON.stringify(await page.evaluate(arg)));
  if (kind === 'shot') await page.screenshot({ path: arg });
}
await page.screenshot({ path: out });
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
