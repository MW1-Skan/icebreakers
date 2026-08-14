import { describe, expect, it } from 'vitest';
import { fuzzyEquals, levenshtein, normalizeText } from './text';

describe('normalizeText', () => {
  it('passe en minuscules, retire les accents et réduit les espaces', () => {
    expect(normalizeText('  Téléconsultation ')).toBe('teleconsultation');
    expect(normalizeText('Pain  au   chocolat')).toBe('pain au chocolat');
    expect(normalizeText('ÉLÈVE')).toBe('eleve');
    expect(normalizeText('Pégase')).toBe('pegase');
  });
});

describe('levenshtein', () => {
  it('cas de base', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', 'ab')).toBe(2);
    expect(levenshtein('chat', 'chats')).toBe(1);
    expect(levenshtein('croissant', 'croisant')).toBe(1);
    expect(levenshtein('kebab', 'burger')).toBe(6);
  });
});

describe('fuzzyEquals — règle du guess de Mr. White (fiche 5.1 étape 7)', () => {
  it('mot exact accepté, insensible aux accents et à la casse', () => {
    expect(fuzzyEquals('Café', 'café')).toBe(true);
    expect(fuzzyEquals('  cafe ', 'Café')).toBe(true);
  });

  it('cible normalisée ≤ 5 caractères : tolérance 1', () => {
    // « café » → normalisé « cafe » (4 caractères)
    expect(fuzzyEquals('caf', 'café')).toBe(true); // distance 1
    expect(fuzzyEquals('kafé', 'café')).toBe(true); // distance 1
    expect(fuzzyEquals('kaf', 'café')).toBe(false); // distance 2 → refusé
  });

  it('cible normalisée > 5 caractères : tolérance 2', () => {
    expect(fuzzyEquals('croisant', 'croissant')).toBe(true); // 1
    expect(fuzzyEquals('croizant', 'croissant')).toBe(true); // 2
    expect(fuzzyEquals('krouazan', 'croissant')).toBe(false); // > 2
  });

  it('les synonymes ne pardonnent pas', () => {
    expect(fuzzyEquals('expresso', 'café')).toBe(false);
    expect(fuzzyEquals('viennoiserie', 'croissant')).toBe(false);
  });
});
