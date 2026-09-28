import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Il fuso del processo è volutamente diverso da Zurigo: la logica non deve dipenderne.
    // eventi: le fixture dimostrative rendono riproducibili gli scenari (tests/data-smoke usa i dati reali)
    env: { TZ: 'America/New_York', EVENTS_SOURCE: 'demo' },
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
