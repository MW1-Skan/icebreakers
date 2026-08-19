/**
 * Tests de l'administration des packs (PRD §4.3) : authentification par
 * jeton, upload validé avec rapport lisible, activation/désactivation
 * persistée, suppression des seuls packs à chaud, templates valides.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validatePack } from '../shared';
import type { GameId } from '../shared';
import type { AppConfigService } from '../config/app-config.service';
import { NoopTeamHistoryStore } from '../packs/team-history';
import { PacksService } from '../packs/packs.service';
import { AdminAuthService } from './admin-auth.service';

let tmpDir: string;

function makeService(): PacksService {
  const stub = {
    builtinPacksDir: path.join(tmpDir, 'builtin'),
    dataPacksDir: path.join(tmpDir, 'data', 'packs'),
  } as unknown as AppConfigService;
  const service = new PacksService(stub, new NoopTeamHistoryStore());
  service.loadAll();
  return service;
}

function validPack(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: 1,
    id,
    game: 'justone',
    name: 'Pack de test',
    mode: 'interne',
    lang: 'fr',
    entries: [{ word: 'Cascade' }, { word: 'Tempête' }],
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-test-'));
  fs.mkdirSync(path.join(tmpDir, 'builtin'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, 'builtin', 'builtin-pack.json'),
    JSON.stringify(validPack('builtin-pack', { mode: 'normal' })),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('AdminAuthService', () => {
  it('bon mot de passe → jeton vérifiable ; mauvais → refus', () => {
    const auth = new AdminAuthService({ config: { adminPassword: 'secret' } } as AppConfigService);
    expect(auth.login('mauvais')).toBeNull();
    const token = auth.login('secret');
    expect(token).toBeTruthy();
    expect(auth.verify(token!)).toBe(true);
    expect(auth.verify('jeton-bidon')).toBe(false);
    expect(auth.verify(undefined)).toBe(false);
  });

  it('la variable d’environnement ADMIN_PASSWORD prime sur config.json', () => {
    process.env.ADMIN_PASSWORD = 'env-secret';
    try {
      const auth = new AdminAuthService({ config: { adminPassword: 'config-secret' } } as AppConfigService);
      expect(auth.login('config-secret')).toBeNull();
      expect(auth.login('env-secret')).toBeTruthy();
    } finally {
      delete process.env.ADMIN_PASSWORD;
    }
  });
});

describe('PacksService — administration', () => {
  it('upload valide → écrit dans data/packs/, chargé et jouable immédiatement', () => {
    const service = makeService();
    const result = service.uploadPack(validPack('interne-team-01'));
    expect(result).toMatchObject({ ok: true, packId: 'interne-team-01', entriesCount: 2, replaced: false });
    expect(fs.existsSync(path.join(tmpDir, 'data', 'packs', 'interne-team-01.json'))).toBe(true);
    expect(service.packsPublicFor('justone').map((p) => p.id)).toEqual(['builtin-pack', 'interne-team-01']);
    expect(service.adminList().find((p) => p.id === 'interne-team-01')).toMatchObject({
      source: 'data',
      enabled: true,
    });
  });

  it('upload invalide → rapport d’erreurs lisible, rien n’est écrit', () => {
    const service = makeService();
    const result = service.uploadPack(validPack('bad-pack', { entries: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('vide');
    expect(fs.existsSync(path.join(tmpDir, 'data', 'packs', 'bad-pack.json'))).toBe(false);
  });

  it('ré-uploader le même id remplace le pack à chaud ; un id builtin est protégé', () => {
    const service = makeService();
    service.uploadPack(validPack('interne-team-01'));
    const replaced = service.uploadPack(
      validPack('interne-team-01', { entries: [{ word: 'Nouveau' }] }),
    );
    expect(replaced).toMatchObject({ ok: true, replaced: true, entriesCount: 1 });

    const collision = service.uploadPack(validPack('builtin-pack'));
    expect(collision.ok).toBe(false);
    if (!collision.ok) expect(collision.errors.join(' ')).toContain('intégré au code');
  });

  it('désactiver un pack le retire des tirages et survit au redémarrage', () => {
    const service = makeService();
    expect(service.setEnabled('builtin-pack', false)).toEqual({ ok: true });
    expect(service.packsPublicFor('justone')).toEqual([]);

    // « redémarrage » : une nouvelle instance relit la liste persistée
    const restarted = makeService();
    expect(restarted.adminList().find((p) => p.id === 'builtin-pack')?.enabled).toBe(false);
    expect(restarted.packsPublicFor('justone')).toEqual([]);

    expect(restarted.setEnabled('builtin-pack', true)).toEqual({ ok: true });
    expect(restarted.packsPublicFor('justone').map((p) => p.id)).toEqual(['builtin-pack']);
  });

  it('supprimer : packs à chaud uniquement (un builtin se désactive)', () => {
    const service = makeService();
    service.uploadPack(validPack('interne-team-01'));
    expect(service.deletePack('interne-team-01')).toEqual({ ok: true });
    expect(service.adminList().some((p) => p.id === 'interne-team-01')).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'data', 'packs', 'interne-team-01.json'))).toBe(false);

    const builtin = service.deletePack('builtin-pack');
    expect(builtin.ok).toBe(false);
    if (!builtin.ok) expect(builtin.error).toContain('désactive');
  });

  it('les templates des sept jeux sont des packs valides', () => {
    const service = makeService();
    const games: GameId[] = ['undercover', 'wavelength', 'justone', 'spyfall', 'ito', 'taboo', 'codenames'];
    for (const game of games) {
      const template = service.templateFor(game);
      const result = validatePack(template);
      expect(result.ok, `template ${game} invalide : ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it('getPack : contenu complet (builtin compris, pour la duplication) ; inconnu → undefined', () => {
    const service = makeService();
    service.uploadPack(validPack('interne-team-01'));

    const hot = service.getPack('interne-team-01');
    expect(hot).toMatchObject({ source: 'data', enabled: true });
    expect(hot?.pack.entries).toEqual([{ word: 'Cascade' }, { word: 'Tempête' }]);

    const builtin = service.getPack('builtin-pack');
    expect(builtin).toMatchObject({ source: 'builtin', enabled: true });
    expect(builtin?.pack.name).toBe('Pack de test');

    expect(service.getPack('fantome')).toBeUndefined();
  });
});
