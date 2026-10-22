/**
 * Le Juste Prix — projections par audience. Pendant l'estimation : ni prix,
 * ni source, ni mises (seulement QUI a misé) ; les articles suivants ne sont
 * jamais projetés.
 */
import type { PlayerId } from '../types';
import type { JustePrixPhase, JustePrixRoundRecord } from './types';

/** Ce que tout le monde voit de l'article courant (jamais le prix ni la source). */
export interface JustePrixItemPublic {
  name: string;
  details?: string;
  image: string;
}

export interface JustePrixPublicView {
  kind: 'justeprix';
  phase: JustePrixPhase;
  /** 1-indexé. */
  itemNumber: number;
  itemsCount: number;
  /** Article courant (estimation et révélation) ; absent en fin de partie. */
  item?: JustePrixItemPublic;
  /** Joueurs ayant misé — jamais les montants. */
  bidderIds: PlayerId[];
  /** Miseurs attendus pour la clôture anticipée (connectés pendant l'estimation). */
  biddersExpected: number;
  /** Dernier article révélé (prix, source, classement) — public par construction. */
  lastResult?: JustePrixRoundRecord;
  /** Cumul individuel, trié décroissant. */
  totals: Array<{ playerId: PlayerId; points: number }>;
  /** Récap des articles — phase end. */
  history?: JustePrixRoundRecord[];
  params: { manchesCount: number; guessSeconds: number; noOverbid: boolean };
}

export interface JustePrixMeView {
  inGame: boolean;
  canEstimate: boolean;
  /** 🔒 Sa propre mise (modifiable jusqu'à la clôture). */
  myBid?: number;
}
