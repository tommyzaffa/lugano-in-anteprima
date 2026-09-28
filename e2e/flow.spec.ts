import { test, expect, type Page } from '@playwright/test';

async function waitMap(page: Page) {
  await page.waitForFunction(() => { const c = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement | null; return !!c && c.width > 0; }, null, { timeout: 30_000 });
}

test('flusso principale: modulo → proposte → simulazione → decisione → riepilogo → esportazioni', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Racconta la giornata che vuoi vivere')).toBeVisible();
  await expect(page.locator('.demo-pill')).toContainText('DEMO');
  await waitMap(page);
  await page.getByText('Serata fra amici').click();
  await expect(page.getByRole('heading', { name: 'Riepilogo' })).toBeVisible();
  await page.getByRole('button', { name: 'Proponi programmi' }).click();
  await expect(page.getByRole('heading', { name: /^\d propost[ae]$/ })).toBeVisible({ timeout: 60_000 });
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
  // salvataggio e condivisione disattivati: restano le esportazioni sul dispositivo
  await expect(page.locator('.summary-actions').getByRole('button', { name: 'Salva', exact: true })).toHaveCount(0);
  await expect(page.locator('.summary-actions').getByRole('button', { name: 'Condividi', exact: true })).toHaveCount(0);
  await expect(page.locator('.summary-actions').getByRole('button', { name: /calendario/ })).toBeVisible();
  expect((await page.request.post('/api/plans', { data: { title: 'x', data: {} } })).status()).toBe(404);
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
  await expect(page.getByRole('heading', { name: /^\d propost[ae]$/ })).toBeVisible({ timeout: 60_000 });
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

test('eventi: calendario dimostrativo, ricerca, segnaposti e giornata costruita attorno a un evento', async ({ page }) => {
  await page.goto('/');
  await waitMap(page);
  await page.getByRole('button', { name: 'Eventi', exact: true }).click();
  await expect(page.locator('.events .notice.demo')).toContainText('dimostrativ');
  await page.getByRole('tab', { name: 'Settimana' }).click();
  await expect(page.locator('.event-list li').first()).toBeVisible();
  const all = await page.locator('.event-list li').count();
  // segnaposti sulla mappa per gli eventi mostrati
  await expect(page.locator('.event-pins-status')).toContainText(/\d+ eventi? segnat/);
  await page.getByLabel('Cerca negli eventi').fill('mercato');
  await expect.poll(() => page.locator('.event-list li').count()).toBeLessThan(all);
  const li = page.locator('.event-list li').filter({ has: page.getByRole('button', { name: 'Organizza una giornata con questo evento' }) }).first();
  const title = (await li.locator('strong').textContent())!.trim();
  await li.getByRole('button', { name: 'Organizza una giornata con questo evento' }).click();
  await expect(page.locator('.wizard-title')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('tappa obbligatoria');
  for (let i = 0; i < 6; i++) { const b = page.getByRole('button', { name: 'Avanti' }); if (await b.count()) await b.click(); }
  await page.getByRole('button', { name: 'Proponi programmi' }).click();
  await expect(page.getByRole('heading', { name: /^\d propost[ae]$/ })).toBeVisible({ timeout: 60_000 });
  for (const card of await page.locator('.alt-card').all()) await expect(card).toContainText(title.replace(' (demo)', ''));
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
  await expect(page.getByRole('heading', { name: /^\d propost[ae]$/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.fallback-svg')).toBeVisible();
  await page.locator('.alt-card').first().getByRole('button', { name: 'Scegli e simula' }).click();
  await page.getByRole('button', { name: 'Salta spostamento' }).click();
  await expect(page.locator('.text-state')).toBeVisible();
});

test('siamo in giro adesso: il giorno dell\'uscita si ricalcola il resto senza le tappe fatte', async ({ page, request }) => {
  const meta = await (await request.get('/api/meta')).json();
  // orologio del browser fissato al mattino del giorno del programma, prima della partenza dell'esempio
  // (fuso di Zurigo): dopo l'ora di partenza gli esempi propongono il giorno seguente
  await page.clock.setFixedTime(new Date(`${meta.today}T09:05:00+02:00`));
  await page.goto('/');
  await page.getByText('Due persone fra paesaggio e cultura').click();
  await page.getByRole('button', { name: 'Proponi programmi' }).click();
  await expect(page.getByRole('heading', { name: /^\d propost[ae]$/ })).toBeVisible({ timeout: 60_000 });
  await page.locator('.alt-card').first().getByRole('button', { name: 'Scegli e simula' }).click();
  for (let i = 0; i < 5 && !(await page.getByRole('heading', { name: 'Fonti e limiti' }).count()); i++) {
    await page.getByRole('button', { name: 'Vai al riepilogo' }).click();
    const d = page.locator('.decision-box .decision-opt');
    if (await d.count()) await d.first().click();
  }
  const box = page.locator('.outing-now');
  await expect(box).toBeVisible();
  const first = (await box.locator('li').first().textContent())!.replace(/^\s*\d{2}:\d{2}\s*/, '').replace(/\s*(fatta|da fare)\s*$/, '').trim();
  await box.locator('input[type=checkbox]').first().check();
  await box.getByRole('button', { name: 'Ricalcola il resto da qui' }).click();
  await expect(page.getByRole('heading', { name: /^\d propost[ae]$|Nessun programma/ })).toBeVisible({ timeout: 60_000 });
  for (const card of await page.locator('.alt-card').all()) await expect(card.locator('.alt-stops')).not.toContainText(first);
});
