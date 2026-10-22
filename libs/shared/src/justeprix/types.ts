/**
 * Le Juste Prix — état serveur de la machine (fiche docs/fiches/juste-prix.md).
 *
 * ⚠️ Secrets : le prix et la source de l'article courant (jusqu'à sa
 * révélation), les articles suivants (jamais projetés) et les mises
 * individuelles (pendant l'estimation) — JAMAIS dans une projection non
 * autorisée.
 */
import type { PlayerId } from '../types';

export type JustePrixPhase = 'guess' | 'reveal' | 'end';

export interface JustePrixParams {
  /** Nombre d'articles (= manches). */
  manchesCount: number;
  guessSeconds: number;
  /** Règle TV « sans dépasser » : une mise au-dessus du prix vaut 0. */
  noOverbid: boolean;
}

/** Un article tiré des packs (prix et source compris : serveur uniquement avant révélation). */
export interface JustePrixItem {
  /** `packId#index` — anti-répétition, jamais projeté. */
  elementId: string;
  name: string;
  details?: string;
  /** 🔒 Prix public TTC en euros. */
  price: number;
  /** URL https de la photo (hotlink). */
  image: string;
  /** 🔒 Page produit. */
  source?: string;
  /** Date du relevé (AAAA-MM ou AAAA-MM-JJ). */
  seenAt?: string;
  credit?: string;
}

/** Une mise classée à la révélation. */
export interface JustePrixBidResult {
  playerId: PlayerId;
  amount: number;
  /** Écart relatif signé `(mise − prix) / prix`, pour l'affichage. */
  delta: number;
  /** Rang (1 = plus proche) ; absent si la mise est hors classement (« sans dépasser »). */
  rank?: number;
  points: number;
  /** Mise au-dessus du prix (pertinent avec « sans dépasser »). */
  overbid: boolean;
  /** 🎯 Écart ≤ 1 %. */
  bullseye: boolean;
}

/** Un article révélé : public à partir de sa révélation. */
export interface JustePrixRoundRecord {
  itemNumber: number;
  item: Omit<JustePrixItem, 'elementId'>;
  /** Classés d'abord (rang croissant), puis les mises hors classement. */
  results: JustePrixBidResult[];
}

export interface JustePrixState {
  kind: 'justeprix';
  phase: JustePrixPhase;
  params: JustePrixParams;
  playerIds: PlayerId[];
  /** 🔒 Articles tirés au lancement ; seul l'article courant est projeté (sans prix avant révélation). */
  items: JustePrixItem[];
  /** Index de l'article courant (0-based). */
  itemIndex: number;
  /** 🔒 Mises en euros, secrètes pendant l'estimation. */
  bids: Record<PlayerId, number>;
  lastResult?: JustePrixRoundRecord;
  totals: Record<PlayerId, number>;
  history: JustePrixRoundRecord[];
}

export type JustePrixTimerId = 'guess';

export type JustePrixAction =
  | { type: 'ESTIMATE'; playerId: PlayerId; amount: number }
  | { type: 'TIMEOUT'; timerId: JustePrixTimerId }
  | { type: 'HOST_NEXT' }
  /** Un joueur s'est déconnecté : la clôture anticipée est réévaluée. */
  | { type: 'PLAYER_GONE' };

export const JUSTEPRIX_MIN_PLAYERS = 3;
export const JUSTEPRIX_MAX_PLAYERS = 10;
/** Points par rang : 1er, 2e, 3e. */
export const JUSTEPRIX_RANK_POINTS = [3, 2, 1] as const;
/** Borne haute d'une mise comme d'un prix (en euros). */
export const JUSTEPRIX_MAX_AMOUNT = 1_000_000_000;
