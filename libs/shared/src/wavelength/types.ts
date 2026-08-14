/**
 * Wavelength — état serveur de la machine (fiche 5.2 du PRD, version v3 :
 * score individuel, placements secrets).
 *
 * ⚠️ `target` (connu du seul télépathe avant la révélation) et `placements`
 * (secrets pendant le placement) : JAMAIS dans une projection non autorisée.
 */
import type { PlayerId } from '../types';

export type WavelengthPhase = 'clue' | 'place' | 'reveal' | 'aborted' | 'end';

export interface WavelengthParams {
  /** Défaut : nb de joueurs actifs, plafonné à 7 (fiche 5.2). */
  manchesCount: number;
  placeSeconds: number;
  /** Largeur de la zone centrale : ±w → 4 pts, ±2w → 3 pts, ±3w → 2 pts. */
  zoneWidth: number;
}

export interface WavelengthAxis {
  left: string;
  right: string;
}

export interface WavelengthPlacementResult {
  playerId: PlayerId;
  value: number;
  points: number;
}

export interface WavelengthMancheRecord {
  telepathId: PlayerId;
  axis: WavelengthAxis;
  clue?: string;
  target: number;
  results: WavelengthPlacementResult[];
  telepathPoints: number;
  aborted: boolean;
}

export interface WavelengthState {
  kind: 'wavelength';
  phase: WavelengthPhase;
  params: WavelengthParams;
  playerIds: PlayerId[];
  /** Tours restants après le tour courant (les manches annulées y retournent une fois). */
  telepathQueue: PlayerId[];
  /** Télépathes déjà repêchés une fois (pas de second repêchage). */
  retriedIds: PlayerId[];
  currentTelepathId: PlayerId;
  /** Numéro du tour courant (1-indexé, manches rejouées comprises). */
  mancheNumber: number;
  /** Total planifié affiché (initial + repêchages ajoutés). */
  manchesPlanned: number;
  axis: WavelengthAxis;
  /** 🔒 Cible entière 0–100, connue du seul télépathe avant la révélation. */
  target: number;
  /** Public dès sa saisie (affiché en grand sur la TV). */
  clue?: string;
  /** 🔒 Curseurs individuels, secrets pendant le placement. */
  placements: Record<PlayerId, number>;
  lastResult?: WavelengthMancheRecord;
  totals: Record<PlayerId, number>;
  history: WavelengthMancheRecord[];
}

export type WavelengthTimerId = 'place';

export type WavelengthAction =
  | { type: 'SUBMIT_CLUE'; playerId: PlayerId; clue: string }
  | { type: 'HOST_INVALIDATE_CLUE' }
  | { type: 'PLACE'; playerId: PlayerId; value: number }
  | { type: 'HOST_NEXT' }
  | { type: 'TIMEOUT'; timerId: WavelengthTimerId }
  | { type: 'TELEPATH_LEFT' };

export const WAVELENGTH_MIN_PLAYERS = 3;
export const WAVELENGTH_MAX_PLAYERS = 10;
/** Barème par zone (fiche 5.2 étape 5) : ±w, ±2w, ±3w. */
export const WAVELENGTH_ZONE_POINTS = [4, 3, 2] as const;
