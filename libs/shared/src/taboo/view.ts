/**
 * Taboo — projections par audience (fiche 5.6). La TV montre le chrono, le
 * score et le flash de buzz — JAMAIS la carte en cours ; l'orateur et les
 * arbitres la voient, le devineur non. Le récap de passage est public.
 */
import type { PlayerId } from '../types';
import type { TabooCard, TabooPassage, TabooPhase } from './types';

export interface TabooPublicView {
  kind: 'taboo';
  phase: TabooPhase;
  teams: PlayerId[][];
  /** Passage courant — sans la carte : binôme, orateur, score, compteur. */
  current?: {
    teamIndex: number;
    oratorId: PlayerId;
    guesserIds: PlayerId[];
    durationSeconds: number;
    suddenDeath: boolean;
    score: number;
    playedCount: number;
    aborted: boolean;
  };
  /** Prochains passages (ordre affiché sur la TV). */
  upcoming: Array<{ teamIndex: number; oratorId: PlayerId; suddenDeath: boolean }>;
  /** Carte buzzée = défaussée : publique (affichée 3 s, annulable par le host). */
  lastBuzz?: { card: TabooCard; cardSeq: number };
  /** Récap du passage courant (phase recap) — le devineur découvre les cartes. */
  recap?: { played: Array<{ card: TabooCard; outcome: string }>; score: number; aborted: boolean };
  /** Classement par binôme (cumul des passages terminés). */
  totals: Array<{ teamIndex: number; points: number }>;
  passagesPlayed: number;
  passagesTotal: number;
  frozen: boolean;
  /** Plus aucun arbitre connecté : le host arbitre à l'oreille (bandeau). */
  noArbiters: boolean;
  history?: TabooPassage[]; // phase end
  params: { passageSeconds: number; passesPerTeam: number; hardPass: boolean };
}

export interface TabooMeView {
  inGame: boolean;
  teamIndex?: number;
  isOrator: boolean;
  isGuesser: boolean;
  isArbiter: boolean;
  canGo: boolean;
  /** 🔒👥 La carte en cours — orateur et arbitres uniquement. */
  currentCard?: TabooCard;
  cardSeq?: number;
  canBuzz: boolean;
}
