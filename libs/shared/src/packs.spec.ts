import { describe, expect, it } from 'vitest';
import { validatePack } from './packs';

function basePack(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: 1,
    id: 'undercover-normal-test',
    game: 'undercover',
    name: 'Pack de test',
    mode: 'normal',
    lang: 'fr',
    author: 'Tests',
    entries: [
      { a: 'Croissant', b: 'Pain au chocolat', difficulty: 1 },
      { a: 'Thé', b: 'Café' },
    ],
    ...overrides,
  };
}

describe('validatePack — cas valides', () => {
  it('accepte un pack undercover conforme', () => {
    const result = validatePack(basePack());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.game).toBe('undercover');
      expect(result.pack.entries).toHaveLength(2);
    }
  });

  it('accepte les cinq autres jeux (Annexe A)', () => {
    const cases: Array<Record<string, unknown>> = [
      { game: 'wavelength', entries: [{ left: 'Chaud', right: 'Froid' }] },
      { game: 'justone', entries: [{ word: 'Fusée', difficulty: 1 }] },
      {
        game: 'spyfall',
        entries: [
          {
            category: 'Lieux',
            items: ['La plage', 'Le casino', 'La station', 'Le sous-marin', 'Le supermarché', "L'école", 'Le théâtre', "L'avion"],
          },
        ],
      },
      { game: 'ito', entries: [{ theme: 'Aliments délicieux' }] },
      { game: 'taboo', entries: [{ word: 'Pizza', forbidden: ['fromage', 'Italie', 'four'] }] },
    ];
    for (const c of cases) {
      const result = validatePack(basePack({ id: `${c.game as string}-test`, ...c }));
      expect(result.ok, `pack ${c.game as string} devrait être valide : ${JSON.stringify(result)}`).toBe(true);
    }
  });
});

describe('validatePack — rejets lisibles', () => {
  it('rejette un non-objet sans crasher', () => {
    for (const junk of [null, 42, 'pack', [], undefined]) {
      const result = validatePack(junk);
      expect(result.ok).toBe(false);
    }
  });

  it('signale un champ d’enveloppe manquant', () => {
    const { name: _omitted, ...rest } = basePack();
    const result = validatePack(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('name');
  });

  it('rejette un jeu inconnu avec un message explicite', () => {
    const result = validatePack(basePack({ game: 'poker' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('game');
  });

  it('rejette un mode non générique', () => {
    const result = validatePack(basePack({ mode: 'special' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('mode');
  });

  it('rejette un pack sans entrée', () => {
    const result = validatePack(basePack({ entries: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('vide');
  });

  it('rejette a = b (après normalisation)', () => {
    const result = validatePack(basePack({ entries: [{ a: 'Café', b: 'cafe' }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('différents');
  });

  it('rejette les paires en doublon, même inversées et accentuées', () => {
    const result = validatePack(
      basePack({
        entries: [
          { a: 'Thé', b: 'Café' },
          { a: 'cafe', b: 'the' },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('doublon');
  });

  it('rejette un champ texte trop long avec le chemin de l’entrée fautive', () => {
    const result = validatePack(basePack({ entries: [{ a: 'x'.repeat(81), b: 'Café' }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = result.errors.join('\n');
      expect(text).toContain('entries[0]');
      expect(text).toContain('80');
    }
  });

  it('rejette une difficulty hors {1,2,3}', () => {
    const result = validatePack(basePack({ entries: [{ a: 'Thé', b: 'Café', difficulty: 5 }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('difficulty');
  });

  it('taboo : impose exactement 3 interdits, distincts et ≠ du mot', () => {
    const wrongCount = validatePack(
      basePack({ game: 'taboo', id: 'taboo-t', entries: [{ word: 'Pizza', forbidden: ['fromage', 'Italie'] }] }),
    );
    expect(wrongCount.ok).toBe(false);
    if (!wrongCount.ok) expect(wrongCount.errors.join('\n')).toContain('3');

    const dupForbidden = validatePack(
      basePack({ game: 'taboo', id: 'taboo-t', entries: [{ word: 'Pizza', forbidden: ['four', 'Four', 'Italie'] }] }),
    );
    expect(dupForbidden.ok).toBe(false);

    const clash = validatePack(
      basePack({ game: 'taboo', id: 'taboo-t', entries: [{ word: 'Pizza', forbidden: ['pizza', 'Italie', 'four'] }] }),
    );
    expect(clash.ok).toBe(false);
  });

  it('spyfall : impose au moins 8 items par thème', () => {
    const result = validatePack(
      basePack({ game: 'spyfall', id: 'spyfall-t', entries: [{ category: 'Lieux', items: ['La plage', 'Le casino'] }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('8');
  });

  it('rejette un formatVersion inconnu', () => {
    const result = validatePack(basePack({ formatVersion: 2 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('formatVersion');
  });
});

describe('validatePack — Juste Prix (A.9)', () => {
  const article = (overrides: Record<string, unknown> = {}) => ({
    name: 'Gamelle pour chien',
    details: '22 × 11 × 22 cm',
    price: 1800,
    image: 'https://cdn.exemple.fr/gamelle.jpg',
    source: 'https://www.exemple.fr/gamelle',
    seenAt: '2026-10',
    ...overrides,
  });
  const jpPack = (entries: unknown[]) => basePack({ game: 'justeprix', id: 'justeprix-t', entries });
  const errorsOf = (entries: unknown[]): string => {
    const result = validatePack(jpPack(entries));
    expect(result.ok, `aurait dû être refusé : ${JSON.stringify(entries)}`).toBe(false);
    return result.ok ? '' : result.errors.join('\n');
  };

  it('accepte un article complet, et un article réduit au minimum', () => {
    const result = validatePack(
      jpPack([article(), { name: 'Stylo', price: 24, image: 'https://cdn.exemple.fr/stylo.jpg' }]),
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it('accepte les centimes et la date du relevé au jour près', () => {
    const result = validatePack(jpPack([article({ price: 19.9, seenAt: '2026-10-22' })]));
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it('impose une image en https (contenu mixte et schémas exotiques refusés)', () => {
    expect(errorsOf([article({ image: 'http://cdn.exemple.fr/gamelle.jpg' })])).toContain('https');
    expect(errorsOf([article({ image: 'javascript:alert(1)' })])).toContain('https');
    expect(errorsOf([article({ image: 'data:image/png;base64,AAAA' })])).toContain('https');
    expect(errorsOf([article({ image: undefined })])).toContain('image');
  });

  it('refuse un prix nul, négatif, absurde ou à plus de 2 décimales', () => {
    expect(errorsOf([article({ price: 0 })])).toContain('price');
    expect(errorsOf([article({ price: -5 })])).toContain('price');
    expect(errorsOf([article({ price: 2_000_000_000 })])).toContain('price');
    expect(errorsOf([article({ price: 12.345 })])).toContain('2 décimales');
    expect(errorsOf([article({ price: '1800' })])).toContain('price');
  });

  it('refuse une source qui n’est pas une URL http(s) et une date mal formée', () => {
    expect(errorsOf([article({ source: 'ftp://exemple.fr/x' })])).toContain('source');
    expect(errorsOf([article({ seenAt: 'octobre 2026' })])).toContain('seenAt');
    expect(errorsOf([article({ seenAt: '2026-13' })])).toContain('seenAt');
  });

  it('refuse les doublons de nom (normalisé) et d’image', () => {
    expect(
      errorsOf([article(), article({ name: 'gamelle POUR chien', image: 'https://cdn.exemple.fr/autre.jpg' })]),
    ).toContain('doublon');
    expect(errorsOf([article(), article({ name: 'Autre article' })])).toContain('même image');
  });
});
