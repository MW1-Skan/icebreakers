/**
 * Garde-fou de démarrage en production (PRD §7.4, étape 8) : derrière une URL
 * publique, une page /admin au mot de passe par défaut serait ouverte à tous —
 * le serveur refuse donc de démarrer plutôt que de tourner mal protégé.
 */

export const DEFAULT_ADMIN_PASSWORD = 'change-me';

/** ADMIN_PASSWORD (env) prime sur `adminPassword` de config.json (PRD §4.3). */
export function effectiveAdminPassword(
  env: { ADMIN_PASSWORD?: string },
  config: { adminPassword: string },
): string {
  return env.ADMIN_PASSWORD ?? config.adminPassword;
}

export function assertProdAdminPassword(nodeEnv: string | undefined, password: string): void {
  if (nodeEnv !== 'production') return;
  const trimmed = password.trim();
  if (trimmed !== '' && trimmed !== DEFAULT_ADMIN_PASSWORD) return;
  const cause =
    trimmed === '' ? 'vide' : `celui par défaut (« ${DEFAULT_ADMIN_PASSWORD} »)`;
  throw new Error(
    `Démarrage refusé : NODE_ENV=production et le mot de passe admin est ${cause}. ` +
      `Définis ADMIN_PASSWORD (variable d'environnement, ou .env — cf. .env.example) ` +
      `ou « adminPassword » dans config.json, puis relance.`,
  );
}
