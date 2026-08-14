/**
 * Modèle de données serveur (PRD §6.5). Vit uniquement en mémoire —
 * jamais sérialisé vers un client (seules les projections sortent).
 */
import type {
  ContentMode,
  GameResult,
  Player,
  PlayerId,
  Rng,
  RoomStatus,
  TimerView,
  UndercoverParams,
  UndercoverState,
} from '../shared';

export type GameState = UndercoverState; // union à étendre avec les jeux suivants

export interface GameSelection {
  game: 'undercover';
  contentMode: ContentMode;
  /** Surcharges explicites du host ; les défauts sont résolus au lancement. */
  paramOverrides: Partial<UndercoverParams>;
}

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
