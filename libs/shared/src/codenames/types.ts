/**
 * Codenames — état serveur de la machine (fiche validée en session) : deux
 * équipes (0 = Rouge, 1 = Bleu), une grille de mots dont la couleur est
 * secrète, un maître-espion par équipe qui donne des indices « mot + nombre ».
 *
 * ⚠️ `kind` des cartes NON révélées et la clé complète : réservés aux deux
 * maîtres-espions (ils partagent la même clé, comme dans le jeu physique).
 * Tout le reste (indices donnés, révélations, compteurs) est public.
 */
import type { PlayerId } from '../types';

export type CodenamesPhase = 'brief' | 'clue' | 'guess' | 'end';

/** 0 = Rouge, 1 = Bleu. */
export type CodenamesTeam = 0 | 1;

export type CodenamesCardKind = 'red' | 'blue' | 'neutral' | 'assassin';

export type CodenamesGridSize = 16 | 20 | 25;

export interface CodenamesParams {
  gridSize: CodenamesGridSize; // 25 par défaut (9/8/7/1)
  manchesCount: number; // 1–3, maîtres-espions tournants
  /** Chrono de l'indice — 0 = désactivé (timeout = tour passé). */
  clueSeconds: number;
  /** Chrono des devinettes — 0 = désactivé (timeout = fin de tour). */
  guessSeconds: number;
  /** Équipes imposées par l'animateur : [rouges, bleus] (sinon aléatoires). */
  teams?: [PlayerId[], PlayerId[]];
  /** Maîtres-espions imposés : [rouge, bleu] (sinon aléatoires). */
  spymasters?: [PlayerId, PlayerId];
}

export interface CodenamesCard {
  word: string;
  /** 🔒 Secret tant que `revealed` est faux (clé des maîtres-espions). */
  kind: CodenamesCardKind;
  revealed: boolean;
}

export interface CodenamesGuess {
  cardIndex: number;
  kind: CodenamesCardKind;
  playerId: PlayerId;
}

/** Un indice donné + ses devinettes — public dès l'envoi (récap de fin). */
export interface CodenamesClue {
  team: CodenamesTeam;
  spymasterId: PlayerId;
  word: string;
  count: number;
  guesses: CodenamesGuess[];
  stopped: boolean;
}

export interface CodenamesMancheResult {
  winner: CodenamesTeam;
  byAssassin: boolean;
  /** Équipe qui a touché l'assassin (défaite immédiate). */
  assassinTeam?: CodenamesTeam;
  startingTeam: CodenamesTeam;
  /** Mots révélés par équipe à la fin (score affiché « 9–6 »). */
  revealedWords: [number, number];
  cluesCount: number;
}

export interface CodenamesState {
  kind: 'codenames';
  phase: CodenamesPhase;
  params: CodenamesParams;
  playerIds: PlayerId[];
  /** [rouges, bleus] — maître-espion INCLUS dans son équipe. */
  teams: [PlayerId[], PlayerId[]];
  spymasters: [PlayerId, PlayerId];
  mancheIndex: number; // 1-based
  startingTeam: CodenamesTeam;
  /** 🔒 La grille — `kind` secret tant que non révélé. */
  cards: CodenamesCard[];
  activeTeam: CodenamesTeam;
  /** Pendant `guess` : l'indice en cours et les touches restantes. */
  currentClue?: { spymasterId: PlayerId; word: string; count: number; guessesLeft: number };
  /** Historique des indices (le courant en dernier) — public. */
  clues: CodenamesClue[];
  /** Maîtres-espions ayant consulté la clé (badges ✓ du brief). */
  seenKeyIds: PlayerId[];
  winner?: CodenamesTeam;
  endedByAssassin: boolean;
  /** Équipe fautive si défaite par assassin. */
  assassinTeam?: CodenamesTeam;
  /** Manches terminées (série) — la courante n'y figure pas. */
  history: CodenamesMancheResult[];
  /** Points cumulés des manches PRÉCÉDENTES (3 / 1 / 0-si-assassin). */
  carriedPoints: Record<PlayerId, number>;
  /** Gel : maître-espion actif (indice) ou tous les devineurs actifs (devinettes) déconnectés. */
  frozen: boolean;
}

export type CodenamesTimerId = 'clue' | 'guess';

export type CodenamesAction =
  | { type: 'SEEN_KEY'; playerId: PlayerId }
  | { type: 'GIVE_CLUE'; playerId: PlayerId; word: string; count: number }
  | { type: 'REVEAL'; playerId: PlayerId; cardIndex: number }
  | { type: 'STOP_GUESSING'; playerId: PlayerId }
  | { type: 'HOST_NEXT' }
  | { type: 'HOST_INVALIDATE_CLUE' }
  | { type: 'HOST_TRANSFER_SPYMASTER'; playerId: PlayerId }
  | { type: 'TIMEOUT'; timerId: CodenamesTimerId }
  | { type: 'PLAYER_GONE' }
  | { type: 'PLAYER_BACK' };

export const CODENAMES_MIN_PLAYERS = 4;
export const CODENAMES_MAX_PLAYERS = 10;
export const CODENAMES_TEAM_LABELS: [string, string] = ['Rouge', 'Bleu'];

/** Répartition [équipe qui commence, autre équipe, neutres, assassin]. */
export const CODENAMES_DISTRIBUTIONS: Record<CodenamesGridSize, [number, number, number, number]> = {
  25: [9, 8, 7, 1],
  20: [7, 6, 6, 1],
  16: [6, 5, 4, 1],
};
