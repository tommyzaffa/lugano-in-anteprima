import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Il fuso del processo è volutamente diverso da Zurigo: la logica non deve dipenderne.
    env: { TZ: 'America/New_York' },
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
