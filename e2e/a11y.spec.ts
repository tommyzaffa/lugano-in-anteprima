import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// WCAG 2.1 A/AA con axe-core sulle viste principali (la tela WebGL è esclusa:
// le stesse informazioni sono nel pannello e nella vista elenco)
async function violations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.maplibregl-canvas').analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
}
const RESULTS = /idee per voi|Un'idea per voi/;

test('accessibilità: schermata iniziale, modulo, proposte, simulazione, esplora senza violazioni WCAG AA', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Organizza una giornata' })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Organizza una giornata' }).click();
  await expect(page.locator('.wizard-title')).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Avanti' }).click();
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.locator('summary', { hasText: 'Esigenze e preferenze' }).click();
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Torna all\'inizio' }).click();
  await page.getByRole('button', { name: /Serata fra amici/ }).click();
  await expect(page.getByRole('heading', { name: RESULTS })).toBeVisible({ timeout: 60_000 });
  expect(await violations(page)).toEqual([]);
  await page.locator('.alt-card').first().getByRole('button', { name: 'Prova questa giornata' }).click();
  await expect(page.locator('.sim-controls')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Esplora', exact: true }).click();
  await expect(page.locator('.explore')).toBeVisible();
  await page.waitForTimeout(800);
  expect(await violations(page)).toEqual([]);
});

test('tastiera: dalla schermata iniziale al modulo con Tab, focus visibile, dialoghi chiusi con Esc e focus restituito', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Organizza una giornata' })).toBeVisible();
  let found = false;
  for (let i = 0; i < 6 && !found; i++) {
    await page.keyboard.press('Tab');
    found = await page.evaluate(() => /Organizza una giornata/.test(document.activeElement?.textContent ?? ''));
  }
  // sotto la schermata iniziale nulla è raggiungibile: si arriva subito ai suoi pulsanti
  expect(found).toBe(true);
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wizard-title')).toBeVisible();
  // dialogo «E se piove?» da tastiera durante la simulazione
  await page.getByRole('button', { name: 'Torna all\'inizio' }).click();
  await page.getByRole('button', { name: /Serata fra amici/ }).click();
  await expect(page.getByRole('heading', { name: RESULTS })).toBeVisible({ timeout: 60_000 });
  await page.locator('.alt-card').first().getByRole('button', { name: 'Prova questa giornata' }).click();
  await page.getByRole('button', { name: 'Cambia idea' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'E se piove?' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Cambia idea');
});
