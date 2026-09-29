import { defineConfig } from '@playwright/test';

const PORT = 8791;
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    locale: 'it-CH',
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: 'chrome',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    // meteo ed eventi dimostrativi: i test non dipendono dalla rete né dal calendario del giorno
    command: `npm run build && ADMIN_TOKEN=e2e-admin-token WEATHER_PROVIDER=demo EVENTS_SOURCE=demo DB_PATH=data/db/e2e.sqlite PORT=${PORT} npm start`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, testMatch: /mobile/ },
  ],
});
