/**
 * Wavelength — projections par audience (fiche 5.2, tableau « Écrans par phase »).
 * La cible n'apparaît nulle part avant la révélation (sauf chez le télépathe) ;
 * les curseurs sont invisibles des autres pendant le placement.
 */
import type { PlayerId } from '../types';
import type { WavelengthAxis, WavelengthMancheRecord, WavelengthPhase } from './types';

export interface WavelengthPublicView {
  kind: 'wavelength';
  phase: WavelengthPhase;
  mancheNumber: number;
  manchesPlanned: number;
  telepathId: PlayerId;
  axis: WavelengthAxis;
  /** L'indice est public dès sa saisie (affiché en grand sur la TV). */
  clue?: string;
  /** « X/Y ont placé » — jamais les valeurs. */
  placedCount: number;
  placersExpected: number;
  /** Révélation : cible + zones + curseurs nominatifs + points (public d'un coup). */
  lastResult?: WavelengthMancheRecord;
  /** Cumul individuel, trié décroissant (affiché à la révélation et à la fin). */
  totals: Array<{ playerId: PlayerId; points: number }>;
  /** Récap des indices — phase end. */
  history?: WavelengthMancheRecord[];
  zoneWidth: number;
  params: { manchesCount: number; placeSeconds: number; zoneWidth: number };
}

export interface WavelengthMeView {
  inGame: boolean;
  isTelepath: boolean;
  /** 🔒 La cible — télépathe uniquement, dès le tirage. */
  target?: number;
  canSubmitClue: boolean;
  canPlace: boolean;
  /** 🔒 Son propre curseur (modifiable jusqu'à la clôture). */
  myPlacement?: number;
  hasPlaced: boolean;
}
