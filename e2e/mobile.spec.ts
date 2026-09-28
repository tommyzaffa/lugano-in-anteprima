import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('telefono e movimento ridotto (scenario L): modulo, confronto, salto e salvataggio', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Impostazioni' }).click();
  await page.getByLabel(/Movimento ridotto/).check();
  await page.getByRole('button', { name: 'Torna all\'inizio' }).click();
  await page.getByText('Famiglia con passeggino').click();
  await page.getByRole('button', { name: 'Proponi programmi' }).click();
  await expect(page.getByRole('heading', { name: /^\d proposte$/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.compare')).toBeAttached();
  await page.locator('.alt-card').first().getByRole('button', { name: 'Scegli e simula' }).click();
  await expect(page.locator('.sim-controls')).toBeVisible();
  const box = await page.getByRole('button', { name: 'Avvia' }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Avvia' }).click();
  await page.waitForTimeout(2000);
  await expect(page.locator('.cutscene')).toHaveCount(0);
  await page.getByRole('button', { name: 'Salta spostamento' }).click();
  await page.getByRole('button', { name: 'Vai al riepilogo' }).click();
  // con una decisione obbligatoria il riepilogo non viene forzato: si sceglie e si prosegue
  if (await page.locator('.decision-box').count()) {
    await page.locator('.decision-opt').first().click();
    await page.getByRole('button', { name: 'Vai al riepilogo' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Fonti e limiti' })).toBeVisible();
  await page.locator('.summary-actions').getByRole('button', { name: 'Salva', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('salvato');
  // nessuno scroll orizzontale della pagina
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

test('schermi stretti: barra superiore senza sbordare, vista elenco e ritorno alla mappa', async ({ page }) => {
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/');
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
    const m = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      nav: document.querySelector('.topnav')!.scrollWidth - document.querySelector('.topnav')!.clientWidth,
      gear: document.querySelector('[aria-label="Impostazioni"]')!.getBoundingClientRect().right,
    }));
    expect(m.page).toBe(0);
    expect(m.nav).toBe(0);
    expect(m.gear).toBeLessThanOrEqual(width);
  }
  await page.getByRole('button', { name: 'Elenco' }).click();
  await expect(page.locator('.fallback')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Torna alla mappa' }).click();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
});

test('accessibilità su telefono: home e modulo senza violazioni WCAG AA', async ({ page }) => {
  const check = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.maplibregl-canvas').analyze()).violations.map((v) => v.id);
  await page.goto('/');
  await expect(page.getByText('Racconta la giornata che vuoi vivere')).toBeVisible();
  expect(await check()).toEqual([]);
  await page.getByRole('button', { name: /Organizza una giornata/ }).click();
  expect(await check()).toEqual([]);
});
