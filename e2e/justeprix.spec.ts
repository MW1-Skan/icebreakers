/**
 * Juste Prix — happy-path à 3 joueurs, 2 articles, avec un pack de test
 * uploadé via l'API admin (le jeu n'a pas encore de pack intégré). Le test lit
 * le nom de l'article sur la TV, retrouve son prix dans le pack et fait
 * miser : Alice pile (🎯, 1re), Bob à +10 % (2e), Chloe au double (3e).
 * Couvre aussi « Changer d'article » (mises effacées), l'absence du prix à
 * l'écran avant la révélation, et le repli « Image indisponible » (les photos
 * pointent vers un domaine qui ne résout pas : pas de réseau en e2e).
 */
import { expect, test } from '@playwright/test';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';

const PASSWORD = 'e2e-admin';
const PLAYER_NAMES = ['Alice', 'Bob', 'Chloe'];

const ARTICLES = [
  { name: 'Gamelle e2e', details: 'Toile et bois', price: 1800 },
  { name: 'Stylo e2e', details: 'Corps en aluminium', price: 24 },
  { name: 'Ruche e2e', details: 'Dix cadres', price: 89.99 },
  { name: 'Plaid e2e', details: '200 × 150 cm', price: 10300 },
];

const PACK = {
  formatVersion: 1,
  id: 'e2e-justeprix-01',
  game: 'justeprix',
  name: 'Juste Prix e2e',
  mode: 'normal',
  lang: 'fr',
  author: 'E2E',
  entries: ARTICLES.map((a, i) => ({
    ...a,
    image: `https://images.e2e.invalid/article-${i}.jpg`,
    source: `https://boutique.e2e.invalid/article-${i}`,
    seenAt: '2026-10',
  })),
};

async function adminToken(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/admin/login', { data: { password: PASSWORD } });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { token: string }).token;
}

/** Saisie « à la française » d'un montant (virgule décimale). */
function typed(amount: number): string {
  return String(Math.round(amount * 100) / 100).replace('.', ',');
}

async function bid(player: Page, amount: number): Promise<void> {
  await player.getByLabel('Ton estimation en euros').fill(typed(amount));
  await player.getByRole('button', { name: /^(Miser|Modifier)$/ }).click();
}

async function currentArticle(host: Page): Promise<(typeof ARTICLES)[number]> {
  const name = (await host.locator('.item-name').innerText()).trim();
  const article = ARTICLES.find((a) => a.name === name);
  expect(article, `article inconnu à l'écran : « ${name} »`).toBeDefined();
  return article!;
}

test('deux articles : mises secrètes, changement d’article, classement 3/2/1, récap', async ({
  browser,
  request,
}) => {
  const token = await adminToken(request);
  const auth = { Authorization: `Bearer ${token}` };
  const upload = await request.post('/api/admin/packs', {
    headers: auth,
    multipart: {
      file: { name: `${PACK.id}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(PACK)) },
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
    await host.goto('/?seed=7');
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
    const [alice, bob, chloe] = players;

    // ── Modale : le pack de test est listé, 2 articles ───────────────────────
    await host.getByRole('button', { name: /Juste Prix/ }).click();
    await expect(host.locator('.pack-item', { hasText: 'Juste Prix e2e' })).toBeVisible();
    await host.locator('#jpmanches').selectOption('2');
    await host.getByRole('button', { name: 'Lancer la partie' }).click();

    // ── Article 1 : changement d'article (mises effacées) ────────────────────
    await expect(host.getByRole('heading', { name: 'Combien ça coûte ?' })).toBeVisible();
    await expect(host.getByText('Article 1/2')).toBeVisible();
    await expect(host.getByText('Image indisponible')).toBeVisible();
    const first = await currentArticle(host);

    await bid(alice, 1);
    await expect(alice.getByTestId('my-bid')).toHaveText('1 €');
    await expect(host.getByText('1/3 ont misé')).toBeVisible();
    await host.getByRole('button', { name: '🎲 Changer d\'article' }).click();
    await expect(host.locator('.item-name')).not.toHaveText(first.name);
    await expect(host.getByText('0/3 ont misé')).toBeVisible();
    await expect(alice.getByTestId('my-bid')).toHaveCount(0);

    for (let n = 1; n <= 2; n++) {
      await expect(host.getByText(`Article ${n}/2`)).toBeVisible();
      const article = await currentArticle(host);

      await bid(alice, article.price);
      await bid(bob, article.price * 1.1);
      // Le prix n'apparaît nulle part sur la TV avant la révélation.
      await expect(host.getByTestId('justeprix-price')).toHaveCount(0);
      await bid(chloe, article.price * 2);

      // ── Révélation (clôture anticipée : les 3 ont misé) ──────────────────
      await expect(host.getByRole('heading', { name: 'Le juste prix !' })).toBeVisible();
      await expect(host.getByTestId('justeprix-price')).toHaveText(
        new Intl.NumberFormat('fr-FR', {
          style: 'currency',
          currency: 'EUR',
          minimumFractionDigits: Number.isInteger(article.price) ? 0 : 2,
          maximumFractionDigits: Number.isInteger(article.price) ? 0 : 2,
        }).format(article.price),
      );
      await expect(host.getByText('🎯 LE JUSTE PRIX !')).toBeVisible();
      await expect(host.locator('.ranking tr', { hasText: 'Alice' })).toContainText('+3 pts');
      await expect(host.locator('.ranking tr', { hasText: 'Bob' })).toContainText('+2 pts');
      await expect(host.locator('.ranking tr', { hasText: 'Chloe' })).toContainText('+1 pt');
      await expect(alice.getByTestId('my-result')).toContainText('1er, +3 pts 🎯');

      await host.getByRole('button', { name: n < 2 ? 'Article suivant (2/2)' : 'Voir le classement' }).click();
    }

    // ── Podium + récap des articles ──────────────────────────────────────────
    await expect(host.getByText('Classement final')).toBeVisible();
    await expect(host.locator('.podium li.first')).toContainText('Alice');
    await expect(host.locator('.podium li.first')).toContainText('6 pts');
    await expect(host.getByText('Récap des articles')).toBeVisible();
    await expect(host.locator('.history li')).toHaveCount(2);

    await host.getByRole('button', { name: 'Retour au lobby' }).click();
    await expect(host.getByText('Récap de la session')).toBeVisible();
    await expect(host.getByText('En tête : Alice (6 pts)')).toBeVisible();
  } finally {
    for (const ctx of contexts) await ctx.close();
    // Nettoyage : les specs suivantes doivent retrouver les seuls packs builtin.
    await request.delete(`/api/admin/packs/${PACK.id}`, { headers: auth });
  }
});
