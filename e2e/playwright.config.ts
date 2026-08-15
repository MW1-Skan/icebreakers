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
  // Un seul worker : les specs partagent le serveur, et l'admin e2e modifie
  // l'état global des packs (upload/désactivation) — pas de croisements.
  workers: 1,
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'rm -rf .tmp-admin && node ../apps/server/dist/apps/server/src/main.js',
    port: 3100,
    env: {
      PORT: '3100',
      // données du e2e isolées du data/ du repo + mot de passe admin connu
      DATA_PACKS_DIR: './.tmp-admin/packs',
      ADMIN_PASSWORD: 'e2e-admin',
    },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
