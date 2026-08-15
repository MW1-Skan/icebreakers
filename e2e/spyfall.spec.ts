/**
 * Spyfall — happy-path : 4 joueurs, 1 manche. Le test identifie l'espion en
 * lisant les écrans 🔒 (trois voient la carte, un voit « Tu es l'ESPION »),
 * vérifie que ni la TV ni l'espion ne voient la carte, puis fait gagner
 * l'équipe par accusation unanime (accusateur décisif +2).
 */
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const PLAYER_NAMES = ['Alice', 'Bob', 'Chloe', 'David'];

test('une manche Spyfall : carte secrète, accusation unanime, points', async ({ browser }) => {
  const contexts: BrowserContext[] = [];

  const hostContext = await browser.newContext();
  contexts.push(hostContext);
  const host = await hostContext.newPage();
  await host.goto('/?seed=51');
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

  await host.getByRole('button', { name: /Spyfall/ }).click();
  await expect(host.locator('#sfcount')).toBeVisible();
  await host.getByRole('button', { name: 'Lancer la partie' }).click();

  // ── Brief : chacun consulte sa carte ; le test identifie l'espion ─────────
  await expect(host.getByRole('heading', { name: 'Distribution' })).toBeVisible();
  let spyIndex = -1;
  let card = '';
  for (let i = 0; i < players.length; i++) {
    await players[i].getByRole('button', { name: 'Voir ma carte' }).click();
    await expect(players[i].locator('.word, .spy-card').first()).toBeVisible();
    const text = await players[i].locator('.word-card').innerText();
    if (text.includes('ESPION')) {
      spyIndex = i;
    } else {
      const cardText = (await players[i].locator('.word').innerText()).trim();
      if (card) expect(cardText).toBe(card); // tous les civils partagent la carte
      card = cardText;
    }
  }
  expect(spyIndex).toBeGreaterThanOrEqual(0);
  const spyName = PLAYER_NAMES[spyIndex];
  const spy = players[spyIndex];

  // la TV et l'espion ne connaissent pas la carte (elle est dans la grille,
  // mais jamais désignée comme « la » carte)
  expect(await spy.locator('.word-card').innerText()).not.toContain(card);

  // ── Interrogatoire → un civil accuse l'espion ─────────────────────────────
  await host.getByRole('button', { name: 'Lancer l’interrogatoire' }).click();
  await expect(host.getByRole('heading', { name: 'Interrogatoire !' })).toBeVisible();

  const accuserIndex = (spyIndex + 1) % players.length;
  const accuser = players[accuserIndex];
  await accuser.getByRole('button', { name: /Accuser quelqu'un/ }).click();
  await accuser.locator('.target-grid').getByRole('button', { name: spyName }).click();

  // ── Vote d'accusation : l'accusé ne vote pas, unanimité de Oui ────────────
  await expect(host.getByText(`accuse ${'🦊 🐸 🐼 🦁'.split(' ')[spyIndex]} ${spyName}`).or(host.getByText(/accuse/))).toBeVisible();
  await expect(spy.getByText(/t'accuse/)).toBeVisible();
  for (let i = 0; i < players.length; i++) {
    if (i === spyIndex) continue;
    await players[i].getByRole('button', { name: /Oui, c'est l'espion/ }).click();
  }

  // ── Révélation : l'équipe gagne, accusateur décisif +2 ────────────────────
  await expect(host.getByText('🎉 L’équipe gagne !')).toBeVisible();
  await expect(host.getByText(card, { exact: false }).first()).toBeVisible();
  await expect(host.getByText('Accusateur décisif')).toBeVisible();

  await host.getByRole('button', { name: 'Voir la fin' }).click();
  await expect(host.getByRole('heading', { name: 'Fin de partie', level: 1 })).toBeVisible();
  await expect(players[accuserIndex].locator('.final-points')).toHaveText('3 pts');
  await expect(spy.locator('.final-points')).toHaveText('0 pts');

  await host.getByRole('button', { name: 'Retour au lobby' }).click();
  await expect(host.getByText('L’équipe démasque l’espion')).toBeVisible();

  for (const ctx of contexts) await ctx.close();
});
