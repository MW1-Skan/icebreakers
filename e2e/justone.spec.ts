/**
 * Just One — happy-path complet : 1 animateur + 4 joueurs jouent une partie
 * de 5 manches, avec rotation du devineur, annulation automatique des indices
 * ressemblants, réponse exacte / passe / erreur / réponse proche arbitrée.
 *
 * Le test lit le mot mystère sur l'écran d'un DONNEUR (le devineur ne le voit
 * jamais) et vérifie au passage que la TV ne l'affiche pas avant la résolution.
 * Score attendu : +1, 0, −1, +1, +1 → 2/5 (« Pas mal »).
 */
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const PLAYER_NAMES = ['Alice', 'Bob', 'Chloe', 'David'];
const MANCHES = 5;

type MancheMode = 'correct' | 'pass' | 'wrong' | 'close';

test('une partie Just One complète : 5 manches, rotation, arbitrage', async ({ browser }) => {
  const contexts: BrowserContext[] = [];

  // ── Salon + 4 joueurs ─────────────────────────────────────────────────────
  const hostContext = await browser.newContext();
  contexts.push(hostContext);
  const host = await hostContext.newPage();
  await host.goto('/?seed=11');
  await host.getByRole('button', { name: 'Créer un salon' }).click();
  await expect(host).toHaveURL(/\/host\/[A-Z]{4}$/);
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

  // ── Sélection de Just One, 5 manches, lancement ───────────────────────────
  await host.getByRole('button', { name: /Just One/ }).click();
  await expect(host.locator('#jomanches')).toBeVisible();
  await host.locator('#jomanches').selectOption('5');
  const startButton = host.getByRole('button', { name: 'Lancer la partie' });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  const modes: MancheMode[] = ['correct', 'pass', 'wrong', 'correct', 'close'];
  for (let m = 1; m <= MANCHES; m++) {
    await playManche(host, players, m, modes[m - 1]);
  }

  // ── Score final + récap ───────────────────────────────────────────────────
  await expect(host.getByRole('heading', { name: 'Score final' })).toBeVisible();
  await expect(host.locator('.final .tv-huge')).toHaveText('2/5');
  await expect(host.locator('.final .tv-title')).toHaveText('Pas mal');
  await expect(host.locator('.history tbody tr')).toHaveCount(5);
  for (const page of players) {
    await expect(page.locator('.final-score')).toHaveText('2/5');
  }

  await host.getByRole('button', { name: 'Retour au lobby' }).click();
  await expect(host.getByText('Récap de la session')).toBeVisible();
  await expect(host.getByText(/Score d'équipe : 2\/5/)).toBeVisible();

  for (const ctx of contexts) await ctx.close();
});

async function playManche(host: Page, players: Page[], m: number, mode: MancheMode): Promise<void> {
  const guesserIndex = (m - 1) % players.length;
  const guesser = players[guesserIndex];
  const givers = players.filter((_, i) => i !== guesserIndex);
  // L'arbitre de manche est le prochain devineur de la rotation.
  const arbiter = players[m % players.length];

  await expect(host.getByText(`Manche ${m}/${MANCHES}`)).toBeVisible();
  await expect(host.getByRole('heading', { name: 'Écriture des indices' })).toBeVisible();

  // Le mot mystère, lu sur l'écran d'un donneur — jamais sur la TV ni chez le devineur.
  const word = (await givers[0].locator('.word-card .word').innerText()).trim();
  expect(word.length).toBeGreaterThan(1);
  expect(await host.locator('main').innerText()).not.toContain(word);
  expect(await guesser.locator('main').innerText()).not.toContain(word);

  // Manche 1 : « soleil » / « soleils » s'annulent en bloc, « plage » survit.
  const clues = m === 1 ? ['soleil', 'soleils', 'plage'] : [`alpha${m}`, `bravo${m}`, `charly${m}`];
  for (let i = 0; i < givers.length; i++) {
    await givers[i].getByLabel('Ton indice').fill(clues[i]);
    await givers[i].getByRole('button', { name: /Envoyer|Corriger/ }).click();
  }

  // ── Validation collective ─────────────────────────────────────────────────
  await expect(host.getByRole('heading', { name: 'Vérification des indices' })).toBeVisible();
  if (m === 1) {
    await expect(givers[0].locator('.clue-list li.cancelled')).toHaveCount(2);
    await expect(givers[0].getByText('annulé (ressemblance)').first()).toBeVisible();
  }
  for (const giver of givers) {
    await giver.getByRole('button', { name: 'Prêt !' }).click();
  }

  // ── Devinette ─────────────────────────────────────────────────────────────
  await expect(host.getByRole('heading', { name: 'Devinette !' })).toBeVisible();
  if (m === 1) {
    // 1 indice restant, 2 annulés masqués (jamais révélés au devineur)
    await expect(guesser.locator('.clue-list .clue-text.big')).toHaveCount(1);
    await expect(guesser.locator('.clue-list li.masked')).toHaveCount(2);
    expect(await guesser.locator('main').innerText()).not.toContain('soleil');
  }

  switch (mode) {
    case 'correct':
      await guesser.getByLabel('Ta réponse').fill(word);
      await guesser.getByRole('button', { name: 'Valider' }).click();
      await expect(host.getByText('✔ Trouvé ! +1')).toBeVisible();
      break;
    case 'pass':
      await guesser.getByRole('button', { name: 'Passer (0 pt)' }).click();
      await expect(host.getByText('→ Passé (0)')).toBeVisible();
      break;
    case 'wrong':
      await guesser.getByLabel('Ta réponse').fill('zzzzzzz');
      await guesser.getByRole('button', { name: 'Valider' }).click();
      await expect(host.getByText('✘ Raté…')).toBeVisible();
      break;
    case 'close': {
      // une faute de frappe (dernière lettre en moins) → l'arbitre tranche
      const typo = word.slice(0, -1);
      await guesser.getByLabel('Ta réponse').fill(typo);
      await guesser.getByRole('button', { name: 'Valider' }).click();
      await expect(host.getByRole('heading', { name: 'Arbitrage…' })).toBeVisible();
      await expect(host.getByText(`« ${typo} »`)).toBeVisible();
      await arbiter.getByRole('button', { name: '✔ Accepter' }).click();
      await expect(host.getByText('✔ Trouvé ! +1')).toBeVisible();
      break;
    }
  }

  // ── Résolution : le mot est enfin révélé sur la TV ────────────────────────
  await expect(host.getByRole('heading', { name: 'Résolution' })).toBeVisible();
  await expect(host.locator('.reveal-card .word')).toHaveText(word);

  const nextLabel = m < MANCHES ? `Manche suivante (${m + 1}/${MANCHES})` : 'Voir le score final';
  await host.getByRole('button', { name: nextLabel }).click();
}
