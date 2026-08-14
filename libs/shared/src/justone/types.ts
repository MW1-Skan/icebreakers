/**
 * Just One — état serveur de la machine (fiche 5.3 du PRD).
 *
 * ⚠️ `word` (caché au devineur ET aux écrans publics avant la résolution),
 * `clues` (cachés de tous pendant l'écriture, restreints aux donneurs ensuite) :
 * JAMAIS dans une projection non autorisée.
 */
import type { PlayerId } from '../types';

export type JustOnePhase = 'write' | 'validate' | 'guess' | 'arbitrate' | 'resolve' | 'end';

/** Issue d'une manche : +1 / 0 / −1 (selon pénalité) / annulée (devineur parti). */
export type JustOneOutcome = 'correct' | 'wrong' | 'pass' | 'timeout' | 'aborted';

export interface JustOneParams {
  /** 8 par défaut, 5–13 (fiche 5.3). */
  manchesCount: number;
  writeSeconds: number;
  validateSeconds: number;
  guessSeconds: number;
  /** Délai laissé à l'arbitre pour trancher une réponse approximative. */
  arbitrateSeconds: number;
  /** Mode doux : une mauvaise réponse vaut 0 au lieu de −1. */
  softPenalty: boolean;
}

export interface JustOneClue {
  giverId: PlayerId;
  text: string;
  /** Annulé par le regroupement automatique (ressemblance) — verrouillé. */
  cancelledAuto: boolean;
  /** Annulé (ou ré-autorisé) à la main par les donneurs — dernier toggle gagne. */
  cancelledManual: boolean;
}

export function isClueCancelled(clue: JustOneClue): boolean {
  return clue.cancelledAuto || clue.cancelledManual;
}

export interface JustOneMancheRecord {
  word: string;
  guesserId: PlayerId;
  clues: JustOneClue[];
  guess?: string;
  outcome: JustOneOutcome;
  delta: number;
}

export interface JustOneState {
  kind: 'justone';
  phase: JustOnePhase;
  params: JustOneParams;
  /** Ordre d'arrivée : la rotation du devineur (et donc de l'arbitre) le suit. */
  playerIds: PlayerId[];
  mancheIndex: number; // 1-indexé
  guesserId: PlayerId;
  /** Arbitre NOMINAL (le prochain devineur) — glisse s'il est déconnecté. */
  arbiterId: PlayerId;
  word: string;
  unplayableUsed: boolean;
  /** Indices en cours d'écriture — secrets même entre donneurs. */
  clues: Record<PlayerId, string>;
  /** Indices figés au passage en validation (ordre des playerIds). */
  validatedClues?: JustOneClue[];
  readyGiverIds: PlayerId[];
  guess?: string;
  outcome?: JustOneOutcome;
  score: number;
  history: JustOneMancheRecord[];
  /** Devineur déconnecté : manche gelée 60 s (bandeau TV). */
  guesserFrozen: boolean;
}

export type JustOneTimerId = 'write' | 'validate' | 'guess' | 'arbitrate' | 'guesserGone';

export type JustOneAction =
  | { type: 'SUBMIT_CLUE'; playerId: PlayerId; text: string }
  | { type: 'FLAG_CLUE'; playerId: PlayerId; giverId: PlayerId; cancelled: boolean }
  | { type: 'READY'; playerId: PlayerId }
  | { type: 'FORCE_CLOSE'; playerId: PlayerId }
  | { type: 'SUBMIT_GUESS'; playerId: PlayerId; guess: string }
  | { type: 'PASS'; playerId: PlayerId }
  | { type: 'ARBITRATE'; playerId: PlayerId; decision: 'accept' | 'reject' }
  | { type: 'HOST_NEXT' }
  | { type: 'TIMEOUT'; timerId: JustOneTimerId }
  | { type: 'GUESSER_DISCONNECTED' }
  | { type: 'GUESSER_RECONNECTED' };

export const JUSTONE_MIN_PLAYERS = 4;
export const JUSTONE_MAX_PLAYERS = 10;
