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
    expect(service.availableModesFor('undercover')).toEqual(['interne', 'normal', 'random']);
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

  it('modes indisponibles masqués : seul normal chargé → pas d’interne ni random', () => {
    writePack(path.join(tmpDir, 'builtin'), 'a.json', validPack('n', 'normal', [{ a: 'A', b: 'B' }]));
    const service = makeService();
    expect(service.availableModesFor('undercover')).toEqual(['normal']);
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
      const drawn = service.drawUndercoverEntry('normal', used, rng, 0.5);
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
    const first = service.drawUndercoverEntry('normal', used, rng, 0.5);
    expect(!('error' in first) && first.recycled).toBe(false);
    const second = service.drawUndercoverEntry('normal', used, rng, 0.5);
    expect(!('error' in second) && second.recycled).toBe(true);
  });

  it('mode sans pack → NO_CONTENT (pas de crash)', () => {
    writePack(path.join(tmpDir, 'builtin'), 'a.json', validPack('p', 'normal', [{ a: 'A', b: 'B' }]));
    const service = makeService();
    const drawn = service.drawUndercoverEntry('interne', new Set(), mulberry32(1), 0.5);
    expect(drawn).toEqual({ error: 'NO_CONTENT' });
  });

  it('mode random : tire dans l’union interne + normal', () => {
    writePack(path.join(tmpDir, 'builtin'), 'n.json', validPack('n', 'normal', [{ a: 'NA', b: 'NB' }]));
    writePack(path.join(tmpDir, 'data'), 'i.json', validPack('i', 'interne', [{ a: 'IA', b: 'IB' }]));
    const service = makeService();
    const origins = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const drawn = service.drawUndercoverEntry('random', new Set(), mulberry32(seed), 0.5);
      if (!('error' in drawn)) origins.add(drawn.elementId.split('#')[0]);
    }
    expect(origins).toEqual(new Set(['n', 'i']));
  });
});
