import { describe, expect, it } from 'vitest';
import {
  assertProdAdminPassword,
  DEFAULT_ADMIN_PASSWORD,
  effectiveAdminPassword,
} from './boot-guard';

describe('effectiveAdminPassword', () => {
  const config = { adminPassword: 'depuis-config' };

  it('prend ADMIN_PASSWORD (env) en priorité', () => {
    expect(effectiveAdminPassword({ ADMIN_PASSWORD: 'depuis-env' }, config)).toBe('depuis-env');
  });

  it("retombe sur config.json quand l'env est absent", () => {
    expect(effectiveAdminPassword({}, config)).toBe('depuis-config');
  });
});

describe('assertProdAdminPassword (garde-fou étape 8)', () => {
  it('refuse le démarrage prod avec le mot de passe par défaut', () => {
    expect(() => assertProdAdminPassword('production', DEFAULT_ADMIN_PASSWORD)).toThrow(
      /change-me/,
    );
  });

  it('refuse aussi un mot de passe vide ou blanc en prod', () => {
    expect(() => assertProdAdminPassword('production', '')).toThrow(/vide/);
    expect(() => assertProdAdminPassword('production', '   ')).toThrow(/vide/);
  });

  it('accepte un vrai mot de passe en prod', () => {
    expect(() => assertProdAdminPassword('production', 'un-vrai-secret')).not.toThrow();
  });

  it('laisse le dev et les tests tranquilles (défaut toléré hors prod)', () => {
    expect(() => assertProdAdminPassword(undefined, DEFAULT_ADMIN_PASSWORD)).not.toThrow();
    expect(() => assertProdAdminPassword('development', DEFAULT_ADMIN_PASSWORD)).not.toThrow();
    expect(() => assertProdAdminPassword('test', '')).not.toThrow();
  });
});
