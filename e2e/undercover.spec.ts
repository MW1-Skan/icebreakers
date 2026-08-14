/**
 * Happy-path (DoD, étendu) : 1 contexte animateur + 4 contextes joueurs jouent
 * une SÉRIE de 2 manches d'Undercover, de la distribution au classement final.
 *
 * Déterminisme : seed RNG injectée via /?seed=42 (acceptée hors production).
 * La cible du vote n'est pas codée en dur : les joueurs comparent leurs mots
 * (3 identiques, 1 différent à 4 joueurs — pas de Mr. White) et éliminent le
 * porteur du mot minoritaire → victoire des civils à chaque manche. Les trois
 * civils ayant « bien voté », chacun marque 2 + 1 bonus = 3 pts par manche →
 * le cumul en tête vaut toujours 6 pts, quel que soit le tirage des rôles.
 */
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const PLAYER_NAMES = ['Alice', 'Bob', 'Chloe', 'David'];

function minorityIndex(words: string[]): number {
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  return words.findIndex((w) => counts.get(w) === 1);
}

/** Joue une manche complète et renvoie l'index de l'undercover + les mots vus. */
async function playManche(host: Page, players: Page[]): Promise<{ targetIndex: number; words: string[] }> {
  await expect(host.getByRole('heading', { name: 'Distribution des mots' })).toBeVisible();

  // Distribution : chacun consulte son mot 🔒 (la carte se re-masque à chaque manche).
  const words: string[] = [];
  for (const page of players) {
    await page.getByRole('button', { name: 'Voir mon mot' }).click();
    words.push((await page.locator('.word').innerText()).trim());
  }
  const targetIndex = minorityIndex(words);
  expect(targetIndex).toBeGreaterThanOrEqual(0);
  const targetName = PLAYER_NAMES[targetIndex];

  // Tour de description (l'animateur avance), discussion, vote.
  await host.getByRole('button', { name: 'Commencer le tour de parole' }).click();
  for (let i = 0; i < PLAYER_NAMES.length - 1; i++) {
    await host.getByRole('button', { name: 'Joueur suivant' }).click();
  }
  await host.getByRole('button', { name: 'Passer à la discussion' }).click();
  await host.getByRole('button', { name: 'Passer au vote' }).click();

  // Vote secret : tous contre le mot minoritaire (lui vote quelqu'un d'autre).
  for (let i = 0; i < players.length; i++) {
    const voteFor = i === targetIndex ? PLAYER_NAMES[(targetIndex + 1) % 4] : targetName;
    await players[i].getByRole('button', { name: voteFor }).click();
  }

  // Révélation : l'undercover est éliminé, rôle révélé.
  await expect(host.getByText(`${targetName} est éliminé·e`)).toBeVisible();
  await expect(host.locator('.role-reveal')).toHaveText('Undercover');
  await host.getByRole('button', { name: 'Continuer' }).click();

  return { targetIndex, words };
}

test('série de 2 manches : 1 animateur + 4 joueurs, cumul et bonus de bon vote', async ({ browser }) => {
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

  // ── Série de 2 manches + lancement ────────────────────────────────────────
  await host.locator('#manches').selectOption('2');
  const startButton = host.getByRole('button', { name: 'Lancer la partie' });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  // ── Manche 1 ──────────────────────────────────────────────────────────────
  await expect(host.getByText('Manche 1/2')).toBeVisible();
  const manche1 = await playManche(host, players);

  // Fin de manche 1 : cumul intermédiaire, bonus 🎯, bouton « Manche suivante ».
  await expect(host.getByRole('heading', { name: 'Fin de la manche 1' })).toBeVisible();
  await expect(host.getByText('Les civils gagnent !')).toBeVisible();
  await expect(host.getByText('Cumul après cette manche')).toBeVisible();
  await expect(host.getByText('🎯 = bonus de bon vote (+1)')).toBeVisible();
  await expect(players[0].getByText('la suivante arrive')).toBeVisible();
  await host.getByRole('button', { name: 'Manche suivante (2/2)' }).click();

  // ── Manche 2 : nouveau tirage (anti-répétition intra-salon) ───────────────
  await expect(host.getByText('Manche 2/2')).toBeVisible();
  const manche2 = await playManche(host, players);
  expect(new Set(manche2.words)).not.toEqual(new Set(manche1.words));

  // ── Fin de série : classement final, 6 pts en tête (3 + 3, bonus compris) ─
  await expect(host.getByRole('heading', { name: 'Fin de la série' })).toBeVisible();
  await expect(host.getByText('Classement final de la série')).toBeVisible();
  await expect(host.locator('.cumulative li.leader')).toContainText('6 pts');
  for (const page of players) {
    await expect(page.getByText('Classement final de la série')).toBeVisible();
  }

  // ── Retour lobby : récap de soirée avec le résumé de série ────────────────
  await host.getByRole('button', { name: 'Retour au lobby' }).click();
  await expect(host.getByText('Récap de la soirée')).toBeVisible();
  await expect(host.getByText(/2 manches — en tête/)).toBeVisible();

  for (const ctx of contexts) await ctx.close();
});
