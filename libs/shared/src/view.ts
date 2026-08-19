/**
 * ClientView — l'UNIQUE objet envoyé à un client (`room:state`, PRD §6.3).
 * L'UI de chaque écran est une fonction pure de cet objet.
 */
import type { GameId, GameResult, PackMode, PlayerId, RoomStatus, ViewerKind } from './types';
import type { UndercoverParams } from './undercover/types';
import type { UndercoverMeView, UndercoverPublicView } from './undercover/view';
import type { JustOneParams } from './justone/types';
import type { JustOneMeView, JustOnePublicView } from './justone/view';
import type { WavelengthParams } from './wavelength/types';
import type { WavelengthMeView, WavelengthPublicView } from './wavelength/view';
import type { ItoParams } from './ito/types';
import type { ItoMeView, ItoPublicView } from './ito/view';
import type { SpyfallParams } from './spyfall/types';
import type { SpyfallMeView, SpyfallPublicView } from './spyfall/view';
import type { TabooParams } from './taboo/types';
import type { TabooMeView, TabooPublicView } from './taboo/view';
import type { CodenamesParams } from './codenames/types';
import type { CodenamesMeView, CodenamesPublicView } from './codenames/view';

export interface TimerView {
  id: string;
  /** Échéance (epoch ms serveur) — le client affiche un décompte local. */
  endsAt: number;
  /** Restant au moment de l'émission (référence si l'horloge client dérive). */
  remainingMs: number;
  totalMs: number;
  paused: boolean;
}

export interface PlayerPublicView {
  id: PlayerId;
  name: string;
  avatar: string;
  connected: boolean;
  /** Epoch ms de la déconnexion (pour le sablier + le seuil des 60 s côté UI). */
  disconnectedAt?: number;
}

export type RoomNotice =
  | { kind: 'contentRecycled' } // pack épuisé → re-mélange (bandeau host)
  | { kind: 'hostDisconnected' } // pause auto (§3.4)
  | { kind: 'fewActivePlayers' }; // effectif connecté trop réduit (ex. Just One < 3)

export type GamePublicView =
  | UndercoverPublicView
  | JustOnePublicView
  | WavelengthPublicView
  | ItoPublicView
  | SpyfallPublicView
  | TabooPublicView
  | CodenamesPublicView;
export type GameMeView = {
  undercover?: UndercoverMeView;
  justone?: JustOneMeView;
  wavelength?: WavelengthMeView;
  ito?: ItoMeView;
  spyfall?: SpyfallMeView;
  taboo?: TabooMeView;
  codenames?: CodenamesMeView;
};

/**
 * Pack listé dans la modale de configuration (info publique : nom, mode,
 * taille — JAMAIS le contenu des entrées).
 */
export interface PackPublicView {
  id: string;
  name: string;
  mode: PackMode;
  entriesCount: number;
}

export type GameSelectionView =
  | { game: 'undercover'; packIds: string[]; params: UndercoverParams }
  | { game: 'justone'; packIds: string[]; params: JustOneParams }
  | { game: 'wavelength'; packIds: string[]; params: WavelengthParams }
  | { game: 'ito'; packIds: string[]; params: ItoParams }
  | { game: 'spyfall'; packIds: string[]; params: SpyfallParams }
  | { game: 'taboo'; packIds: string[]; params: TabooParams }
  | { game: 'codenames'; packIds: string[]; params: CodenamesParams };

/** Projection publique du salon — strictement identique host / miroir / joueurs. */
export interface RoomPublicView {
  code: string;
  status: RoomStatus;
  players: PlayerPublicView[];
  hostConnected: boolean;
  /** Pause auto quand l'animateur est déconnecté (§3.4). */
  paused: boolean;
  selection?: GameSelectionView;
  /** Packs ACTIFS du jeu sélectionné (la sélection cochée vit dans `selection.packIds`). */
  availablePacks: PackPublicView[];
  config: { siteName: string; internalModeLabel: string };
  /** Récap de soirée (par jeu, sans agrégation cross-jeux — §3.1). */
  recap: GameResult[];
  timers: TimerView[];
  notices: RoomNotice[];
  game?: GamePublicView;
}

/** Barre de contrôle de l'animateur — uniquement de l'info publique (§2). */
export interface HostControlsView {
  canStart: boolean;
  /** Raisons lisibles si le lancement est bloqué (effectif, contenu…). */
  startBlockers: string[];
  canNext: boolean;
  canAbort: boolean;
  activeTimer?: { id: string; paused: boolean };
  /** Joueurs retirables de la manche en cours. */
  removableIds: PlayerId[];
  /** Joueurs kickables (lobby). */
  kickableIds: PlayerId[];
}

export interface PlayerMeView {
  playerId: PlayerId;
  name: string;
  avatar: string;
  game?: GameMeView;
}

export interface ClientView {
  viewerKind: ViewerKind;
  room: RoomPublicView;
  /** Présent uniquement pour le viewer host. */
  hostControls?: HostControlsView;
  /** Présent uniquement pour un viewer joueur. */
  me?: PlayerMeView;
}
