import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mulberry32 } from '../shared';
import type { AppConfigService } from '../config/app-config.service';
import { NoopTeamHistoryStore } from './team-history';
import { PacksService } from './packs.service';

let tmpDir: string;

function writePack(dir: string, file: string, content: unknown): void {
  fs.writeFileSync(path.join(dir, file), typeof content === 'string' ? content : JSON.stringify(content));
}

function makeService(): PacksService {
  const stub = {
    builtinPacksDir: path.join(tmpDir, 'builtin'),
    dataPacksDir: path.join(tmpDir, 'data'),
  } as unknown as AppConfigService;
  const service = new PacksService(stub, new NoopTeamHistoryStore());
  service.loadAll();
  return service;
}

function validPack(id: string, mode: 'interne' | 'normal', entries: Array<{ a: string; b: string }>) {
  return { formatVersion: 1, id, game: 'undercover', name: id, mode, lang: 'fr', entries };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-test-'));
  fs.mkdirSync(path.join(tmpDir, 'builtin'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'data'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('PacksService — chargement', () => {
  it('charge les packs valides depuis packs/builtin ET data/packs', () => {
    writePack(path.join(tmpDir, 'builtin'), 'a.json', validPack('normal-a', 'normal', [{ a: 'Thé', b: 'Café' }]));
    writePack(path.join(tmpDir, 'data'), 'b.json', validPack('interne-b', 'interne', [{ a: 'X', b: 'Y' }]));
    const service = makeService();
    expect(service.packsFor('undercover')).toHaveLength(2);
    expect(service.packsPublicFor('undercover')).toEqual([
      { id: 'normal-a', name: 'normal-a', mode: 'normal', entriesCount: 1 },
      { id: 'interne-b', name: 'interne-b', mode: 'interne', entriesCount: 1 },
    ]);
  });

  it('rejette un JSON illisible avec une erreur lisible, sans crash', () => {
    writePack(path.join(tmpDir, 'builtin'), 'broken.json', '{ pas du json');
    writePack(path.join(tmpDir, 'builtin'), 'ok.json', validPack('ok', 'normal', [{ a: 'A', b: 'B' }]));
    const service = makeService();
    expect(service.packsFor('undercover')).toHaveLength(1);
    const report = service.loadReport.find((r) => r.file === 'broken.json');
    expect(report?.ok).toBe(false);
    expect(report?.errors[0]).toContain('JSON invalide');
  });

  it('rejette un pack invalide (schéma) avec le détail, et garde les autres', () => {
    writePack(path.join(tmpDir, 'builtin'), 'bad.json', {
      formatVersion: 1,
      id: 'bad-pack',
      game: 'undercover',
      name: 'Bad',
      mode: 'normal',
      lang: 'fr',
      entries: [{ a: 'Café', b: 'café' }],
    });
    writePack(path.join(tmpDir, 'builtin'), 'ok.json', validPack('ok', 'normal', [{ a: 'A', b: 'B' }]));
    const service = makeService();
    expect(service.packsFor('undercover')).toHaveLength(1);
    const report = service.loadReport.find((r) => r.file === 'bad.json');
    expect(report?.ok).toBe(false);
    expect(report?.errors.join(' ')).toContain('différents');
  });

  it('rejette un id de pack en doublon', () => {
    writePack(path.join(tmpDir, 'builtin'), 'a.json', validPack('same-id', 'normal', [{ a: 'A', b: 'B' }]));
    writePack(path.join(tmpDir, 'data'), 'b.json', validPack('same-id', 'normal', [{ a: 'C', b: 'D' }]));
    const service = makeService();
    expect(service.packsFor('undercover')).toHaveLength(1);
    expect(service.loadReport.some((r) => !r.ok && r.errors.join(' ').includes('doublon'))).toBe(true);
  });
});

describe('PacksService — resolvePackIds (validation de la sélection)', () => {
  it('undefined → tous les packs actifs du jeu ; liste explicite filtrée en silence', () => {
    writePack(path.join(tmpDir, 'builtin'), 'a.json', validPack('pack-a', 'normal', [{ a: 'A', b: 'B' }]));
    writePack(path.join(tmpDir, 'builtin'), 'b.json', validPack('pack-b', 'interne', [{ a: 'C', b: 'D' }]));
    const service = makeService();
    expect(service.resolvePackIds('undercover')).toEqual(['pack-a', 'pack-b']);
    // ids inconnus ou d'un autre jeu : retirés sans erreur
    expect(service.resolvePackIds('undercover', ['pack-b', 'fantome'])).toEqual(['pack-b']);
    expect(service.resolvePackIds('justone', ['pack-a'])).toEqual([]);
  });

  it('un pack désactivé sort de la résolution (défaut comme liste explicite)', () => {
    writePack(path.join(tmpDir, 'builtin'), 'a.json', validPack('pack-a', 'normal', [{ a: 'A', b: 'B' }]));
    writePack(path.join(tmpDir, 'builtin'), 'b.json', validPack('pack-b', 'normal', [{ a: 'C', b: 'D' }]));
    const service = makeService();
    service.setEnabled('pack-a', false);
    expect(service.resolvePackIds('undercover')).toEqual(['pack-b']);
    expect(service.resolvePackIds('undercover', ['pack-a', 'pack-b'])).toEqual(['pack-b']);
  });
});

describe('PacksService — tirage et anti-répétition intra-salon', () => {
  it('ne retire jamais un élément déjà tiré dans le salon', () => {
    writePack(
      path.join(tmpDir, 'builtin'),
      'a.json',
      validPack('p', 'normal', [
        { a: 'A1', b: 'B1' },
        { a: 'A2', b: 'B2' },
        { a: 'A3', b: 'B3' },
      ]),
    );
    const service = makeService();
    const used = new Set<string>();
    const rng = mulberry32(5);
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const drawn = service.drawUndercoverEntry(['p'], used, rng);
      expect('error' in drawn).toBe(false);
      if (!('error' in drawn)) {
        expect(drawn.recycled).toBe(false);
        expect(seen.has(drawn.elementId)).toBe(false);
        seen.add(drawn.elementId);
      }
    }
  });

  it('cas limite fiche : pack épuisé → re-mélange signalé (« contenu recyclé »)', () => {
    writePack(path.join(tmpDir, 'builtin'), 'a.json', validPack('p', 'normal', [{ a: 'A1', b: 'B1' }]));
    const service = makeService();
    const used = new Set<string>();
    const rng = mulberry32(5);
    const first = service.drawUndercoverEntry(['p'], used, rng);
    expect(!('error' in first) && first.recycled).toBe(false);
    const second = service.drawUndercoverEntry(['p'], used, rng);
    expect(!('error' in second) && second.recycled).toBe(true);
  });

  it('aucun pack sélectionné → NO_CONTENT (pas de crash)', () => {
    writePack(path.join(tmpDir, 'builtin'), 'a.json', validPack('p', 'normal', [{ a: 'A', b: 'B' }]));
    const service = makeService();
    const drawn = service.drawUndercoverEntry([], new Set(), mulberry32(1));
    expect(drawn).toEqual({ error: 'NO_CONTENT' });
  });

  it('le pool = union des packs cochés — un pack décoché ne sort jamais', () => {
    writePack(path.join(tmpDir, 'builtin'), 'n.json', validPack('n', 'normal', [{ a: 'NA', b: 'NB' }]));
    writePack(path.join(tmpDir, 'data'), 'i.json', validPack('i', 'interne', [{ a: 'IA', b: 'IB' }]));
    const service = makeService();
    const origins = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const both = service.drawUndercoverEntry(['n', 'i'], new Set(), mulberry32(seed));
      if (!('error' in both)) origins.add(both.elementId.split('#')[0]);
      const only = service.drawUndercoverEntry(['i'], new Set(), mulberry32(seed));
      expect(!('error' in only) && only.elementId.startsWith('i#')).toBe(true);
    }
    expect(origins).toEqual(new Set(['n', 'i']));
  });

  it('tirage uniforme PAR ENTRÉE : un petit pack n’est pas surreprésenté', () => {
    // pack-petit : 1 entrée ; pack-grand : 9 entrées → part attendue ≈ 10 %.
    writePack(path.join(tmpDir, 'builtin'), 'small.json', validPack('petit', 'interne', [{ a: 'S1', b: 'S2' }]));
    writePack(
      path.join(tmpDir, 'builtin'),
      'big.json',
      validPack(
        'grand',
        'normal',
        Array.from({ length: 9 }, (_, i) => ({ a: `G${i}a`, b: `G${i}b` })),
      ),
    );
    const service = makeService();
    let fromSmall = 0;
    const draws = 400;
    for (let seed = 0; seed < draws; seed++) {
      const drawn = service.drawUndercoverEntry(['petit', 'grand'], new Set(), mulberry32(seed));
      if (!('error' in drawn) && drawn.elementId.startsWith('petit#')) fromSmall++;
    }
    // « un pack au hasard puis une entrée » donnerait ~50 % ; l'uniforme ~10 %.
    expect(fromSmall / draws).toBeGreaterThan(0.03);
    expect(fromSmall / draws).toBeLessThan(0.25);
  });
});

describe('PacksService — unions par jeu', () => {
  it('Spyfall : les thèmes de même nom fusionnent entre packs cochés (et seulement eux)', () => {
    const spyfallPack = (id: string, mode: 'interne' | 'normal', items: string[]) => ({
      formatVersion: 1,
      id,
      game: 'spyfall',
      name: id,
      mode,
      lang: 'fr',
      entries: [{ category: 'Lieux', items }],
    });
    writePack(
      path.join(tmpDir, 'builtin'),
      'a.json',
      spyfallPack('sf-a', 'normal', ['Plage', 'Musée', 'Cinéma', 'Stade', 'Gare', 'Port', 'Zoo', 'Parc']),
    );
    writePack(
      path.join(tmpDir, 'data'),
      'b.json',
      spyfallPack('sf-b', 'interne', ['Plage', 'Phare', 'Moulin', 'Chalet', 'Igloo', 'Serre', 'Silo', 'Quai']),
    );
    const service = makeService();
    const union = service.spyfallGridFor('Lieux', ['sf-a', 'sf-b']);
    expect(union).toHaveLength(15); // « Plage » dédupliqué
    expect(union).toContain('Phare');
    const seul = service.spyfallGridFor('Lieux', ['sf-a']);
    expect(seul).toHaveLength(8);
    expect(seul).not.toContain('Phare');
  });

  it('Codenames : mots distincts comptés sur l’union, grille NO_CONTENT en dessous', () => {
    const cnPack = (id: string, words: string[]) => ({
      formatVersion: 1,
      id,
      game: 'codenames',
      name: id,
      mode: 'normal',
      lang: 'fr',
      entries: words.map((word) => ({ word })),
    });
    writePack(path.join(tmpDir, 'builtin'), 'a.json', cnPack('cn-a', ['Lune', 'Mer', 'Pont']));
    writePack(path.join(tmpDir, 'data'), 'b.json', cnPack('cn-b', ['Lune', 'Roc']));
    const service = makeService();
    expect(service.codenamesDistinctWordCount(['cn-a', 'cn-b'])).toBe(4); // « Lune » une seule fois
    expect(service.codenamesDistinctWordCount(['cn-b'])).toBe(2);
    const grid = service.drawCodenamesGrid(4, ['cn-a', 'cn-b'], new Set(), mulberry32(3));
    expect(!('error' in grid) && grid.words.length).toBe(4);
    expect(service.drawCodenamesGrid(5, ['cn-a', 'cn-b'], new Set(), mulberry32(3))).toEqual({
      error: 'NO_CONTENT',
    });
  });
});
