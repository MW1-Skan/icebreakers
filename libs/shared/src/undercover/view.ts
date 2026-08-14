/**
 * Undercover — projections par audience (fiche 5.1, tableau « Écrans par phase »).
 * Ces types sont le contrat de ce qui PEUT transiter vers un client. Aucun champ
 * secret de `UndercoverState` (pair, civilianWord, roles, votes) n'y figure au
 * niveau public — seul `me` porte le secret du joueur destinataire.
 */
import type { PlayerId } from '../types';
import type {
  UndercoverPhase,
  UndercoverRevealOutcome,
  UndercoverRole,
  UndercoverWinner,
} from './types';

/** Partie publique — identique pour la TV (host), le miroir et tous les joueurs. */
export interface UndercoverPublicView {
  kind: 'undercover';
  phase: UndercoverPhase;
  round: number;
  /** Manche courante (1-indexée) sur `manchesTotal`. */
  mancheIndex: number;
  manchesTotal: number;
  /** Passe de description courante (1-indexée) sur `params.describePasses`. */
  describePass: number;
  aliveIds: PlayerId[];
  /** L'ordre de parole est affiché sur la TV (fiche 5.1, étape 1) : public. */
  speakingOrder: PlayerId[];
  currentSpeakerId?: PlayerId;
  /** Distribution : joueurs ayant consulté leur mot (✓). */
  seenWordIds: PlayerId[];
  /** Vote : « X/Y ont voté » — jamais le contenu des votes. */
  votesCast: number;
  votesExpected: number;
  /** Re-vote d'égalité en cours, restreint à ces candidats (public : « égalité entre… »). */
  revoteCandidates?: PlayerId[];
  /** Issue du dernier dépouillement (phase reveal) — rôle de l'éliminé public. */
  lastReveal?: UndercoverRevealOutcome;
  /** Guess de Mr. White : la proposition et le verdict s'affichent sur la TV. */
  whiteGuess?: { playerId: PlayerId; guess?: string; correct?: boolean; resolved: boolean };
  /** Rôles déjà révélés par élimination (publics dès la révélation). */
  eliminations: Array<{ playerId: PlayerId; role: UndercoverRole; round: number; byAdmin: boolean }>;
  /** À 2 tours blancs consécutifs : suggestion d'abandon sur la TV. */
  suggestAbort: boolean;
  /** Révélation complète — uniquement en phase `end`. */
  end?: UndercoverEndView;
  /** Paramètres publics (connus de tous au lancement). */
  params: {
    undercoverCount: number;
    mrWhite: boolean;
    discussSeconds: number;
    voteSeconds: number;
    publicVotes: boolean;
    manchesCount: number;
    describePasses: number;
  };
}

export interface UndercoverEndView {
  winner: UndercoverWinner;
  words: { a: string; b: string; civilianWord: 'a' | 'b' };
  roles: Array<{ playerId: PlayerId; role: UndercoverRole; word?: string }>;
  /** Points de CETTE manche ; `goodVote` = bonus de bon vote (civils vainqueurs). */
  points: Array<{ playerId: PlayerId; points: number; goodVote: boolean }>;
  /** Cumul de la série (manches précédentes + celle-ci), trié décroissant. */
  cumulative: Array<{ playerId: PlayerId; points: number }>;
  isFinalManche: boolean;
}

/** Partie privée du joueur destinataire (🔒). */
export interface UndercoverMeView {
  inGame: boolean;
  alive: boolean;
  /** Son mot — civil ou undercover (sans savoir lequel des deux il est !). */
  word?: string;
  /** « Tu es Mr. White » — seul rôle connu de son détenteur. */
  isMrWhite?: boolean;
  hasSeenWord: boolean;
  isMyTurn: boolean;
  canVote: boolean;
  /** Cibles autorisées (vivants sauf soi ; restreint aux ex æquo en re-vote). */
  voteOptions: PlayerId[];
  /** Son propre vote courant (modifiable jusqu'à la clôture). */
  myVote?: PlayerId | 'blank';
  /** Mr. White éliminé par vote : saisie du guess ouverte. */
  canGuess: boolean;
}
