/**
 * Pont vers la lib partagée. Le serveur importe TOUJOURS `libs/shared` via ce
 * fichier (import relatif) : le build tsc conserve ainsi des chemins résolubles
 * par Node au runtime, sans magie d'alias (cf. DECISIONS.md).
 */
export * from '../../../libs/shared/src';
