import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// WCAG 2.1 A/AA con axe-core sulle viste principali (la tela WebGL è esclusa:
// le stesse informazioni sono nel pannello e nella vista elenco)
async function violations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.maplibregl-canvas').analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
}

test('accessibilità: home, modulo, proposte, simulazione, esplora senza violazioni WCAG AA', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Racconta la giornata che vuoi vivere')).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: /Organizza una giornata/ }).click();
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Torna all\'inizio' }).click();
  await page.getByText('Serata fra amici').click();
  await page.getByRole('button', { name: 'Proponi programmi' }).click();
  await expect(page.getByRole('heading', { name: /^\d proposte$/ })).toBeVisible({ timeout: 60_000 });
  expect(await violations(page)).toEqual([]);
  await page.locator('.alt-card').first().getByRole('button', { name: 'Scegli e simula' }).click();
  await expect(page.locator('.sim-controls')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Esplora' }).first().click();
  await expect(page.locator('.explore, .panel-body').first()).toBeVisible();
  await page.waitForTimeout(800);
  expect(await violations(page)).toEqual([]);
});

test('tastiera: si arriva al modulo con Tab, il focus è visibile, i dialoghi si chiudono con Esc e il focus torna al pulsante di apertura', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Racconta la giornata che vuoi vivere')).toBeVisible();
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    await page.keyboard.press('Tab');
    found = await page.evaluate(() => /Organizza una giornata/.test(document.activeElement?.textContent ?? ''));
  }
  expect(found).toBe(true);
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wizard-title')).toBeVisible();
  // dialogo «E se… piove» da tastiera durante la simulazione
  await page.getByRole('button', { name: 'Torna all\'inizio' }).click();
  await page.getByText('Serata fra amici').click();
  await page.getByRole('button', { name: 'Proponi programmi' }).click();
  await expect(page.getByRole('heading', { name: /^\d proposte$/ })).toBeVisible({ timeout: 60_000 });
  await page.locator('.alt-card').first().getByRole('button', { name: 'Scegli e simula' }).click();
  await page.getByRole('button', { name: 'Cambia idea…' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '…piove' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Cambia idea…');
});
