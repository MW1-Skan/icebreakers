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
