/**
 * Spyfall — projections par audience (fiche 5.4). Le thème et la grille sont
 * publics et affichés en permanence ; la carte est cachée à l'espion (et donc
 * à la TV, que tout le monde regarde) ; l'espion n'est révélé qu'à l'issue.
 */
import type { PlayerId } from '../types';
import type { SpyfallMancheRecord, SpyfallOutcome, SpyfallPhase } from './types';

export interface SpyfallPublicView {
  kind: 'spyfall';
  phase: SpyfallPhase;
  mancheIndex: number;
  manchesTotal: number;
  category: string;
  grid: string[];
  firstQuestionerId: PlayerId;
  seenCardIds: PlayerId[];
  /** Accusation en cours : qui accuse qui + compte des votes (jamais le détail). */
  accusation?: { accuserId: PlayerId; accusedId: PlayerId; votesCast: number; votersExpected: number };
  /** Joueurs ayant déjà consommé leur accusation (info publique — bouton grisé). */
  accusationsUsed: PlayerId[];
  /** Vote final : « X/Y ont voté ». */
  finalVotesCast: number;
  finalVotersExpected: number;
  /** « L'espion se révèle ! » — identité publique dès qu'il fige le jeu. */
  revealedSpyId?: PlayerId;
  frozen: boolean;
  /** Révélation de la manche (phase reveal/end) : carte, espion, points. */
  lastOutcome?: SpyfallOutcome;
  totals: Array<{ playerId: PlayerId; points: number }>;
  history?: SpyfallMancheRecord[]; // phase end
  params: { mancheSeconds: number; manchesCount: number };
}

export interface SpyfallMeView {
  inGame: boolean;
  /** 🔒 « Tu es l'ESPION » — connu de lui seul. */
  isSpy?: boolean;
  /** 🔒 La carte secrète — tous sauf l'espion. */
  card?: string;
  hasSeenCard: boolean;
  canAccuse: boolean;
  /** Vote d'accusation : je vote / on vote sur moi. */
  canVoteAccusation: boolean;
  isAccused: boolean;
  myAccusationVote?: boolean;
  /** Espion : bouton « Deviner la carte » (figer le jeu). */
  canSpyReveal: boolean;
  /** Espion révélé : grille cliquable. */
  canSpyGuess: boolean;
  canVoteFinal: boolean;
  myFinalVote?: PlayerId;
}
