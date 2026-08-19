/**
 * Modèle de données serveur (PRD §6.5). Vit uniquement en mémoire —
 * jamais sérialisé vers un client (seules les projections sortent).
 */
import type {
  CodenamesParams,
  CodenamesState,
  GameResult,
  ItoParams,
  ItoState,
  JustOneParams,
  JustOneState,
  PackPublicView,
  Player,
  PlayerId,
  Rng,
  RoomStatus,
  SpyfallParams,
  SpyfallState,
  TabooParams,
  TabooState,
  TimerView,
  UndercoverParams,
  UndercoverState,
  WavelengthParams,
  WavelengthState,
} from '../shared';

export type GameState =
  | UndercoverState
  | JustOneState
  | WavelengthState
  | ItoState
  | SpyfallState
  | TabooState
  | CodenamesState;

/**
 * Surcharges explicites du host ; les défauts sont résolus au lancement.
 * `packIds` : packs cochés — `undefined` = tous les packs actifs du jeu,
 * résolu à CHAQUE tirage (la sélection est re-validée, cf. resolvePackIds).
 */
export type GameSelection =
  | { game: 'undercover'; packIds?: string[]; paramOverrides: Partial<UndercoverParams> }
  | { game: 'justone'; packIds?: string[]; paramOverrides: Partial<JustOneParams> }
  | { game: 'wavelength'; packIds?: string[]; paramOverrides: Partial<WavelengthParams> }
  | { game: 'ito'; packIds?: string[]; paramOverrides: Partial<ItoParams> }
  | { game: 'spyfall'; packIds?: string[]; paramOverrides: Partial<SpyfallParams> }
  | { game: 'taboo'; packIds?: string[]; paramOverrides: Partial<TabooParams> }
  | { game: 'codenames'; packIds?: string[]; paramOverrides: Partial<CodenamesParams> };

export interface Room {
  code: string; // "KZTR"
  teamName?: string; // anti-répétition inter-rétros (stub en v1)
  host: { token: string; connected: boolean; disconnectedAt?: number };
  players: Player[]; // l'animateur n'y figure JAMAIS (il ne joue pas)
  /** Jeton → joueur, pour la reconnexion (§3.4). */
  playerTokens: Map<string, PlayerId>;
  mirrorConnected: boolean;
  status: RoomStatus;
  selection?: GameSelection;
  game?: GameState;
  sessionRecap: GameResult[];
  /** Anti-répétition intra-salon : `packId#index` déjà tirés. */
  usedEntryIds: Set<string>;
  /** Bandeau « contenu recyclé » après re-mélange d'un pack épuisé. */
  contentRecycled: boolean;
  /** RNG du salon (seedable en dev/test pour le e2e déterministe). */
  rng: Rng;
  createdAt: number;
  lastActivityAt: number;
}

/** Données contextuelles publiques nécessaires à la projection (timers, config…). */
export interface ProjectionCtx {
  timers: TimerView[];
  /** Packs ACTIFS du jeu sélectionné (liste publique : noms, modes, tailles). */
  availablePacks: PackPublicView[];
  /** Sélection résolue : ids cochés encore existants/actifs (défaut = tous). */
  selectedPackIds: string[];
  /** Codenames : mots distincts dans l'union des packs cochés (blocker grille). */
  codenamesDistinctWords?: number;
  config: { siteName: string; internalModeLabel: string };
  timerDefaults: { discussSeconds: number; voteSeconds: number; whiteGuessSeconds: number };
}
