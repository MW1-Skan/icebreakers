/**
 * Modèle de données serveur (PRD §6.5). Vit uniquement en mémoire —
 * jamais sérialisé vers un client (seules les projections sortent).
 */
import type {
  CodenamesParams,
  CodenamesState,
  ContentMode,
  GameResult,
  ItoParams,
  ItoState,
  JustOneParams,
  JustOneState,
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

/** Surcharges explicites du host ; les défauts sont résolus au lancement. */
export type GameSelection =
  | { game: 'undercover'; contentMode: ContentMode; paramOverrides: Partial<UndercoverParams> }
  | { game: 'justone'; contentMode: ContentMode; paramOverrides: Partial<JustOneParams> }
  | { game: 'wavelength'; contentMode: ContentMode; paramOverrides: Partial<WavelengthParams> }
  | { game: 'ito'; contentMode: ContentMode; paramOverrides: Partial<ItoParams> }
  | { game: 'spyfall'; contentMode: ContentMode; paramOverrides: Partial<SpyfallParams> }
  | { game: 'taboo'; contentMode: ContentMode; paramOverrides: Partial<TabooParams> }
  | { game: 'codenames'; contentMode: ContentMode; paramOverrides: Partial<CodenamesParams> };

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
  availableModes: ContentMode[];
  config: { siteName: string; internalModeLabel: string };
  timerDefaults: { discussSeconds: number; voteSeconds: number; whiteGuessSeconds: number };
}
