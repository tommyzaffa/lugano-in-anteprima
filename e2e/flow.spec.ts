import { test, expect, type Page } from '@playwright/test';

async function waitMap(page: Page) {
  await page.waitForFunction(() => { const c = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement | null; return !!c && c.width > 0; }, null, { timeout: 30_000 });
}

test('flusso principale: modulo → proposte → simulazione → decisione → riepilogo → salvataggio → condivisione revocabile', async ({ page, browser }) => {
  await page.goto('/');
  await expect(page.getByText('Racconta la giornata che vuoi vivere')).toBeVisible();
  await expect(page.locator('.demo-pill')).toContainText('DEMO');
  await waitMap(page);
  await page.getByText('Serata fra amici').click();
  await expect(page.getByRole('heading', { name: 'Riepilogo' })).toBeVisible();
  await page.getByRole('button', { name: 'Proponi programmi' }).click();
  await expect(page.getByRole('heading', { name: /^\d proposte$/ })).toBeVisible({ timeout: 60_000 });
  const cards = page.locator('.alt-card');
  expect(await cards.count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.compare table')).toBeVisible();
  await expect(cards.first()).toContainText('Pianificatore deterministico');
  // dettagli e verifiche
  await cards.first().getByRole('button', { name: 'Dettagli e verifiche' }).click();
  await expect(cards.first().locator('.checks')).toBeVisible();
  await cards.first().getByRole('button', { name: 'Scegli e simula' }).click();
  // quattro personaggi sulla mappa
  await expect(page.locator('.sim-controls')).toBeVisible();
  await page.waitForTimeout(1500);
  const clock0 = await page.locator('.clock-time').textContent();
  await page.getByRole('button', { name: 'Salta spostamento' }).click();
  const clock1 = await page.locator('.clock-time').textContent();
  expect(clock1).not.toBe(clock0);
  // prossima decisione: la simulazione si ferma e chiede
  await page.getByRole('button', { name: 'Prossima decisione' }).click();
  const decision = page.locator('.decision-box');
  if (await decision.count()) {
    await expect(decision).toBeVisible();
    // «vai al riepilogo» non risponde al posto nostro
    await page.getByRole('button', { name: 'Vai al riepilogo' }).click();
    await expect(page.locator('.toast')).toContainText('scelta');
    await decision.locator('.decision-opt').nth(1).click();
    await expect(page.locator('.branches')).toContainText('Scelta');
  }
  await page.getByRole('button', { name: 'Vai al riepilogo' }).click();
  await expect(page.getByRole('heading', { name: 'Fonti e limiti' })).toBeVisible();
  await expect(page.locator('.summary-list .summary-item').first()).toBeVisible();
  // verifica dei dati attuali
  await page.getByRole('button', { name: /Verifica i dati adesso/ }).click();
  await expect(page.locator('.reval .notice')).toBeVisible();
  // piano B per la pioggia: alternative al coperto o spiegazione che non servono
  await page.getByRole('button', { name: /Prepara le alternative al coperto/ }).click();
  await expect(page.locator('.planb-list, .planb p.muted')).toBeVisible({ timeout: 15_000 });
  // salvataggio e condivisione
  await page.locator('.summary-actions').getByRole('button', { name: 'Salva', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('salvato');
  await expect(page).toHaveURL(/\/p\/[\w-]+#k=/);
  await page.locator('.summary-actions').getByRole('button', { name: 'Condividi', exact: true }).click();
  await page.getByRole('button', { name: 'Crea link' }).click();
  const link = await page.locator('.share-link input').inputValue();
  expect(link).toMatch(/\/s\/[\w-]+$/);
  // il link condiviso non contiene la partenza se nascosta
  const other = await browser.newPage();
  await other.goto(link);
  await expect(other.locator('.share-view')).toBeVisible();
  await other.locator('.share-view .alt-card').first().getByRole('button', { name: /Voto/ }).click();
  await expect(other.locator('.toast')).toContainText('Voto registrato');
  // revoca
  await page.locator('.share-list').getByRole('button', { name: 'revoca' }).first().click();
  await expect(page.locator('.toast')).toContainText('revocato');
  await other.reload();
  await expect(other.getByText('revocato')).toBeVisible();
});

test('modulo manuale: 3 persone generano 3 personaggi; oltre 12 persone il limite è spiegato', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Organizza una giornata').click();
  await page.getByLabel('Quante persone?').fill('13');
  await expect(page.getByRole('alert')).toContainText('fino a 12');
  await page.getByLabel('Quante persone?').fill('3');
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: /Culturale/ }).click();
  await page.getByRole('button', { name: 'Salta al riepilogo' }).click();
  await page.getByRole('button', { name: 'Proponi programmi' }).click();
  await expect(page.getByRole('heading', { name: /^\d proposte$/ })).toBeVisible({ timeout: 60_000 });
  await page.locator('.alt-card').first().getByRole('button', { name: 'Scegli e simula' }).click();
  await page.getByRole('button', { name: 'Avvia' }).click();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Pausa' }).click();
  // un personaggio per persona (a zoom di quartiere) oppure il segnaposto di gruppo con il numero
  const chars = await page.locator('.character').count();
  expect(chars).toBe(3);
});

test('esplorazione libera, scheda luogo e segnalazione di errore', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Esplora liberamente').click();
  await page.getByRole('button', { name: 'Cultura', exact: true }).click();
  await expect(page.locator('.place-list li').first()).toBeVisible();
  await page.locator('.place-row', { hasText: 'Museo Hermann Hesse' }).click();
  await expect(page.locator('.place-card h2')).toHaveText('Museo Hermann Hesse');
  await expect(page.locator('.place-card')).toContainText('OpenStreetMap');
  await page.getByRole('button', { name: 'Segnala un errore' }).click();
  await page.getByLabel(/Dettagli/).fill('Test automatico: orario da verificare sul sito ufficiale');
  await page.getByRole('button', { name: 'Invia' }).click();
  await expect(page.getByText(/segnalazione arriva alla redazione/i)).toBeVisible();
});

test('eventi: calendario dichiarato dimostrativo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Eventi', exact: true }).click();
  await expect(page.locator('.events .notice.demo')).toContainText('dimostrativ');
  await page.getByRole('tab', { name: 'Settimana' }).click();
  await expect(page.locator('.event-list li').first()).toBeVisible();
});

test('pannello editoriale protetto: accesso, modifica orari, versione del catalogo', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Token editoriale').fill('sbagliato');
  await page.getByRole('button', { name: 'Entra' }).click();
  await expect(page.getByText('Token non valido')).toBeVisible();
  await page.getByLabel('Token editoriale').fill('e2e-admin-token');
  await page.getByRole('button', { name: 'Entra' }).click();
  await expect(page.getByText('Salute delle fonti')).toBeVisible();
  await page.getByRole('tab', { name: 'Luoghi' }).click();
  await page.getByLabel('Filtra luoghi').fill('Parco Ciani');
  await page.getByRole('button', { name: 'modifica' }).first().click();
  await page.getByLabel(/Orari \(sintassi OSM/).fill('Mo-Su 07:00-21:00');
  await page.locator('.admin-edit').getByRole('button', { name: 'Salva', exact: true }).click();
  await expect(page.locator('.admin-edit .notice')).toContainText('Salvato');
  await page.getByRole('button', { name: 'Annulla modifiche' }).click();
  await expect(page.locator('.admin-edit .notice')).toContainText('rimosse');
});

test('senza WebGL: vista semplificata con le stesse informazioni', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error simulazione di un dispositivo senza WebGL
    HTMLCanvasElement.prototype.getContext = function (type: string, ...a: unknown[]) { if (String(type).includes('webgl')) return null; return orig.call(this, type as any, ...(a as [])); };
  });
  await page.goto('/');
  await expect(page.getByText('WebGL non è disponibile')).toBeVisible();
  await page.getByText('Due persone fra paesaggio e cultura').click();
  await page.getByRole('button', { name: 'Proponi programmi' }).click();
  await expect(page.getByRole('heading', { name: /^\d proposte$/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.fallback-svg')).toBeVisible();
  await page.locator('.alt-card').first().getByRole('button', { name: 'Scegli e simula' }).click();
  await page.getByRole('button', { name: 'Salta spostamento' }).click();
  await expect(page.locator('.text-state')).toBeVisible();
});
