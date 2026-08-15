/**
 * Codenames — projections par audience. La TV et les devineurs ne voient la
 * couleur d'une carte QUE révélée ; la clé complète n'existe que dans la vue
 * des deux maîtres-espions. En phase `end`, la clé devient publique.
 */
import type { PlayerId } from '../types';
import type {
  CodenamesCardKind,
  CodenamesClue,
  CodenamesGridSize,
  CodenamesMancheResult,
  CodenamesPhase,
  CodenamesTeam,
} from './types';

export interface CodenamesCardPublicView {
  word: string;
  revealed: boolean;
  /** Présent UNIQUEMENT si la carte est révélée. */
  kind?: CodenamesCardKind;
}

export interface CodenamesPublicView {
  kind: 'codenames';
  phase: CodenamesPhase;
  teams: [PlayerId[], PlayerId[]];
  spymasters: [PlayerId, PlayerId];
  activeTeam: CodenamesTeam;
  startingTeam: CodenamesTeam;
  mancheIndex: number;
  manchesTotal: number;
  gridSize: CodenamesGridSize;
  cards: CodenamesCardPublicView[];
  /** Mots restant à trouver par équipe (compteurs publics, comme sur la boîte). */
  remaining: [number, number];
  currentClue?: { spymasterId: PlayerId; word: string; count: number; guessesLeft: number };
  /** Historique public des indices (récap de fin). */
  clues: CodenamesClue[];
  seenKeyIds: PlayerId[];
  winner?: CodenamesTeam;
  endedByAssassin: boolean;
  assassinTeam?: CodenamesTeam;
  /** Phase end uniquement : la clé complète, enfin publique. */
  keyReveal?: CodenamesCardKind[];
  history: CodenamesMancheResult[];
  /** Cumul de série par joueur (phase end, si manchesCount > 1). */
  cumulative?: Array<{ playerId: PlayerId; points: number }>;
  frozen: boolean;
  params: { gridSize: CodenamesGridSize; manchesCount: number; clueSeconds: number; guessSeconds: number };
}

export interface CodenamesMeView {
  inGame: boolean;
  team?: CodenamesTeam;
  isSpymaster: boolean;
  hasSeenKey: boolean;
  /** 🔒👥 La clé complète (une couleur par carte) — maîtres-espions uniquement. */
  key?: CodenamesCardKind[];
  canGiveClue: boolean;
  canReveal: boolean;
  /** « On s'arrête là » — au moins une touche faite sur l'indice courant. */
  canStop: boolean;
}
