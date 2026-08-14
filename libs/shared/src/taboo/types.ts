/**
 * Taboo — état serveur de la machine (fiche 5.6 du PRD) : binômes, passages
 * de 60 s, buzz des arbitres.
 *
 * ⚠️ `deck` (cartes à venir) et la carte COURANTE : jamais vers la TV, le
 * miroir ni le devineur. La carte courante est restreinte à l'orateur et aux
 * arbitres ; une carte buzzée devient publique (défaussée, affichée 3 s).
 */
import type { PlayerId } from '../types';

export type TabooPhase = 'prep' | 'live' | 'recap' | 'end';

export interface TabooParams {
  passageSeconds: number; // 60 par défaut
  passesPerTeam: number; // 2 par défaut (1–3)
  /** Mode dur : une passe vaut −1 (0 par défaut). */
  hardPass: boolean;
  /** Binômes imposés par l'animateur (sinon tirage aléatoire). */
  teams?: PlayerId[][];
}

export interface TabooCard {
  word: string;
  forbidden: string[];
}

export type TabooCardOutcome = 'found' | 'passed' | 'buzzed' | 'buzzCancelled' | 'buzzFound';

export interface TabooPlayedCard {
  card: TabooCard;
  outcome: TabooCardOutcome;
}

export interface TabooPassageSpec {
  teamIndex: number;
  oratorId: PlayerId;
  durationSeconds: number;
  suddenDeath: boolean;
}

export interface TabooPassage extends TabooPassageSpec {
  guesserIds: PlayerId[];
  played: TabooPlayedCard[];
  score: number;
  aborted: boolean;
}

export interface TabooState {
  kind: 'taboo';
  phase: TabooPhase;
  params: TabooParams;
  playerIds: PlayerId[];
  /** Binômes fixes pour la partie (un trio tournant si effectif impair). */
  teams: PlayerId[][];
  /** Passages à venir (après le courant). */
  schedule: TabooPassageSpec[];
  current?: TabooPassage;
  /** 🔒 Cartes restantes — la première est la carte en cours pendant un passage. */
  deck: TabooCard[];
  /** Cartes jouées des passages PRÉCÉDENTS (re-mélange si deck épuisé). */
  discardPool: TabooCard[];
  /** Numéro de la carte courante — les actions le citent (sérialisation buzz/trouvé). */
  cardSeq: number;
  passages: TabooPassage[];
  /** Dernière carte buzzée (publique : défaussée, affichée 3 s, annulable). */
  lastBuzz?: { card: TabooCard; cardSeq: number };
  /** Orateur/devineur déconnecté : chrono en pause (30 s avant annulation). */
  frozen: boolean;
  /** Passages déjà rejoués (un seul rejeu par passage annulé). */
  replayedKeys: string[];
  suddenDeathDone: boolean;
}

export type TabooTimerId = 'passage' | 'playerGone';

export type TabooAction =
  | { type: 'GO'; playerId: PlayerId }
  | { type: 'FOUND'; playerId: PlayerId; cardSeq: number }
  | { type: 'PASS_CARD'; playerId: PlayerId; cardSeq: number }
  | { type: 'BUZZ'; playerId: PlayerId; cardSeq: number }
  | { type: 'HOST_CANCEL_BUZZ'; countAsFound: boolean }
  | { type: 'HOST_NEXT' }
  | { type: 'TIMEOUT'; timerId: TabooTimerId }
  | { type: 'PLAYER_GONE' }
  | { type: 'PLAYER_BACK' };

export const TABOO_MIN_PLAYERS = 4;
export const TABOO_MAX_PLAYERS = 10;
export const TABOO_SUDDEN_DEATH_SECONDS = 30;
