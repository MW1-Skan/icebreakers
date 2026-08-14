/** Types de domaine transverses (PRD §6.5). */

export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  avatar: string; // emoji
  connected: boolean;
  joinedAt: number;
  /** Epoch ms de la dernière déconnexion (sablier TV + seuil des 60 s, §3.4). */
  disconnectedAt?: number;
}

/**
 * `recap` = écran de fin affiché (le jeu vient de se terminer, révélation à l'écran).
 * Le retour au lobby est déclenché par l'animateur.
 */
export type RoomStatus = 'lobby' | 'inGame' | 'recap';

export type GameId = 'undercover' | 'wavelength' | 'justone' | 'spyfall' | 'ito' | 'taboo';

/** Étiquette de mode d'un pack — volontairement générique (PRD §4.5). */
export type PackMode = 'interne' | 'normal';

/** Mode de contenu choisi au lancement d'une partie (PRD §3.5). */
export type ContentMode = 'interne' | 'normal' | 'random';

/** Une ligne du récap de soirée (un jeu joué, PRD §3.1). */
export interface GameResult {
  game: GameId;
  endedAt: number;
  /** Résumé public, ex. « Victoire des civils ». */
  summary: string;
  /** Points suggérés par joueur (barème de la fiche jeu). */
  points: Array<{ playerId: PlayerId; name: string; avatar: string; points: number }>;
}

/** Audiences de projection (PRD §6.3). `host` = écran projeté sur la TV. */
export type Viewer =
  | { kind: 'host' }
  | { kind: 'mirror' }
  | { kind: 'player'; playerId: PlayerId };

export type ViewerKind = Viewer['kind'];
