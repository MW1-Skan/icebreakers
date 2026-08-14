/**
 * Ito — état serveur de la machine (fiche 5.5 du PRD).
 *
 * ⚠️ `numbers` (le nombre de chaque joueur, jusqu'à sa révélation dans la
 * frise) : JAMAIS dans une projection non autorisée.
 */
import type { PlayerId } from '../types';

export type ItoPhase = 'play' | 'mancheEnd' | 'end';

/** Une carte révélée dans la frise (ordre chronologique des révélations). */
export interface ItoFriseCard {
  playerId: PlayerId;
  number: number;
  /** posed = pose correcte ✅ ; error = pose fautive ❌ (−1 vie) ;
   * discarded = défaussée automatiquement (inférieure à une pose fautive) ;
   * released = libérée par l'animateur (déconnexion, sans coût). */
  kind: 'posed' | 'error' | 'discarded' | 'released';
}

export interface ItoParams {
  manchesCount: number; // 3 par défaut (1–5)
  livesCount: number; // 3 par défaut (1–5)
  rangeMax: number; // 100 par défaut
  /** Écart minimal souhaité entre deux nombres quelconques (défaut 8). */
  minGap: number;
}

export interface ItoMancheRecord {
  theme: string;
  livesLost: number;
  frise: ItoFriseCard[];
}

export interface ItoState {
  kind: 'ito';
  phase: ItoPhase;
  params: ItoParams;
  playerIds: PlayerId[];
  mancheIndex: number; // 1-indexé
  theme: string;
  /** 🔒 Nombre secret de chaque joueur de la manche. */
  numbers: Record<PlayerId, number>;
  /** Joueurs qui ont encore leur carte en main. */
  holders: PlayerId[];
  frise: ItoFriseCard[];
  lives: number;
  /** Écart effectivement garanti (réduit automatiquement si infaisable). */
  effectiveGap: number;
  /** Première pose faite → thème verrouillé (plus de changement). */
  themeLocked: boolean;
  history: ItoMancheRecord[];
}

export type ItoAction =
  | { type: 'PLAY_CARD'; playerId: PlayerId }
  | { type: 'HOST_RELEASE_CARD'; playerId: PlayerId }
  | { type: 'HOST_NEXT' };

export const ITO_MIN_PLAYERS = 3;
export const ITO_MAX_PLAYERS = 10;
/** Sous cet écart effectif, la TV suggère de repasser sur 1–100 (fiche 5.5). */
export const ITO_GAP_SUGGEST_THRESHOLD = 4;
