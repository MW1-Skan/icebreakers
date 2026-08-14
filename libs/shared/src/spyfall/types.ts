/**
 * Spyfall — état serveur de la machine (fiche 5.4 du PRD, v3 : thèmes publics,
 * pas de rôles de décorum — 1 espion contre des civils qui partagent la carte).
 *
 * ⚠️ `spyId` (jusqu'à la révélation) et `card` (pour l'espion) : JAMAIS dans
 * une projection non autorisée. Le thème et la grille, eux, sont publics.
 */
import type { PlayerId } from '../types';

export type SpyfallPhase =
  | 'brief' // distribution : chacun consulte sa carte (ou « Tu es l'ESPION »)
  | 'interrogate' // questions à l'oral, timer de manche
  | 'accusationVote' // « X accuse Y » : vote Oui/Non de tous sauf l'accusé
  | 'spyGuess' // l'espion s'est révélé et choisit une carte dans la grille
  | 'finalVote' // fin du timer : chacun désigne un suspect
  | 'reveal' // révélation (carte, espion), points de la manche
  | 'end';

export interface SpyfallParams {
  /** Durée d'une manche (défaut 6 min). */
  mancheSeconds: number;
  /** 1 à 3 manches par session (fiche 5.4). */
  manchesCount: number;
  accusationVoteSeconds: number;
  finalVoteSeconds: number;
  spyGuessSeconds: number;
}

export type SpyfallWinner = 'team' | 'spy';

export type SpyfallOutcomeReason =
  | 'accusationRight' // accusation unanime, l'accusé était l'espion
  | 'accusationWrong' // accusation unanime… sur un civil
  | 'spyGuessRight'
  | 'spyGuessWrong'
  | 'finalVoteRight'
  | 'finalVoteMiss' // plus voté ≠ espion, ou égalité → l'espion gagne
  | 'aborted'; // espion déconnecté > 60 s : manche annulée, aucune valeur

export interface SpyfallOutcome {
  winner?: SpyfallWinner; // absent si aborted
  reason: SpyfallOutcomeReason;
  spyId: PlayerId;
  card: string;
  /** Accusateur décisif (+2 pts) si victoire par accusation. */
  decisiveAccuserId?: PlayerId;
  guessedCard?: string;
  topVotedId?: PlayerId;
}

export interface SpyfallMancheRecord {
  category: string;
  card: string;
  spyId: PlayerId;
  outcome: SpyfallOutcome;
}

export interface SpyfallState {
  kind: 'spyfall';
  phase: SpyfallPhase;
  params: SpyfallParams;
  playerIds: PlayerId[];
  mancheIndex: number; // 1-indexé
  /** Thème public + grille = union des items du thème sur les packs actifs. */
  category: string;
  grid: string[];
  /** 🔒 La carte secrète — connue de tous SAUF de l'espion. */
  card: string;
  /** 🔒 L'identité de l'espion — le secret absolu de la manche. */
  spyId: PlayerId;
  /** Premier questionneur, tiré au sort (public sur la TV). */
  firstQuestionerId: PlayerId;
  seenCardIds: PlayerId[];
  /** Une accusation par joueur et par manche. */
  accusationsUsed: PlayerId[];
  /** Vote d'accusation en cours (Oui/Non, l'accusé ne vote pas). */
  accusation?: { accuserId: PlayerId; accusedId: PlayerId; votes: Record<PlayerId, boolean> };
  finalVotes: Record<PlayerId, PlayerId>;
  /** Espion déconnecté : manche gelée (60 s avant annulation). */
  frozen: boolean;
  lastOutcome?: SpyfallOutcome;
  totals: Record<PlayerId, number>;
  history: SpyfallMancheRecord[];
}

export type SpyfallTimerId = 'manche' | 'accusationVote' | 'spyGuess' | 'finalVote' | 'spyGone';

export type SpyfallAction =
  | { type: 'SEEN_CARD'; playerId: PlayerId }
  | { type: 'HOST_NEXT' }
  | { type: 'ACCUSE'; accuserId: PlayerId; accusedId: PlayerId }
  | { type: 'VOTE_ACCUSATION'; playerId: PlayerId; yes: boolean }
  | { type: 'SPY_REVEAL'; playerId: PlayerId }
  | { type: 'SPY_GUESS'; playerId: PlayerId; card: string }
  | { type: 'VOTE_FINAL'; playerId: PlayerId; target: PlayerId }
  | { type: 'TIMEOUT'; timerId: SpyfallTimerId }
  | { type: 'SPY_DISCONNECTED' }
  | { type: 'SPY_RECONNECTED' };

export const SPYFALL_MIN_PLAYERS = 4;
export const SPYFALL_MAX_PLAYERS = 10;
/** Points suggérés (fiche 5.4 étape 7). */
export const SPYFALL_POINTS = { teamMember: 1, decisiveAccuserBonus: 2, spy: 4 } as const;
