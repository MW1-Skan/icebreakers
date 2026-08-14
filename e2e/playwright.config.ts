import { defineConfig } from '@playwright/test';

/**
 * E2E : le serveur (déjà buildé par `npm run e2e`) sert le front Angular buildé
 * sur le port 3100 — indépendant du `npm run dev` (4200/3000).
 */
export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node ../apps/server/dist/apps/server/src/main.js',
    port: 3100,
    env: { PORT: '3100' },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
