/**
 * /admin — critère de done de l'étape 7 : « un pack ajouté sans toucher au
 * code ». Login, upload invalide → rapport lisible, upload valide → le pack
 * apparaît ET son mode devient jouable au lobby, désactivation, suppression,
 * template téléchargeable.
 */
import { expect, test } from '@playwright/test';

const PASSWORD = 'e2e-admin';

const VALID_PACK = {
  formatVersion: 1,
  id: 'interne-e2e-01',
  game: 'justone',
  name: 'Pack e2e',
  mode: 'interne',
  lang: 'fr',
  author: 'E2E',
  entries: [{ word: 'Cascade' }, { word: 'Tornade' }],
};

function asFile(name: string, content: unknown): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content)) };
}

test('administration des packs : login, upload, activation, suppression', async ({ page, request }) => {
  // ── Login : mauvais mot de passe refusé, bon accepté ──────────────────────
  await page.goto('/admin');
  await page.getByLabel('Mot de passe admin').fill('mauvais-mdp');
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByText('Mot de passe incorrect.')).toBeVisible();

  await page.getByLabel('Mot de passe admin').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('heading', { name: /Packs chargés/ })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(7); // les 7 packs intégrés

  // ── Upload invalide → rapport d'erreurs lisible, rien n'est ajouté ────────
  await page
    .locator('input[type="file"]')
    .setInputFiles(asFile('invalide.json', { ...VALID_PACK, id: 'bad', entries: [] }));
  await expect(page.getByText('Pack refusé :')).toBeVisible();
  await expect(page.locator('.error-report')).toContainText('vide');
  await expect(page.locator('tbody tr')).toHaveCount(7);

  // ── Upload valide → listé « à chaud », jouable immédiatement ──────────────
  await page.locator('input[type="file"]').setInputFiles(asFile('interne-e2e-01.json', VALID_PACK));
  await expect(page.getByText(/Pack « interne-e2e-01 » ajouté/)).toBeVisible();
  const row = page.locator('tbody tr', { hasText: 'interne-e2e-01' });
  await expect(row).toContainText('à chaud');
  await expect(row.getByRole('button', { name: '🟢 Actif' })).toBeVisible();

  // …le mode Interne apparaît au lobby de Just One sans toucher au code
  const hostPage = await page.context().newPage();
  await hostPage.goto('/');
  await hostPage.getByRole('button', { name: 'Créer un salon' }).click();
  await hostPage.getByRole('button', { name: /Just One/ }).click();
  await expect(hostPage.locator('#mode option', { hasText: 'Interne' })).toHaveCount(1);
  await hostPage.close();

  // ── Désactivation : le pack sort des tirages (persistée côté serveur) ─────
  await row.getByRole('button', { name: '🟢 Actif' }).click();
  await expect(row.getByRole('button', { name: '⚫ Inactif' })).toBeVisible();

  // ── Template : squelette téléchargeable et valide ─────────────────────────
  const template = await request.get('/api/packs/template/taboo');
  expect(template.status()).toBe(200);
  const body = await template.json();
  expect(body.game).toBe('taboo');
  expect(body.entries[0].forbidden).toHaveLength(3);
  const cnTemplate = await request.get('/api/packs/template/codenames');
  expect(cnTemplate.status()).toBe(200);
  expect((await cnTemplate.json()).game).toBe('codenames');

  // ── Suppression (packs à chaud uniquement) ────────────────────────────────
  page.on('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(7);
  await expect(page.locator('tbody tr', { hasText: 'interne-e2e-01' })).toHaveCount(0);

  // les packs intégrés n'ont pas de bouton Supprimer
  await expect(page.locator('tbody tr').first().getByRole('button', { name: 'Supprimer' })).toHaveCount(0);

  // ── La session survit à un rechargement (jeton en localStorage) ───────────
  await page.reload();
  await expect(page.getByRole('heading', { name: /Packs chargés/ })).toBeVisible();
});
