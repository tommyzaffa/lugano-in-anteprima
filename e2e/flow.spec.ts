import { test, expect, type Page } from '@playwright/test';

async function waitMap(page: Page) {
  await page.waitForFunction(() => { const c = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement | null; return !!c && c.width > 0; }, null, { timeout: 30_000 });
}
const RESULTS = /idee per voi|Un'idea per voi/;

/** Dalla simulazione al riepilogo: «Fine» si ferma alle decisioni obbligatorie, che scegliamo noi. */
async function toSummary(page: Page, pick: (n: number) => number = () => 0) {
  for (let i = 0; i < 6 && !(await page.locator('.summary').count()); i++) {
    await page.getByRole('button', { name: 'Fine: riepilogo' }).click();
    const opts = page.locator('.decision-box .decision-opt');
    if (await opts.count()) await opts.nth(pick(await opts.count())).click();
  }
  await expect(page.locator('.summary')).toBeVisible();
}

test('flusso principale: idea → proposte → simulazione → decisione → riepilogo → esportazioni', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Prova la giornata sulla mappa')).toBeVisible();
  await waitMap(page);
  // un'idea della schermata iniziale avvia subito la ricerca delle proposte
  await page.getByRole('button', { name: /Serata fra amici/ }).click();
  await expect(page.getByRole('heading', { name: RESULTS })).toBeVisible({ timeout: 60_000 });
  const cards = page.locator('.alt-card');
  expect(await cards.count()).toBeGreaterThanOrEqual(2);
  // dettagli e verifiche, raccolti
  await cards.first().getByRole('button', { name: 'Dettagli' }).click();
  await cards.first().locator('summary', { hasText: 'Verifiche' }).click();
  await expect(cards.first().locator('.checks')).toBeVisible();
  await cards.first().getByRole('button', { name: 'Prova questa giornata' }).click();
  await expect(page.locator('.sim-controls')).toBeVisible();
  await expect(page.locator('.now-card')).toBeVisible();
  await page.waitForTimeout(1500);
  const clock0 = await page.locator('.clock-time').textContent();
  await page.getByRole('button', { name: 'Salta spostamento' }).click();
  expect(await page.locator('.clock-time').textContent()).not.toBe(clock0);
  // «Fine» non risponde al posto nostro: con una decisione aperta lo dice e aspetta
  await page.getByRole('button', { name: 'Fine: riepilogo' }).click();
  const decision = page.locator('.decision-box');
  if (await decision.count()) {
    await page.getByRole('button', { name: 'Fine: riepilogo' }).click();
    await expect(page.locator('.toast')).toContainText('scelta');
    await decision.locator('.decision-opt').nth(1).click();
    await expect(page.locator('.branches summary')).toContainText('Versioni');
  }
  await toSummary(page);
  await expect(page.locator('.summary-list .summary-item').first()).toBeVisible();
  await expect(page.locator('.summary summary', { hasText: 'Fonti e limiti' })).toBeVisible();
  // verifica dei dati attuali
  await page.locator('summary', { hasText: 'Prima di partire' }).click();
  await page.getByRole('button', { name: /Verifica i dati adesso/ }).click();
  await expect(page.locator('.reval .notice')).toBeVisible();
  // piano B per la pioggia: alternative al coperto o spiegazione che non servono
  await page.locator('summary', { hasText: 'Piano B se piove' }).click();
  await expect(page.locator('.planb-list, .planb p.muted')).toBeVisible({ timeout: 15_000 });
  // salvataggio e condivisione disattivati: restano le esportazioni sul dispositivo
  await expect(page.getByRole('button', { name: 'Salva', exact: true })).toHaveCount(0);
  await expect(page.locator('.summary-actions').getByRole('button', { name: /Calendario/ })).toBeVisible();
  expect((await page.request.post('/api/plans', { data: { title: 'x', data: {} } })).status()).toBe(404);
});

test('modulo: pedine con nome e colore, limite di 12 spiegato, una pedina per persona sulla mappa', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Organizza una giornata' }).click();
  await expect(page.locator('.wizard-title')).toHaveText('Chi siete');
  await expect(page.locator('.pawn-card')).toHaveCount(2);
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Aggiungi una persona' }).click();
  await expect(page.locator('.pawn-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Aggiungi una persona' }).click();
  await expect(page.getByRole('alert')).toContainText('fino a 12');
  for (let i = 0; i < 9; i++) await page.locator('.pawn-remove').last().click();
  await expect(page.locator('.pawn-card')).toHaveCount(3);
  await page.getByLabel('Nome persona 1').fill('Sara');
  await page.getByRole('button', { name: 'Colore di Sara' }).click();
  await page.locator('.swatch').nth(4).click();
  await page.getByRole('button', { name: 'Avanti' }).click();
  await expect(page.locator('.wizard-title')).toHaveText('Quando e da dove');
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: /Culturale/ }).click();
  await page.getByRole('button', { name: 'Mostrami le proposte' }).click();
  await expect(page.getByRole('heading', { name: RESULTS })).toBeVisible({ timeout: 60_000 });
  await page.locator('.alt-card').first().getByRole('button', { name: 'Prova questa giornata' }).click();
  await page.getByRole('button', { name: 'Avvia' }).click();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Pausa' }).click();
  // una pedina per persona (a zoom di quartiere), con il nome scelto
  await expect(page.locator('.character')).toHaveCount(3);
  await expect(page.locator('.character .name').first()).toHaveText('Sara');
});

test('esplorazione libera, scheda luogo e segnalazione di errore', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Esplora la mappa' }).click();
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

test('eventi: calendario, ricerca e giornata costruita attorno a un evento', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Esplora la mappa' }).click();
  await waitMap(page);
  await page.getByRole('button', { name: 'Eventi', exact: true }).click();
  await expect(page.locator('.events .notice.demo')).toContainText('dimostrativ');
  await page.getByRole('tab', { name: 'Settimana' }).click();
  await expect(page.locator('.event-list li').first()).toBeVisible();
  const all = await page.locator('.event-list li').count();
  await page.getByLabel('Cerca negli eventi').fill('mercato');
  await expect.poll(() => page.locator('.event-list li').count()).toBeLessThan(all);
  const li = page.locator('.event-list li').filter({ has: page.getByRole('button', { name: 'Organizza la giornata' }) }).first();
  const title = (await li.locator('strong').textContent())!.trim();
  await li.getByRole('button', { name: 'Organizza la giornata' }).click();
  await expect(page.locator('.wizard-title')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('tappa obbligatoria');
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Avanti' }).click();
  await expect(page.locator('.notice.info')).toContainText(title);
  await page.getByRole('button', { name: 'Mostrami le proposte' }).click();
  await expect(page.getByRole('heading', { name: RESULTS })).toBeVisible({ timeout: 60_000 });
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
  await page.getByRole('button', { name: /Panorami e cultura/ }).click();
  await expect(page.getByText('WebGL non è disponibile')).toBeVisible();
  await expect(page.getByRole('heading', { name: RESULTS })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.fallback-svg')).toBeVisible();
  await page.locator('.alt-card').first().getByRole('button', { name: 'Prova questa giornata' }).click();
  await page.getByRole('button', { name: 'Salta spostamento' }).click();
  await expect(page.locator('.text-state')).toBeVisible();
});

test('siamo in giro adesso: il giorno dell\'uscita si ricalcola il resto senza le tappe fatte', async ({ page, request }) => {
  const meta = await (await request.get('/api/meta')).json();
  // orologio del browser fissato al mattino del giorno del programma, prima della partenza dell'idea
  // (fuso di Zurigo): dopo l'ora di partenza le idee propongono il giorno seguente
  await page.clock.setFixedTime(new Date(`${meta.today}T09:05:00+02:00`));
  await page.goto('/');
  await page.getByRole('button', { name: /Panorami e cultura/ }).click();
  await expect(page.getByRole('heading', { name: RESULTS })).toBeVisible({ timeout: 60_000 });
  await page.locator('.alt-card').first().getByRole('button', { name: 'Prova questa giornata' }).click();
  await toSummary(page);
  const box = page.locator('.outing-now');
  await box.locator('summary').click();
  const first = (await box.locator('li').first().textContent())!.replace(/^\s*\d{2}:\d{2}\s*/, '').trim();
  await box.locator('input[type=checkbox]').first().check();
  await box.getByRole('button', { name: 'Ricalcola il resto da qui' }).click();
  await expect(page.getByRole('heading', { name: /idee per voi|Un'idea per voi|Così non ci sta/ })).toBeVisible({ timeout: 60_000 });
  for (const card of await page.locator('.alt-card').all()) await expect(card.locator('.alt-stops')).not.toContainText(first);
});
