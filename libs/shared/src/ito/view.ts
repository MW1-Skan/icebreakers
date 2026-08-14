/**
 * Ito — projections par audience (fiche 5.5). La frise et les vies sont
 * publiques ; le nombre d'un joueur ne sort que révélé dans la frise.
 */
import type { PlayerId } from '../types';
import type { ItoFriseCard, ItoMancheRecord, ItoPhase } from './types';

export interface ItoPublicView {
  kind: 'ito';
  phase: ItoPhase;
  mancheIndex: number;
  manchesTotal: number;
  theme: string;
  lives: number;
  livesTotal: number;
  /** Cartes encore en main (dos visibles sur la TV). */
  holdersCount: number;
  holderIds: PlayerId[];
  frise: ItoFriseCard[];
  effectiveGap: number;
  /** Écart demandé réduit (bandeau « écart réduit à N »). */
  gapReduced: boolean;
  /** Écart < 4 : suggestion de repasser sur 1–100. */
  suggestWiderRange: boolean;
  themeLocked: boolean;
  /** Fin de partie : victoire si vies > 0, verdict par vies restantes. */
  verdict?: { victory: boolean; label: string };
  history?: ItoMancheRecord[];
  params: { manchesCount: number; livesCount: number; rangeMax: number; minGap: number };
}

export interface ItoMeView {
  inGame: boolean;
  /** 🔒 Son nombre — tant qu'il est en main (posé/défaussé → il est public). */
  myNumber?: number;
  holding: boolean;
  canPlay: boolean;
}
