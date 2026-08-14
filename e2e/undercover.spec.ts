/**
 * Happy-path (DoD) : 1 contexte animateur + 4 contextes joueurs jouent une
 * manche d'Undercover complète, de la distribution à l'écran de fin.
 *
 * Déterminisme : seed RNG injectée via /?seed=42 (acceptée hors production).
 * La cible du vote n'est pas codée en dur : les joueurs comparent leurs mots
 * (3 identiques, 1 différent à 4 joueurs — pas de Mr. White) et éliminent le
 * porteur du mot minoritaire → victoire des civils en un tour.
 */
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const PLAYER_NAMES = ['Alice', 'Bob', 'Chloe', 'David'];

function minorityIndex(words: string[]): number {
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  return words.findIndex((w) => counts.get(w) === 1);
}

test('une manche complète : 1 animateur + 4 joueurs, distribution → fin', async ({ browser }) => {
  const contexts: BrowserContext[] = [];

  // ── L'animateur crée le salon (seed déterministe) ─────────────────────────
  const hostContext = await browser.newContext();
  contexts.push(hostContext);
  const host = await hostContext.newPage();
  await host.goto('/?seed=42');
  await host.getByRole('button', { name: 'Créer un salon' }).click();
  await expect(host).toHaveURL(/\/host\/[A-Z]{4}$/);
  const code = (await host.locator('.room-code').innerText()).trim();
  expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);

  // ── 4 joueurs rejoignent via l'URL du QR ──────────────────────────────────
  const players: Page[] = [];
  for (const name of PLAYER_NAMES) {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    const page = await ctx.newPage();
    await page.goto(`/join/${code}`);
    await page.getByLabel('Ton prénom').fill(name);
    await page.getByRole('button', { name: 'C’est parti !' }).click();
    await expect(page).toHaveURL(new RegExp(`/room/${code}$`));
    await expect(page.getByText('Bienvenue !')).toBeVisible();
    players.push(page);
  }
  await expect(host.getByText('Joueurs 4')).toBeVisible();

  // ── Reconnexion par jeton : un refresh ne perd pas la place ───────────────
  await players[0].reload();
  await expect(players[0].getByText('Bienvenue !')).toBeVisible();
  await expect(host.getByText('Joueurs 4')).toBeVisible();

  // ── Lancement ─────────────────────────────────────────────────────────────
  const startButton = host.getByRole('button', { name: 'Lancer la partie' });
  await expect(startButton).toBeEnabled();
  await startButton.click();
  await expect(host.getByRole('heading', { name: 'Distribution des mots' })).toBeVisible();

  // ── Distribution : chacun consulte son mot 🔒 ─────────────────────────────
  const words: string[] = [];
  for (const page of players) {
    await page.getByRole('button', { name: 'Voir mon mot' }).click();
    words.push((await page.locator('.word').innerText()).trim());
  }
  // 3 civils partagent le même mot, l'undercover en a un autre (pas de White à 4).
  const targetIndex = minorityIndex(words);
  expect(targetIndex).toBeGreaterThanOrEqual(0);
  const targetName = PLAYER_NAMES[targetIndex];

  // ── Tour de description (l'animateur avance), puis discussion, puis vote ──
  await host.getByRole('button', { name: 'Commencer le tour de parole' }).click();
  for (let i = 0; i < PLAYER_NAMES.length - 1; i++) {
    await host.getByRole('button', { name: 'Joueur suivant' }).click();
  }
  await host.getByRole('button', { name: 'Passer à la discussion' }).click();
  await expect(host.getByRole('heading', { name: 'Discussion !' })).toBeVisible();
  await host.getByRole('button', { name: 'Passer au vote' }).click();
  await expect(host.getByRole('heading', { name: 'Vote secret' })).toBeVisible();

  // ── Vote secret : tous contre le mot minoritaire (lui vote quelqu'un d'autre) ──
  for (let i = 0; i < players.length; i++) {
    const voteFor = i === targetIndex ? PLAYER_NAMES[(targetIndex + 1) % 4] : targetName;
    await players[i].getByRole('button', { name: voteFor }).click();
  }

  // ── Révélation : l'undercover est éliminé, rôle révélé (pas son mot) ──────
  await expect(host.getByText(`${targetName} est éliminé·e`)).toBeVisible();
  await expect(host.locator('.role-reveal')).toHaveText('Undercover');
  // le joueur éliminé passe spectateur
  await expect(players[targetIndex].getByText('Tu es éliminé·e')).toBeVisible();
  await host.getByRole('button', { name: 'Continuer' }).click();

  // ── Fin : victoire des civils partout, révélation complète, points ────────
  await expect(host.getByText('Les civils gagnent !')).toBeVisible();
  await expect(host.locator('app-end-reveal')).toContainText(words[targetIndex]);
  for (let i = 0; i < players.length; i++) {
    await expect(players[i].getByText('Les civils gagnent !')).toBeVisible();
    const expectedRole = i === targetIndex ? 'Undercover' : 'Civil';
    await expect(players[i].locator('.my-role .role-name')).toHaveText(expectedRole);
  }

  // ── Retour lobby : récap de soirée affiché ────────────────────────────────
  await host.getByRole('button', { name: 'Retour au lobby' }).click();
  await expect(host.getByText('Récap de la soirée')).toBeVisible();
  await expect(host.getByText('Victoire des civils')).toBeVisible();

  for (const ctx of contexts) await ctx.close();
});
