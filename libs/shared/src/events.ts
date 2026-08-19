/**
 * Catalogue des événements WebSocket (PRD §6.4) + schémas Zod des payloads.
 * Le serveur valide chaque payload entrant avec ces schémas ; le client les
 * réutilise pour construire des émissions typées.
 */
import { z } from 'zod';
import type { ClientView } from './view';

// ─── Constantes d'événements ────────────────────────────────────────────────

export const EVENTS = {
  // client → serveur
  roomCreate: 'room:create',
  roomJoin: 'room:join',
  mirrorJoin: 'mirror:join',
  hostSelectGame: 'host:selectGame',
  hostStart: 'host:start',
  hostNext: 'host:next',
  hostControl: 'host:control',
  gameAction: 'game:action',
  // serveur → client
  roomState: 'room:state',
  gameEvent: 'game:event',
  error: 'error',
} as const;

// ─── Payloads client → serveur ──────────────────────────────────────────────

export const PLAYER_NAME_MIN = 2;
export const PLAYER_NAME_MAX = 20;

export const roomCreateSchema = z.object({
  teamName: z.string().trim().min(1).max(40).optional(),
  /** Seed RNG injectable — acceptée uniquement hors production (e2e déterministe). */
  seed: z.number().int().nonnegative().optional(),
});

export const roomJoinSchema = z.object({
  code: z.string().trim().toUpperCase().length(4),
  /** Absents en reconnexion par jeton. */
  name: z.string().trim().min(PLAYER_NAME_MIN).max(PLAYER_NAME_MAX).optional(),
  avatar: z.string().trim().min(1).max(8).optional(),
  token: z.string().min(8).max(128).optional(),
});

export const mirrorJoinSchema = z.object({
  code: z.string().trim().toUpperCase().length(4),
});

export const undercoverParamsSchema = z.object({
  undercoverCount: z.number().int().min(1).max(3).optional(),
  mrWhite: z.boolean().optional(),
  discussSeconds: z.number().int().min(10).max(600).optional(),
  voteSeconds: z.number().int().min(10).max(300).optional(),
  whiteGuessSeconds: z.number().int().min(10).max(120).optional(),
  publicVotes: z.boolean().optional(),
  manchesCount: z.number().int().min(1).max(5).optional(),
  describePasses: z.number().int().min(1).max(3).optional(),
});

export const justoneParamsSchema = z.object({
  manchesCount: z.number().int().min(5).max(13).optional(),
  writeSeconds: z.number().int().min(15).max(180).optional(),
  validateSeconds: z.number().int().min(10).max(120).optional(),
  guessSeconds: z.number().int().min(15).max(180).optional(),
  softPenalty: z.boolean().optional(),
});

export const wavelengthParamsSchema = z.object({
  manchesCount: z.number().int().min(1).max(10).optional(),
  placeSeconds: z.number().int().min(15).max(180).optional(),
  zoneWidth: z.number().int().min(3).max(10).optional(),
});

export const itoParamsSchema = z.object({
  manchesCount: z.number().int().min(1).max(5).optional(),
  livesCount: z.number().int().min(1).max(5).optional(),
  rangeMax: z.number().int().min(20).max(100).optional(),
  minGap: z.number().int().min(2).max(20).optional(),
});

export const spyfallParamsSchema = z.object({
  mancheSeconds: z.number().int().min(120).max(900).optional(),
  manchesCount: z.number().int().min(1).max(3).optional(),
  accusationVoteSeconds: z.number().int().min(15).max(120).optional(),
  finalVoteSeconds: z.number().int().min(15).max(120).optional(),
  spyGuessSeconds: z.number().int().min(15).max(120).optional(),
});

export const tabooParamsSchema = z.object({
  passageSeconds: z.number().int().min(30).max(120).optional(),
  passesPerTeam: z.number().int().min(1).max(3).optional(),
  hardPass: z.boolean().optional(),
  teams: z.array(z.array(z.string()).min(2).max(3)).min(2).max(5).optional(),
});

export const codenamesParamsSchema = z.object({
  gridSize: z.union([z.literal(16), z.literal(20), z.literal(25)]).optional(),
  manchesCount: z.number().int().min(1).max(3).optional(),
  /** 0 = chrono désactivé. */
  clueSeconds: z.number().int().min(0).max(300).optional(),
  guessSeconds: z.number().int().min(0).max(300).optional(),
  teams: z.tuple([z.array(z.string()).min(2), z.array(z.string()).min(2)]).optional(),
  spymasters: z.tuple([z.string(), z.string()]).optional(),
});

/**
 * Packs cochés pour la partie. Absent ou vide → défaut : TOUS les packs
 * actifs du jeu (résolu au tirage). Les ids inconnus/inactifs/d'un autre jeu
 * sont filtrés en silence côté serveur.
 */
const packIdsSchema = z.array(z.string().trim().min(1).max(80)).max(200).optional();

export const hostSelectGameSchema = z.discriminatedUnion('game', [
  z.object({
    game: z.literal('undercover'),
    packIds: packIdsSchema,
    params: undercoverParamsSchema.default({}),
  }),
  z.object({
    game: z.literal('justone'),
    packIds: packIdsSchema,
    params: justoneParamsSchema.default({}),
  }),
  z.object({
    game: z.literal('wavelength'),
    packIds: packIdsSchema,
    params: wavelengthParamsSchema.default({}),
  }),
  z.object({
    game: z.literal('ito'),
    packIds: packIdsSchema,
    params: itoParamsSchema.default({}),
  }),
  z.object({
    game: z.literal('spyfall'),
    packIds: packIdsSchema,
    params: spyfallParamsSchema.default({}),
  }),
  z.object({
    game: z.literal('taboo'),
    packIds: packIdsSchema,
    params: tabooParamsSchema.default({}),
  }),
  z.object({
    game: z.literal('codenames'),
    packIds: packIdsSchema,
    params: codenamesParamsSchema.default({}),
  }),
]);

export const hostStartSchema = z.object({}).default({});
export const hostNextSchema = z.object({}).default({});

export const hostControlSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pauseTimer') }),
  z.object({ type: z.literal('resumeTimer') }),
  z.object({ type: z.literal('extendTimer'), seconds: z.number().int().min(5).max(120).default(30) }),
  z.object({ type: z.literal('removeFromRound'), playerId: z.string() }),
  z.object({ type: z.literal('kick'), playerId: z.string() }),
  z.object({ type: z.literal('abortRound') }),
  z.object({ type: z.literal('invalidateClue') }),
  z.object({ type: z.literal('changeTheme') }),
  z.object({ type: z.literal('cancelBuzz'), countAsFound: z.boolean().default(false) }),
  z.object({ type: z.literal('transferSpymaster'), playerId: z.string() }),
]);

export const gameActionSchema = z.discriminatedUnion('type', [
  // Undercover
  z.object({ type: z.literal('seenWord') }),
  z.object({ type: z.literal('vote'), target: z.union([z.string(), z.literal('blank')]) }),
  z.object({ type: z.literal('guess'), guess: z.string().trim().min(1).max(60) }),
  // Just One + Wavelength (la règle « un seul mot » de Just One est vérifiée
  // par la garde du moteur — l'indice Wavelength admet une courte expression)
  z.object({
    type: z.literal('clue'),
    text: z.string().trim().min(1, 'Ton indice est vide.').max(60, '60 caractères maximum.'),
  }),
  z.object({ type: z.literal('flagClue'), giverId: z.string(), cancelled: z.boolean() }),
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('pass') }),
  z.object({
    type: z.literal('arbitrate'),
    decision: z.enum(['unplayable', 'accept', 'reject', 'forceClose']),
  }),
  // Wavelength
  z.object({ type: z.literal('placeSlider'), value: z.number().int().min(0).max(100) }),
  // Ito
  z.object({ type: z.literal('playCard') }),
  // Spyfall
  z.object({ type: z.literal('accuse'), accusedId: z.string() }),
  z.object({ type: z.literal('voteAccusation'), yes: z.boolean() }),
  // sans carte = « Je me révèle » (fige le jeu) ; avec carte = le choix dans la grille
  z.object({ type: z.literal('spyGuess'), card: z.string().trim().min(1).max(80).optional() }),
  // Taboo — le numéro de carte sérialise buzz/trouvé (le premier reçu fait foi)
  z.object({ type: z.literal('go') }),
  z.object({ type: z.literal('found'), cardSeq: z.number().int() }),
  z.object({ type: z.literal('passCard'), cardSeq: z.number().int() }),
  z.object({ type: z.literal('buzz'), cardSeq: z.number().int() }),
  // Codenames — `seenWord` (réutilisé) = consulter la clé ; l'indice a son
  // propre type (mot unique + nombre, à ne pas confondre avec `clue`)
  z.object({
    type: z.literal('giveClue'),
    word: z.string().trim().min(1, 'Ton indice est vide.').max(30, '30 caractères maximum.'),
    count: z.number().int().min(1).max(9),
  }),
  z.object({ type: z.literal('revealCard'), cardIndex: z.number().int().min(0).max(24) }),
  z.object({ type: z.literal('stopGuessing') }),
]);

export type RoomCreatePayload = z.infer<typeof roomCreateSchema>;
export type RoomJoinPayload = z.infer<typeof roomJoinSchema>;
export type MirrorJoinPayload = z.infer<typeof mirrorJoinSchema>;
export type HostSelectGamePayload = z.infer<typeof hostSelectGameSchema>;
export type HostControlPayload = z.infer<typeof hostControlSchema>;
export type GameActionPayload = z.infer<typeof gameActionSchema>;

// ─── Réponses (acks) et serveur → client ────────────────────────────────────

export type ErrorCode =
  | 'BAD_PAYLOAD'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_CLOSED'
  | 'NAME_TAKEN'
  | 'BAD_TOKEN'
  | 'NOT_HOST'
  | 'NOT_PLAYER'
  | 'ACTION_NOT_ALLOWED'
  | 'GAME_NOT_SELECTED'
  | 'BAD_PLAYER_COUNT'
  | 'MRWHITE_MIN_PLAYERS'
  | 'BAD_ROLE_CONFIG'
  | 'NO_CONTENT'
  | 'ALREADY_IN_GAME'
  | 'KICKED';

export interface WsError {
  code: ErrorCode;
  message: string;
}

export type Ack<T> = ({ ok: true } & T) | { ok: false; error: WsError };

export type RoomCreateAck = Ack<{ code: string; token: string }>;
export type RoomJoinAck = Ack<{ code: string; playerId: string; token: string }>;
export type MirrorJoinAck = Ack<{ code: string }>;
export type ActionAck = Ack<Record<never, never>>;

export interface GameEventMessage {
  name: string;
  payload?: Record<string, unknown>;
}

/** `room:state` transporte un `ClientView` (jamais l'état brut). */
export type RoomStateMessage = ClientView;
