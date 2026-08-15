/**
 * Happy-path (DoD, étendu) : 1 contexte animateur + 4 contextes joueurs jouent
 * une SÉRIE de 2 manches d'Undercover, de la distribution au classement final.
 *
 * Déterminisme : seed RNG injectée via /?seed=42 (acceptée hors production).
 * Rien n'est codé en dur : les joueurs déduisent l'undercover en comparant
 * leurs mots (3 identiques, 1 différent à 4 joueurs — pas de Mr. White).
 *
 * Schéma de vote par manche (exerce la règle du bonus « non unanime ») :
 * deux civils « loyaux » votent l'undercover, un civil « dissident » vote un
 * autre civil → l'undercover est éliminé (2 voix contre 1), les civils gagnent,
 * et SEULS les deux loyaux touchent le bonus 🎯 (+1). Le test recalcule le
 * cumul attendu et le confronte au classement final.
 */
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const PLAYER_NAMES = ['Alice', 'Bob', 'Chloe', 'David'];

function minorityIndex(words: string[]): number {
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  return words.findIndex((w) => counts.get(w) === 1);
}

/** Joue une manche complète ; renvoie l'undercover et les mots pour le score attendu. */
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
  const dissenterIndex = (targetIndex + 1) % 4;

  // Tour de description (l'animateur avance), discussion, vote.
  await host.getByRole('button', { name: 'Commencer le tour de parole' }).click();
  for (let i = 0; i < PLAYER_NAMES.length - 1; i++) {
    await host.getByRole('button', { name: 'Joueur suivant' }).click();
  }
  await host.getByRole('button', { name: 'Passer à la discussion' }).click();
  await host.getByRole('button', { name: 'Passer au vote' }).click();

  // Vote : 2 civils loyaux → undercover ; le dissident → un civil ; l'undercover → le dissident.
  for (let i = 0; i < players.length; i++) {
    let voteFor: string;
    if (i === targetIndex) voteFor = PLAYER_NAMES[dissenterIndex];
    else if (i === dissenterIndex) voteFor = PLAYER_NAMES[(targetIndex + 2) % 4];
    else voteFor = targetName;
    await players[i].getByRole('button', { name: voteFor }).click();
  }

  // Révélation : l'undercover est éliminé (2 voix contre 1), rôle révélé.
  await expect(host.getByText(`${targetName} est éliminé·e`)).toBeVisible();
  await expect(host.locator('.role-reveal')).toHaveText('Undercover');
  await host.getByRole('button', { name: 'Continuer' }).click();

  return { targetIndex, words };
}

/** Points attendus de la manche : loyaux 2+1, dissident 2, undercover 0. */
function manchePointsFor(targetIndex: number): number[] {
  const dissenterIndex = (targetIndex + 1) % 4;
  return PLAYER_NAMES.map((_, i) => (i === targetIndex ? 0 : i === dissenterIndex ? 2 : 3));
}

test('série de 2 manches : cumul, bonus 🎯 des seuls votes non unanimes', async ({ browser }) => {
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

  // ── Série de 2 manches + lancement (la carte ouvre la modale de config) ───
  await host.getByRole('button', { name: /Undercover/ }).click();
  await expect(host.locator('#manches')).toBeVisible();
  await host.locator('#manches').selectOption('2');
  const startButton = host.getByRole('button', { name: 'Lancer la partie' });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  const expectedTotal = [0, 0, 0, 0];

  // ── Manche 1 ──────────────────────────────────────────────────────────────
  await expect(host.getByText('Manche 1/2')).toBeVisible();
  const manche1 = await playManche(host, players);
  manchePointsFor(manche1.targetIndex).forEach((p, i) => (expectedTotal[i] += p));

  // Fin de manche 1 : exactement 2 badges 🎯 (les loyaux, pas le dissident).
  await expect(host.getByRole('heading', { name: 'Fin de la manche 1' })).toBeVisible();
  await expect(host.getByText('Les civils gagnent !')).toBeVisible();
  await expect(host.locator('.reveal .bonus')).toHaveCount(2);
  await expect(host.getByText('🎯 = bonus de bon vote (+1)')).toBeVisible();
  await expect(host.getByText('Cumul après cette manche')).toBeVisible();
  await expect(players[0].getByText('la suivante arrive')).toBeVisible();
  await host.getByRole('button', { name: 'Manche suivante (2/2)' }).click();

  // ── Manche 2 : nouveau tirage (anti-répétition intra-salon) ───────────────
  await expect(host.getByText('Manche 2/2')).toBeVisible();
  const manche2 = await playManche(host, players);
  manchePointsFor(manche2.targetIndex).forEach((p, i) => (expectedTotal[i] += p));
  expect(new Set(manche2.words)).not.toEqual(new Set(manche1.words));

  // ── Fin de série : classement final = cumul recalculé par le test ─────────
  await expect(host.getByRole('heading', { name: 'Fin de la série' })).toBeVisible();
  await expect(host.getByText('Classement final de la série')).toBeVisible();
  const maxPoints = Math.max(...expectedTotal);
  await expect(host.locator('.cumulative li.leader')).toContainText(`${maxPoints} pts`);
  await expect(host.locator('.cumulative li')).toHaveCount(4);
  for (const page of players) {
    await expect(page.getByText('Classement final de la série')).toBeVisible();
  }

  // ── Retour lobby : récap de soirée avec le résumé de série ────────────────
  await host.getByRole('button', { name: 'Retour au lobby' }).click();
  await expect(host.getByText('Récap de la session')).toBeVisible();
  await expect(host.getByText(/2 manches — en tête/)).toBeVisible();

  for (const ctx of contexts) await ctx.close();
});
