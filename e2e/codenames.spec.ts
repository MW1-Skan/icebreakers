/**
 * Codenames — happy-path complet à 4 joueurs (2 équipes de 2), grille 16,
 * série de 2 manches. Le test lit la CLÉ sur l'écran d'un maître-espion
 * (data-kind) et pilote précisément :
 *   manche 1 — indice refusé (mot de la grille), indice valide, touche de sa
 *   couleur (on continue), neutre (fin de tour), puis l'autre équipe touche
 *   l'ASSASSIN → défaite immédiate ;
 *   manche 2 — maîtres-espions TOURNANTS, victoire par la série complète
 *   (6 touches sur un indice « — 6 »).
 */
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const PLAYER_NAMES = ['Alice', 'Bob', 'Chloe', 'David'];

type Kind = 'red' | 'blue' | 'neutral' | 'assassin';

/** Lit la clé complète (mot → couleur) sur l'écran d'un maître-espion. */
async function readKey(spymaster: Page): Promise<Map<string, Kind>> {
  const key = new Map<string, Kind>();
  for (const cell of await spymaster.locator('.cell[data-kind]').all()) {
    const word = (await cell.locator('.word').innerText()).trim();
    key.set(word, (await cell.getAttribute('data-kind')) as Kind);
  }
  return key;
}

/** Les pages qui affichent « Voir la clé » = les maîtres-espions de la manche. */
async function findSpymasters(players: Page[]): Promise<Page[]> {
  const spymasters: Page[] = [];
  for (const page of players) {
    if (await page.getByRole('button', { name: 'Voir la clé' }).isVisible().catch(() => false)) {
      spymasters.push(page);
    }
  }
  return spymasters;
}

/** Le devineur actif touche `word` et confirme (tap → confirmation). */
async function touch(guesser: Page, word: string): Promise<void> {
  await guesser.getByRole('button', { name: word, exact: true }).click();
  await guesser.getByRole('button', { name: 'Confirmer' }).click();
}

test('série de 2 manches : clé secrète, indices validés, assassin, rotation, victoire aux mots', async ({
  browser,
}) => {
  const contexts: BrowserContext[] = [];

  // ── Salon + 4 joueurs (seed déterministe) ─────────────────────────────────
  const hostContext = await browser.newContext();
  contexts.push(hostContext);
  const host = await hostContext.newPage();
  await host.goto('/?seed=42');
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

  // ── Config : grille 16, série de 2 manches ────────────────────────────────
  await host.getByRole('button', { name: /Codenames/ }).click();
  await expect(host.locator('#cnsize')).toBeVisible();
  await host.locator('#cnsize').selectOption('16');
  await host.locator('#cnmanches').selectOption('2');
  await host.getByRole('button', { name: 'Lancer la partie' }).click();

  // ── Manche 1 / brief : les 2 maîtres-espions consultent la même clé ───────
  await expect(host.getByRole('heading', { name: 'Préparation' })).toBeVisible();
  await expect(host.getByText('Manche 1/2')).toBeVisible();
  const spymasters1 = await findSpymasters(players);
  expect(spymasters1).toHaveLength(2);
  for (const sm of spymasters1) await sm.getByRole('button', { name: 'Voir la clé' }).click();
  const key = await readKey(spymasters1[0]);
  expect(key.size).toBe(16);
  expect([...key.values()].filter((k) => k === 'assassin')).toHaveLength(1);
  expect(await readKey(spymasters1[1])).toEqual(key);

  // La TV affiche les ✓ de consultation, puis l'animateur lance.
  await host.getByRole('button', { name: 'Lancer le premier indice' }).click();
  await expect(host.getByRole('heading', { name: 'Indice en préparation…' })).toBeVisible();

  // ── L'équipe active : couleur lue sur la TV, maître-espion + devineur ─────
  const activeTeam = Number(await host.locator('.team.active').getAttribute('data-team')) as 0 | 1;
  const activeColor: Kind = activeTeam === 0 ? 'red' : 'blue';
  let activeSpymaster: Page | undefined;
  for (const sm of spymasters1) {
    if (await sm.getByLabel('Ton indice').isVisible().catch(() => false)) activeSpymaster = sm;
  }
  expect(activeSpymaster).toBeDefined();

  // ── Indice illégal (mot de la grille) refusé avec message ─────────────────
  const gridWord = [...key.keys()][0];
  await activeSpymaster!.getByLabel('Ton indice').fill(gridWord);
  await activeSpymaster!.getByRole('button', { name: 'Envoyer' }).click();
  await expect(activeSpymaster!.getByRole('alert')).toContainText('grille');

  // ── Indice valide « xylophone — 2 » → 3 touches max ───────────────────────
  await activeSpymaster!.getByLabel('Ton indice').fill('xylophone');
  await activeSpymaster!.locator('#cncount').selectOption({ label: '2' });
  await activeSpymaster!.getByRole('button', { name: 'Envoyer' }).click();
  await expect(host.getByText('« xylophone » — 2')).toBeVisible();

  // Le devineur actif = la page avec la grille interactive (cellules cliquables).
  let guesser1: Page | undefined;
  for (const page of players) {
    if (spymasters1.includes(page)) continue;
    if ((await page.locator('app-codenames-grid button.cell:not([disabled])').count()) > 0) {
      guesser1 = page;
    }
  }
  expect(guesser1).toBeDefined();

  const wordsOf = (kind: Kind): string[] =>
    [...key.entries()].filter(([, k]) => k === kind).map(([w]) => w);

  // Touche de SA couleur → la carte se révèle, l'équipe continue.
  await touch(guesser1!, wordsOf(activeColor)[0]);
  await expect(host.locator('.cell.revealed')).toHaveCount(1);
  await expect(host.getByText(/2 touches? restante/)).toBeVisible();

  // Touche neutre → fin de tour, l'autre équipe prépare son indice.
  await touch(guesser1!, wordsOf('neutral')[0]);
  await expect(host.locator('.cell.revealed')).toHaveCount(2);
  await expect(host.getByRole('heading', { name: 'Indice en préparation…' })).toBeVisible();
  await expect(host.locator('.team.active')).toHaveAttribute('data-team', String(1 - activeTeam));

  // ── L'autre équipe touche l'ASSASSIN → défaite immédiate ☠️ ───────────────
  const spymaster2 = spymasters1.find((p) => p !== activeSpymaster)!;
  await spymaster2.getByLabel('Ton indice').fill('fantomatique');
  await spymaster2.getByRole('button', { name: 'Envoyer' }).click();
  const guesser2 = players.find((p) => !spymasters1.includes(p) && p !== guesser1)!;
  await touch(guesser2, wordsOf('assassin')[0]);

  await expect(host.getByRole('heading', { name: 'Fin de la manche 1' })).toBeVisible();
  await expect(host.getByText(/ont touché l'assassin/)).toBeVisible();
  // Les gagnants = l'équipe qui N'A PAS touché l'assassin (la première équipe active).
  await expect(host.getByText(new RegExp(`Les (Rouge|Bleu)s gagnent`))).toBeVisible();
  // Série de 2 manches → le cumul s'affiche : les gagnants mènent avec 3 pts.
  await expect(host.getByText('Cumul après cette manche')).toBeVisible();
  await expect(host.locator('.cumulative li.leader')).toContainText('3 pts');

  // ── Manche 2 : maîtres-espions TOURNANTS (les ex-devineurs prennent la clé) ─
  await host.getByRole('button', { name: 'Manche suivante (2/2)' }).click();
  await expect(host.getByText('Manche 2/2')).toBeVisible();
  const spymasters2 = await findSpymasters(players);
  expect(spymasters2).toHaveLength(2);
  expect(spymasters2).toContain(guesser1!);
  expect(spymasters2).toContain(guesser2);

  for (const sm of spymasters2) await sm.getByRole('button', { name: 'Voir la clé' }).click();
  const key2 = await readKey(spymasters2[0]);
  await host.getByRole('button', { name: 'Lancer le premier indice' }).click();

  // ── Victoire par la série complète : « tout — 6 » puis 6 touches ──────────
  const activeTeam2 = Number(await host.locator('.team.active').getAttribute('data-team')) as 0 | 1;
  const color2: Kind = activeTeam2 === 0 ? 'red' : 'blue';
  let activeSm2: Page | undefined;
  for (const sm of spymasters2) {
    if (await sm.getByLabel('Ton indice').isVisible().catch(() => false)) activeSm2 = sm;
  }
  await activeSm2!.getByLabel('Ton indice').fill('partout');
  await activeSm2!.locator('#cncount').selectOption({ label: '6' });
  await activeSm2!.getByRole('button', { name: 'Envoyer' }).click();

  // Le devineur actif est le coéquipier d'activeSm2 : celui qui voit la grille interactive.
  let activeGuesser2: Page | undefined;
  for (const page of players) {
    if (spymasters2.includes(page)) continue;
    if ((await page.locator('app-codenames-grid button.cell:not([disabled])').count()) > 0) {
      activeGuesser2 = page;
    }
  }
  expect(activeGuesser2).toBeDefined();

  const ownWords2 = [...key2.entries()].filter(([, k]) => k === color2).map(([w]) => w);
  // Grille 16 : l'équipe qui commence a 6 mots — on les touche tous.
  expect(ownWords2.length).toBe(6);
  for (const word of ownWords2) {
    await touch(activeGuesser2!, word);
  }

  await expect(host.getByRole('heading', { name: 'Fin de partie' })).toBeVisible();
  await expect(host.getByText(/gagnent 6–\d/)).toBeVisible();
  await expect(host.getByText('Classement de la série')).toBeVisible();

  // ── Retour lobby : le récap de session mentionne la série ─────────────────
  await host.getByRole('button', { name: 'Retour au lobby' }).click();
  await expect(host.getByText('Récap de la session')).toBeVisible();
  await expect(host.getByText(/Série : (Rouge|Bleu)/)).toBeVisible();

  for (const ctx of contexts) await ctx.close();
});
