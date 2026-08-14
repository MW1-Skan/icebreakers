/**
 * Wavelength — happy-path : 2 manches à 4 joueurs. Le test lit la cible sur
 * l'écran du TÉLÉPATHE (les autres ne la voient jamais) et fait placer tous
 * les curseurs pile dessus → 4 pts chacun, télépathe à la moyenne (4).
 * Tout le monde finit à 8 pts → victoire partagée au podium.
 */
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const PLAYER_NAMES = ['Alice', 'Bob', 'Chloe', 'David'];
const MANCHES = 2;

test('deux manches Wavelength : cible secrète, placements, cumul partagé', async ({ browser }) => {
  const contexts: BrowserContext[] = [];

  const hostContext = await browser.newContext();
  contexts.push(hostContext);
  const host = await hostContext.newPage();
  await host.goto('/?seed=23');
  await host.getByRole('button', { name: 'Créer un salon' }).click();
  const code = (await host.locator('.room-code').innerText()).trim();

  const players: Page[] = [];
  for (const name of PLAYER_NAMES) {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    const page = await ctx.newPage();
    await page.goto(`/join/${code}`);
    await page.getByLabel('Ton prénom').fill(name);
    await page.getByRole('button', { name: 'C’est parti !' }).click();
    await expect(page.getByText('Bienvenue !')).toBeVisible();
    players.push(page);
  }

  await host.getByRole('tab', { name: /Wavelength/ }).click();
  await expect(host.locator('#wlmanches')).toBeVisible();
  await host.locator('#wlmanches').selectOption(String(MANCHES));
  await host.getByRole('button', { name: 'Lancer la partie' }).click();

  const clues = ['plutôt vers la gauche', 'carrément à droite'];
  for (let m = 1; m <= MANCHES; m++) {
    const telepathIndex = (m - 1) % players.length;
    const telepath = players[telepathIndex];
    const placers = players.filter((_, i) => i !== telepathIndex);

    // ── Tirage & indice : la cible n'existe que chez le télépathe ───────────
    await expect(host.getByText(`Manche ${m}/${MANCHES}`)).toBeVisible();
    await expect(host.getByRole('heading', { name: 'Tirage & indice' })).toBeVisible();
    const target = Number((await telepath.locator('.target-value').innerText()).trim());
    expect(target).toBeGreaterThanOrEqual(0);
    expect(target).toBeLessThanOrEqual(100);

    await telepath.getByLabel('Ton indice').fill(clues[m - 1]);
    await telepath.getByRole('button', { name: 'Envoyer' }).click();

    // ── Placement secret : chacun place PILE sur la cible lue par le test ───
    await expect(host.getByRole('heading', { name: 'Placement secret' })).toBeVisible();
    await expect(host.getByText(`« ${clues[m - 1]} »`)).toBeVisible();
    for (const placer of placers) {
      await placer.locator('input[type="range"]').fill(String(target));
      await placer.getByRole('button', { name: /Placer ma cible ici|Déplacer ici/ }).click();
    }

    // ── Révélation : 4 pts chacun, télépathe à la moyenne (4) ───────────────
    await expect(host.getByRole('heading', { name: 'Révélation !' })).toBeVisible();
    await expect(host.locator('.telepath-chip')).toContainText('+4');
    await expect(host.locator('.pt-chip:not(.telepath-chip)')).toHaveCount(3);

    const nextLabel = m < MANCHES ? 'Manche suivante' : 'Voir le classement';
    await host.getByRole('button', { name: nextLabel }).click();
  }

  // ── Podium : 8 pts partout → victoire partagée ────────────────────────────
  await expect(host.getByText('Classement final')).toBeVisible();
  await expect(host.locator('.podium li.first')).toContainText('8 pts');
  await expect(host.getByText('Récap des indices')).toBeVisible();
  await expect(host.getByText(`« ${clues[0]} »`)).toBeVisible();

  await host.getByRole('button', { name: 'Retour au lobby' }).click();
  await expect(host.getByText('Récap de la soirée')).toBeVisible();
  await expect(host.getByText(/8 pts/).first()).toBeVisible();

  for (const ctx of contexts) await ctx.close();
});
