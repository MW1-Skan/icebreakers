/**
 * Ito — happy-path : 2 manches à 4 joueurs. Le test lit le nombre 🔒 de chaque
 * joueur sur SON écran, joue une manche parfaite (poses croissantes), puis une
 * manche avec une erreur volontaire (−1 vie, défausse automatique du plus
 * petit) → verdict final « Accordés » (2/3 vies).
 */
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const PLAYER_NAMES = ['Alice', 'Bob', 'Chloe', 'David'];

async function readNumbers(players: Page[]): Promise<number[]> {
  const numbers: number[] = [];
  for (const page of players) {
    numbers.push(Number((await page.locator('.number').innerText()).trim()));
  }
  return numbers;
}

async function pose(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Je pose ma carte' }).click();
  await page.getByRole('button', { name: /Confirmer/ }).click();
}

test('deux manches Ito : poses croissantes, erreur → −1 vie et défausse, verdict', async ({ browser }) => {
  const contexts: BrowserContext[] = [];

  const hostContext = await browser.newContext();
  contexts.push(hostContext);
  const host = await hostContext.newPage();
  await host.goto('/?seed=31');
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

  await host.getByRole('tab', { name: /Ito/ }).click();
  await expect(host.locator('#itomanches')).toBeVisible();
  await host.locator('#itomanches').selectOption('2');
  await host.getByRole('button', { name: 'Lancer la partie' }).click();

  // ── Manche 1 : parfaite (poses dans l'ordre croissant) ────────────────────
  await expect(host.getByText('Manche 1/2')).toBeVisible();
  const numbers1 = await readNumbers(players);
  // écart minimal garanti entre deux nombres quelconques (défaut 8)
  const sorted1 = [...numbers1].sort((a, b) => a - b);
  for (let i = 1; i < sorted1.length; i++) {
    expect(sorted1[i] - sorted1[i - 1]).toBeGreaterThanOrEqual(8);
  }
  const ascending1 = numbers1
    .map((n, i) => ({ n, i }))
    .sort((a, b) => a.n - b.n)
    .map((x) => x.i);
  for (let k = 0; k < ascending1.length; k++) {
    const idx = ascending1[k];
    await pose(players[idx]);
    // le dernier poseur bascule directement sur l'écran de fin de manche
    if (k < ascending1.length - 1) {
      await expect(players[idx].getByText('✅ Bien posée !')).toBeVisible();
    }
  }
  await expect(host.getByRole('heading', { name: 'Manche terminée' })).toBeVisible();
  await expect(host.locator('.frise-card[data-kind="posed"]')).toHaveCount(4);
  await host.getByRole('button', { name: 'Manche suivante (2/2)' }).click();

  // ── Manche 2 : erreur volontaire (le 2e plus petit pose en premier) ───────
  await expect(host.getByText('Manche 2/2')).toBeVisible();
  const numbers2 = await readNumbers(players);
  const ascending2 = numbers2
    .map((n, i) => ({ n, i }))
    .sort((a, b) => a.n - b.n)
    .map((x) => x.i);
  const [smallest, second, third, fourth] = ascending2;

  await pose(players[second]); // ❌ −1 vie, la carte du plus petit est défaussée
  await expect(players[second].getByText('❌ Posée trop tôt… −1 vie')).toBeVisible();
  await expect(players[smallest].getByText('Ta carte a été défaussée')).toBeVisible();
  await expect(host.locator('.frise-card[data-kind="error"]')).toHaveCount(1);
  await expect(host.locator('.frise-card[data-kind="discarded"]')).toHaveCount(1);
  await expect(host.locator('.phase-header .lives')).toContainText('🖤');

  // la manche continue avec ce qui reste, dans l'ordre
  await pose(players[third]);
  await pose(players[fourth]);
  await expect(host.getByRole('heading', { name: 'Manche terminée' })).toBeVisible();
  await host.getByRole('button', { name: 'Voir le verdict' }).click();

  // ── Verdict : 2/3 vies → « Accordés » (victoire) ──────────────────────────
  await expect(host.getByRole('heading', { name: 'Verdict' })).toBeVisible();
  await expect(host.locator('.final .tv-huge')).toHaveText('Accordés');
  for (const page of players) {
    await expect(page.locator('.verdict')).toHaveText('Accordés');
  }

  await host.getByRole('button', { name: 'Retour au lobby' }).click();
  await expect(host.getByText('Récap de la soirée')).toBeVisible();
  await expect(host.getByText('2/3 vies — Accordés')).toBeVisible();

  for (const ctx of contexts) await ctx.close();
});
