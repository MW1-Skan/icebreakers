/**
 * Undercover — état serveur de la machine (fiche 5.1 + PRD §6.5).
 *
 * ⚠️ `pair`, `civilianWord`, `roles`, `votes` : JAMAIS dans une projection non autorisée.
 * L'état complet ne sort jamais du serveur ; seules les projections (voir `view.ts`) circulent.
 */
import type { PlayerId } from '../types';

export type UndercoverRole = 'civilian' | 'undercover' | 'mrwhite';

export type UndercoverPhase =
  | 'distribute'
  | 'describe'
  | 'discuss'
  | 'vote'
  | 'reveal'
  | 'whiteGuess'
  | 'end';

export interface UndercoverParams {
  undercoverCount: number;
  mrWhite: boolean;
  discussSeconds: number;
  voteSeconds: number;
  whiteGuessSeconds: number;
  /** Si vrai, la révélation montre qui a voté quoi (off par défaut, fiche 5.1 étape 6). */
  publicVotes: boolean;
  /** Nombre de manches enchaînées avec cumul des points (1 par défaut). */
  manchesCount: number;
  /** Passes de description avant chaque vote (1 par défaut, jusqu'à 3). */
  describePasses: number;
}

export type UndercoverWinner = 'civilians' | 'infiltrators' | 'mrwhite';

export interface UndercoverElimination {
  playerId: PlayerId;
  role: UndercoverRole;
  round: number;
  /** Retrait administratif par l'animateur (pas de droit de guess pour Mr. White). */
  byAdmin: boolean;
}

/** Issue du dépouillement d'un vote, affichée en phase `reveal`. */
export interface UndercoverRevealOutcome {
  kind: 'eliminated' | 'tie-noelim' | 'blank-noelim' | 'admin-removal';
  eliminated?: UndercoverElimination;
  /** Décompte public des voix (pas les votants, sauf `publicVotes`). */
  tally: Array<{ playerId: PlayerId; count: number }>;
  blankCount: number;
  /** Qui a voté quoi — uniquement si le paramètre `publicVotes` est actif. */
  votesByVoter?: Array<{ voterId: PlayerId; target: PlayerId | 'blank' }>;
}

export interface UndercoverWhiteGuessState {
  playerId: PlayerId;
  guess?: string;
  correct?: boolean;
  resolved: boolean;
}

export type UndercoverTimerId = 'discuss' | 'vote' | 'whiteGuess';

export interface UndercoverState {
  kind: 'undercover';
  phase: UndercoverPhase;
  params: UndercoverParams;
  /** Manche courante (1-indexée) sur `params.manchesCount`. */
  mancheIndex: number;
  /** Cumul des points des manches PRÉCÉDENTES (jamais projeté avant la fin). */
  carriedPoints: Record<PlayerId, number>;
  /**
   * Joueurs ayant visé un infiltré dans au moins un dépouillement de CETTE
   * manche (base du bonus de « bon vote » des civils). Jamais projeté avant la fin.
   */
  goodVoterIds: PlayerId[];
  /** Passe de description courante (1-indexée) sur `params.describePasses`. */
  describePass: number;
  /** Joueurs de la partie (instantané au lancement). */
  playerIds: PlayerId[];
  pair: { a: string; b: string };
  civilianWord: 'a' | 'b';
  roles: Record<PlayerId, UndercoverRole>;
  alive: PlayerId[];
  /** Tour courant, 1-indexé. */
  round: number;
  speakingOrder: PlayerId[];
  turnIndex: number;
  /** Joueurs ayant consulté leur mot (✓ sur la TV en distribution). */
  seenWord: PlayerId[];
  votes: Record<PlayerId, PlayerId | 'blank'>;
  /** Re-vote après égalité : cibles restreintes aux ex æquo. */
  revoteCandidates?: PlayerId[];
  /** Tours consécutifs sans élimination pour cause de votes blancs. */
  blankStreak: number;
  /** À 2 tours blancs consécutifs, la TV suggère d'abandonner la manche. */
  suggestAbort: boolean;
  lastReveal?: UndercoverRevealOutcome;
  /** Mr. White éliminé par vote : le prochain « continuer » ouvre sa phase de guess. */
  pendingWhiteGuessFor?: PlayerId;
  whiteGuess?: UndercoverWhiteGuessState;
  eliminations: UndercoverElimination[];
  winner?: UndercoverWinner;
}

export type UndercoverAction =
  | { type: 'SEEN_WORD'; playerId: PlayerId }
  | { type: 'HOST_NEXT' }
  | { type: 'CAST_VOTE'; playerId: PlayerId; target: PlayerId | 'blank' }
  | { type: 'SUBMIT_GUESS'; playerId: PlayerId; guess: string }
  | { type: 'TIMEOUT'; timerId: UndercoverTimerId }
  | { type: 'HOST_REMOVE_PLAYER'; playerId: PlayerId };


/** Répartition des rôles par effectif (fiche 5.1 ; 9–10 extrapolés, cf. DECISIONS.md). */
export const UNDERCOVER_DEFAULT_ROLES: Record<number, { undercover: number; mrWhite: boolean }> = {
  4: { undercover: 1, mrWhite: false },
  5: { undercover: 1, mrWhite: true },
  6: { undercover: 1, mrWhite: true },
  7: { undercover: 2, mrWhite: true },
  8: { undercover: 2, mrWhite: true },
  9: { undercover: 2, mrWhite: true },
  10: { undercover: 3, mrWhite: true },
};

export const UNDERCOVER_MIN_PLAYERS = 4;
export const UNDERCOVER_MAX_PLAYERS = 10;
export const UNDERCOVER_MIN_PLAYERS_FOR_MRWHITE = 5;

/**
 * Barème (révisé, cf. DECISIONS.md) : civils vainqueurs 2 pts chacun + 1 pt
 * bonus pour ceux qui ont visé un infiltré dans un vote ; undercover vainqueur
 * 3 pts ; Mr. White vainqueur (guess) 4 pts — le max civil (3) égale la
 * victoire undercover, la victoire la plus dure paie un cran au-dessus.
 */
export const UNDERCOVER_POINTS = {
  civilian: 2,
  goodVoteBonus: 1,
  undercover: 3,
  mrwhite: 4,
} as const;

export const UNDERCOVER_MAX_MANCHES = 5;
export const UNDERCOVER_MAX_DESCRIBE_PASSES = 3;
