/**
 * Just One — projections par audience (fiche 5.3, tableau « Écrans par phase »).
 * La TV ne voit QUE des compteurs avant la résolution (le devineur la regarde !) ;
 * le mot n'y apparaît qu'à la résolution, les indices qu'au récap final.
 */
import type { PlayerId } from '../types';
import type { JustOneOutcome, JustOnePhase } from './types';

export interface JustOneClueView {
  giverId: PlayerId;
  text: string;
  cancelledAuto: boolean;
  cancelledManual: boolean;
}

export interface JustOneMancheRecordView {
  word: string;
  guesserId: PlayerId;
  clues: JustOneClueView[];
  guess?: string;
  outcome: JustOneOutcome;
  delta: number;
}

/** Partie publique — identique TV (host), miroir et tous les joueurs. */
export interface JustOnePublicView {
  kind: 'justone';
  phase: JustOnePhase;
  mancheIndex: number;
  manchesTotal: number;
  guesserId: PlayerId;
  /** Arbitre EFFECTIF (glisse si le nominal est déconnecté). */
  arbiterId: PlayerId;
  /** « X/Y indices écrits » — Y = donneurs connectés. */
  cluesSubmitted: number;
  giversExpected: number;
  giversReady: number;
  /** Devinette : nombre d'indices restants / annulés — jamais leur texte. */
  remainingClues: number;
  cancelledClues: number;
  /** La proposition du devineur est publique dès sa soumission. */
  guess?: string;
  outcome?: JustOneOutcome;
  /** Le mot, révélé UNIQUEMENT en phase resolve (puis dans le récap de fin). */
  revealedWord?: string;
  score: number;
  scoreLabel?: string; // phase end
  /** Récap complet (mots + indices + annulés) — phase end uniquement. */
  history?: JustOneMancheRecordView[];
  guesserFrozen: boolean;
  unplayableUsed: boolean;
  params: {
    manchesCount: number;
    writeSeconds: number;
    validateSeconds: number;
    guessSeconds: number;
    softPenalty: boolean;
  };
}

/** Partie privée du joueur destinataire. */
export interface JustOneMeView {
  inGame: boolean;
  isGuesser: boolean;
  /** Arbitre effectif de la manche. */
  isArbiter: boolean;
  /** 🔒 Le mot mystère — donneurs uniquement. */
  word?: string;
  myClue?: string;
  canSubmitClue: boolean;
  /** 👥 Liste des indices — donneurs uniquement, à partir de la validation. */
  clues?: JustOneClueView[];
  /** 🔒 Devineur en phase guess : indices restants (les annulés sont masqués). */
  remainingCluesForGuesser?: Array<{ giverId: PlayerId; text: string }>;
  maskedCluesCount?: number;
  isReady: boolean;
  canReady: boolean;
  canForceClose: boolean;
  /** Arbitre : « Mot injouable » disponible (avant le premier indice, 1×/manche). */
  canRedraw: boolean;
  /** Arbitre : accepter/refuser la réponse approximative. */
  canArbitrate: boolean;
  canGuess: boolean;
}
