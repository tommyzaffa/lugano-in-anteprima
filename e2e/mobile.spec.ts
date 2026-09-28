import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('telefono e movimento ridotto: idea, proposte, simulazione e riepilogo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Esplora la mappa' }).click();
  await page.getByRole('button', { name: 'Altro' }).click();
  await page.getByRole('menuitem', { name: 'Impostazioni' }).click();
  await page.getByLabel(/Movimento ridotto/).check();
  await page.getByRole('button', { name: 'Torna all\'inizio' }).click();
  await page.getByRole('button', { name: /Famiglia con passeggino/ }).click();
  await expect(page.getByRole('heading', { name: /idee per voi|Un'idea per voi/ })).toBeVisible({ timeout: 60_000 });
  await page.locator('.alt-card').first().getByRole('button', { name: 'Prova questa giornata' }).click();
  await expect(page.locator('.sim-controls')).toBeVisible();
  // comandi grandi e raggiungibili col pollice
  const box = await page.getByRole('button', { name: 'Avvia' }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  // il riquadro «Adesso» resta visibile sopra i comandi
  const now = await page.locator('.now-card').boundingBox();
  const ctl = await page.locator('.sim-pill').boundingBox();
  expect(now!.y).toBeLessThan(ctl!.y);
  await page.getByRole('button', { name: 'Avvia' }).click();
  await page.waitForTimeout(2000);
  await expect(page.locator('.cutscene')).toHaveCount(0);
  await page.getByRole('button', { name: 'Salta spostamento' }).click();
  for (let i = 0; i < 6 && !(await page.locator('.summary').count()); i++) {
    await page.getByRole('button', { name: 'Fine: riepilogo' }).click();
    // una decisione apre il foglio: le opzioni si vedono e si toccano
    const opt = page.locator('.decision-opt');
    if (await opt.count()) { await expect(opt.first()).toBeInViewport(); await opt.first().click(); }
  }
  await expect(page.locator('.summary-list')).toBeVisible();
  // nessuno scroll orizzontale della pagina
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

test('schermi stretti: barra superiore senza sbordare, vista elenco e ritorno alla mappa', async ({ page }) => {
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Esplora la mappa' }).click();
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
    const m = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      nav: document.querySelector('.topnav')!.scrollWidth - document.querySelector('.topnav')!.clientWidth,
      more: document.querySelector('[aria-label="Altro"]')!.getBoundingClientRect().right,
    }));
    expect(m.page).toBe(0);
    expect(m.nav).toBe(0);
    expect(m.more).toBeLessThanOrEqual(width);
  }
  await page.getByRole('button', { name: 'Altro' }).click();
  await page.getByRole('menuitem', { name: /Vista elenco/ }).click();
  await expect(page.locator('.fallback')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Altro' }).click();
  await page.getByRole('menuitem', { name: 'Torna alla mappa' }).click();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
});

test('accessibilità su telefono: schermata iniziale e modulo senza violazioni WCAG AA', async ({ page }) => {
  const check = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.maplibregl-canvas').analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Organizza una giornata' })).toBeVisible();
  expect(await check()).toEqual([]);
  await page.getByRole('button', { name: 'Organizza una giornata' }).click();
  await expect(page.locator('.wizard-title')).toBeVisible();
  expect(await check()).toEqual([]);
});
