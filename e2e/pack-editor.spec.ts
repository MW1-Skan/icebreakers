/**
 * Éditeur de packs /admin : création depuis un template, édition entrée par
 * entrée (id/jeu immuables), édition INVALIDE → rapport lisible et rien de
 * sauvé, édition valide → l'entrée modifiée est jouable immédiatement ;
 * duplication d'un pack builtin en pack à chaud.
 *
 * Jeu support : Ito (thème public sur la TV dès le lancement).
 */
import { expect, test } from '@playwright/test';
import type { APIRequestContext, BrowserContext } from '@playwright/test';

const PASSWORD = 'e2e-admin';
const PLAYER_NAMES = ['Ana', 'Bob', 'Cyr'];
const PACK_ID = 'e2e-editeur-01';
const THEME_1 = 'Niveau de chaleur';
const THEME_2_INITIAL = 'Vitesse de course';
const THEME_2_EDITED = 'Niveau de danger';

async function adminToken(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/admin/login', { data: { password: PASSWORD } });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { token: string }).token;
}

test('éditeur de packs : créer, éditer (invalide puis valide), jouer, dupliquer un builtin', async ({
  page,
  browser,
  request,
}) => {
  const contexts: BrowserContext[] = [];
  try {
    // ── Login ──────────────────────────────────────────────────────────────
    await page.goto('/admin');
    await page.getByLabel('Mot de passe admin').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrer' }).click();
    await expect(page.getByRole('heading', { name: /Packs chargés/ })).toBeVisible();

    // ── Créer un pack depuis le template Ito ───────────────────────────────
    await page.locator('select[name="create-game"]').selectOption('ito');
    await page.getByRole('button', { name: 'Créer un pack' }).click();
    await expect(page.getByRole('heading', { name: 'Créer un pack' })).toBeVisible();
    // Le template préremplit l'éditeur (chaque template est un pack valide).
    await expect(page.getByLabel('Thème 1')).toHaveValue('Une échelle subjective');

    await page.locator('#pack-id').fill(PACK_ID);
    await page.locator('#pack-name').fill('Éditeur e2e');
    await page.getByLabel('Thème 1').fill(THEME_1);
    await page.getByRole('button', { name: '+ Ajouter une entrée' }).click();
    await page.getByLabel('Thème 2').fill(THEME_2_INITIAL);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText(new RegExp(`Pack « ${PACK_ID} » ajouté`))).toBeVisible();
    const row = page.locator('tbody tr', { hasText: PACK_ID });
    await expect(row).toContainText('à chaud');

    // ── Édition INVALIDE : rapport d'erreurs, rien n'est sauvé ─────────────
    await row.getByRole('button', { name: 'Éditer' }).click();
    await expect(page.getByRole('heading', { name: `Éditer « ${PACK_ID} »` })).toBeVisible();
    await expect(page.locator('#pack-id')).toBeDisabled(); // id immuable
    await page.getByLabel('Thème 2').fill(THEME_1); // doublon avec l'entrée 1
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    const report = page.locator('.error-report');
    await expect(report).toBeVisible();
    await expect(report).toContainText('doublon');
    await page.getByRole('button', { name: 'Annuler' }).click();

    // …le contenu stocké n'a pas bougé
    await row.getByRole('button', { name: 'Éditer' }).click();
    await expect(page.getByLabel('Thème 2')).toHaveValue(THEME_2_INITIAL);

    // ── Édition valide : l'entrée 2 change ─────────────────────────────────
    await page.getByLabel('Thème 2').fill(THEME_2_EDITED);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText(new RegExp(`Pack « ${PACK_ID} » remplacé`))).toBeVisible();

    // ── Le résultat est jouable immédiatement (l'entrée modifiée sort) ─────
    const hostContext = await browser.newContext();
    contexts.push(hostContext);
    const host = await hostContext.newPage();
    host.on('dialog', (dialog) => void dialog.accept());
    await host.goto('/?seed=44');
    await host.getByRole('button', { name: 'Créer un salon' }).click();
    const code = (await host.locator('.room-code').innerText()).trim();
    for (const name of PLAYER_NAMES) {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      const playerPage = await ctx.newPage();
      await playerPage.goto(`/join/${code}`);
      await playerPage.getByLabel('Ton prénom').fill(name);
      await playerPage.getByRole('button', { name: 'C’est parti !' }).click();
      await expect(playerPage.getByText('Bienvenue !')).toBeVisible();
    }
    await host.getByRole('button', { name: 'Ito' }).click();
    await host
      .locator('.pack-item', { hasText: 'Grand public' })
      .locator('input[type="checkbox"]')
      .uncheck();
    // Deux lancements = les deux entrées du pack sortent (anti-répétition),
    // dont l'entrée MODIFIÉE.
    const seen = new Set<string>();
    for (let launch = 0; launch < 2; launch++) {
      await host.getByRole('button', { name: 'Lancer la partie' }).click();
      const theme = (await host.locator('.theme-text').innerText()).trim();
      expect([THEME_1, THEME_2_EDITED]).toContain(theme);
      seen.add(theme);
      await host.getByRole('button', { name: 'Abandonner la manche' }).click();
      await expect(host.getByRole('button', { name: 'Ito' })).toBeVisible();
      if (launch === 0) await host.getByRole('button', { name: 'Ito' }).click();
    }
    expect(seen.has(THEME_2_EDITED)).toBe(true);

    // ── Dupliquer un builtin (lecture seule) en pack à chaud ───────────────
    await row.waitFor(); // la page admin est restée ouverte
    const builtinRow = page.locator('tbody tr', { hasText: 'ito-normal-01' });
    await builtinRow.getByRole('button', { name: 'Dupliquer' }).click();
    await expect(
      page.getByRole('heading', { name: 'Dupliquer « ito-normal-01 » en pack à chaud' }),
    ).toBeVisible();
    await expect(page.locator('#pack-id')).toHaveValue('ito-normal-01-copie');
    await expect(page.locator('#pack-id')).toBeEnabled(); // id nouveau, saisi
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText(/Pack « ito-normal-01-copie » ajouté/)).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: 'ito-normal-01-copie' })).toContainText('à chaud');
  } finally {
    for (const ctx of contexts) await ctx.close();
    // Nettoyage : les specs suivantes doivent retrouver les seuls packs builtin.
    const token = await adminToken(request);
    const auth = { Authorization: `Bearer ${token}` };
    await request.delete(`/api/admin/packs/${PACK_ID}`, { headers: auth });
    await request.delete('/api/admin/packs/ito-normal-01-copie', { headers: auth });
  }
});
