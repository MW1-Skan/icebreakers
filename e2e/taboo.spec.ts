/**
 * Taboo — happy-path : binômes composés [Alice,Bob] / [Chloe,David], 1 passage
 * par équipe. Les passages se terminent par ÉPUISEMENT du deck (30 cartes),
 * pas par chrono — le test reste rapide. Vérifie : carte cachée au devineur
 * et à la TV, buzz (flash + carte défaussée publique) puis annulation par
 * l'animateur, re-mélange au passage suivant, classement final.
 */
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const PLAYER_NAMES = ['Alice', 'Bob', 'Chloe', 'David'];
const DECK_SIZE = 30; // taboo-normal-01

test('deux passages Taboo : trouvés, buzz annulé, deck re-mélangé, podium', async ({ browser }) => {
  test.setTimeout(120_000);
  const contexts: BrowserContext[] = [];

  const hostContext = await browser.newContext();
  contexts.push(hostContext);
  const host = await hostContext.newPage();
  await host.goto('/?seed=61');
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
  const [alice, bob, chloe, david] = players;

  // ── Binômes composés (A,A,B,B dans l'ordre d'arrivée) + 1 passage/équipe ──
  await host.getByRole('button', { name: /Taboo/ }).click();
  await expect(host.locator('#tbpasses')).toBeVisible();
  await host.locator('#tbpasses').selectOption('1');
  await host.getByRole('button', { name: '✍️ Composer' }).click();
  await host.getByRole('button', { name: 'Lancer la partie' }).click();

  // ── Passage 1 : Alice fait deviner Bob, Chloe & David arbitrent ───────────
  await expect(host.getByRole('heading', { name: 'Préparation' })).toBeVisible();
  await expect(host.getByText(/Alice fait deviner/)).toBeVisible();
  await alice.getByRole('button', { name: '🚀 Go !' }).click();
  await expect(host.getByRole('heading', { name: /top chrono/ })).toBeVisible();

  // la carte : orateur + arbitres OUI, devineur + TV NON
  const firstWord = (await alice.locator('.target-word').innerText()).trim();
  await expect(david.locator('.target-word')).toHaveText(firstWord);
  expect(await bob.locator('main').innerText()).not.toContain(firstWord);
  expect(await host.locator('main').innerText()).not.toContain(firstWord);

  // trouvé, trouvé, passer…
  await alice.getByRole('button', { name: '✓ Trouvé' }).click();
  await alice.getByRole('button', { name: '✓ Trouvé' }).click();
  await alice.getByRole('button', { name: /Passer/ }).click();

  // …BUZZ de David : flash TV + carte défaussée publique, puis annulation host
  const buzzedWord = (await david.locator('.target-word').innerText()).trim();
  await david.getByRole('button', { name: '🔔 BUZZ' }).click();
  await expect(host.getByText(buzzedWord)).toBeVisible(); // la défaussée s'affiche
  await host.getByRole('button', { name: '🔕 Annuler le buzz' }).click();

  // le reste du deck en trouvés → le passage s'arrête à l'épuisement
  for (let i = 0; i < DECK_SIZE - 4; i++) {
    await alice.getByRole('button', { name: '✓ Trouvé' }).click();
  }
  await expect(host.getByRole('heading', { name: 'Récap du passage' })).toBeVisible();
  // 2 trouvés + 1 passe + 1 buzz annulé + 26 trouvés = 28
  await expect(host.getByText('Score du passage : 28')).toBeVisible();
  await expect(bob.getByText('découvre enfin les cartes')).toBeVisible();

  // ── Passage 2 : deck re-mélangé, Chloe fait deviner David ─────────────────
  await host.getByRole('button', { name: 'Passage suivant' }).click();
  await chloe.getByRole('button', { name: '🚀 Go !' }).click();
  for (let i = 0; i < DECK_SIZE; i++) {
    await chloe.getByRole('button', { name: '✓ Trouvé' }).click();
  }
  await expect(host.getByRole('heading', { name: 'Récap du passage' })).toBeVisible();
  await expect(host.getByText('Score du passage : 30')).toBeVisible();

  // ── Fin : classement des binômes ──────────────────────────────────────────
  await host.getByRole('button', { name: 'Continuer' }).click();
  await expect(host.getByRole('heading', { name: 'Podium' })).toBeVisible();
  await expect(host.locator('.final li.leader')).toContainText('Chloe & David');
  await expect(host.locator('.final li.leader')).toContainText('30 pts');
  await expect(alice.locator('.final')).toHaveText('28 pts');

  await host.getByRole('button', { name: 'Retour au lobby' }).click();
  await expect(host.getByText('Chloe & David gagnent (30 pts)')).toBeVisible();

  for (const ctx of contexts) await ctx.close();
});
