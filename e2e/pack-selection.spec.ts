/**
 * Multi-sélection de packs par partie : la modale liste les packs actifs du
 * jeu (cochés par défaut), un pack décoché ne sort JAMAIS au tirage, et tout
 * décocher bloque le lancement avec un blocker lisible.
 *
 * Jeu support : Ito (le thème tiré est public sur la TV dès le lancement —
 * trois lancements successifs = trois tirages vérifiables sans jouer).
 */
import { expect, test } from '@playwright/test';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';

const PASSWORD = 'e2e-admin';
const PLAYER_NAMES = ['Ana', 'Bob', 'Cyr'];
const THEMES = ['Choses qui brillent la nuit', 'Objets du quotidien surcotés', 'Bruits agaçants'];

const PACK = {
  formatVersion: 1,
  id: 'e2e-selection-01',
  game: 'ito',
  name: 'Sélection e2e',
  mode: 'interne',
  lang: 'fr',
  author: 'E2E',
  entries: THEMES.map((theme) => ({ theme })),
};

async function adminToken(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/admin/login', { data: { password: PASSWORD } });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { token: string }).token;
}

test('multi-sélection : un pack décoché ne sort plus ; tout décocher bloque', async ({ browser, request }) => {
  // ── Un pack Ito ajouté à chaud via l'API admin ─────────────────────────────
  const token = await adminToken(request);
  const auth = { Authorization: `Bearer ${token}` };
  const upload = await request.post('/api/admin/packs', {
    headers: auth,
    multipart: {
      file: {
        name: `${PACK.id}.json`,
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(PACK)),
      },
    },
  });
  expect(((await upload.json()) as { ok: boolean }).ok).toBe(true);

  const contexts: BrowserContext[] = [];
  try {
    // ── Salon + 3 joueurs ────────────────────────────────────────────────────
    const hostContext = await browser.newContext();
    contexts.push(hostContext);
    const host = await hostContext.newPage();
    host.on('dialog', (dialog) => void dialog.accept());
    await host.goto('/?seed=33');
    await host.getByRole('button', { name: 'Créer un salon' }).click();
    await expect(host).toHaveURL(/\/host\/[A-Z]{4}$/);
    const code = (await host.locator('.room-code').innerText()).trim();

    for (const name of PLAYER_NAMES) {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      const page = await ctx.newPage();
      await page.goto(`/join/${code}`);
      await page.getByLabel('Ton prénom').fill(name);
      await page.getByRole('button', { name: 'C’est parti !' }).click();
      await expect(page.getByText('Bienvenue !')).toBeVisible();
    }

    // ── Modale Ito : les deux packs actifs listés, TOUS cochés par défaut ────
    await host.getByRole('button', { name: 'Ito' }).click();
    const builtinItem = host.locator('.pack-item', { hasText: 'Grand public' });
    const uploadedItem = host.locator('.pack-item', { hasText: 'Sélection e2e' });
    await expect(builtinItem.locator('input[type="checkbox"]')).toBeChecked();
    await expect(uploadedItem.locator('input[type="checkbox"]')).toBeChecked();
    await expect(uploadedItem.locator('.pack-mode')).toHaveText('Interne');
    await expect(uploadedItem.locator('.pack-count')).toHaveText('3 entrées');

    // ── Pack builtin décoché → seuls les thèmes du pack coché sortent ────────
    await builtinItem.locator('input[type="checkbox"]').uncheck();
    const seenThemes = new Set<string>();
    for (let launch = 0; launch < 3; launch++) {
      await host.getByRole('button', { name: 'Lancer la partie' }).click();
      const theme = (await host.locator('.theme-text').innerText()).trim();
      expect(THEMES, `tirage ${launch + 1} : « ${theme} » vient d'un pack décoché`).toContain(theme);
      seenThemes.add(theme);
      await host.getByRole('button', { name: 'Abandonner la manche' }).click();
      await expect(host.getByRole('button', { name: 'Ito' })).toBeVisible();
      // La sélection survit au retour lobby (stockée côté serveur).
      await host.getByRole('button', { name: 'Ito' }).click();
      await expect(builtinItem.locator('input[type="checkbox"]')).not.toBeChecked();
      await expect(uploadedItem.locator('input[type="checkbox"]')).toBeChecked();
    }
    // Anti-répétition intra-salon conservée : trois tirages, trois thèmes.
    expect(seenThemes.size).toBe(3);

    // ── Tout décocher → lancement bloqué avec un blocker lisible ─────────────
    await host.getByRole('button', { name: 'Tout décocher' }).click();
    await expect(host.getByText('Coche au moins un pack de contenu pour lancer.')).toBeVisible();
    await expect(host.getByRole('button', { name: 'Lancer la partie' })).toBeDisabled();

    // Re-cocher un pack débloque.
    await uploadedItem.locator('input[type="checkbox"]').check();
    await expect(host.getByRole('button', { name: 'Lancer la partie' })).toBeEnabled();
  } finally {
    for (const ctx of contexts) await ctx.close();
    // Nettoyage : les specs suivantes doivent retrouver les seuls packs builtin.
    await request.delete(`/api/admin/packs/${PACK.id}`, { headers: auth });
  }
});
