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

export const hostSelectGameSchema = z.object({
  game: z.literal('undercover'),
  contentMode: z.enum(['interne', 'normal', 'random']),
  params: undercoverParamsSchema.default({}),
});

export const hostStartSchema = z.object({}).default({});
export const hostNextSchema = z.object({}).default({});

export const hostControlSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pauseTimer') }),
  z.object({ type: z.literal('resumeTimer') }),
  z.object({ type: z.literal('extendTimer'), seconds: z.number().int().min(5).max(120).default(30) }),
  z.object({ type: z.literal('removeFromRound'), playerId: z.string() }),
  z.object({ type: z.literal('kick'), playerId: z.string() }),
  z.object({ type: z.literal('abortRound') }),
]);

export const gameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('seenWord') }),
  z.object({ type: z.literal('vote'), target: z.union([z.string(), z.literal('blank')]) }),
  z.object({ type: z.literal('guess'), guess: z.string().trim().min(1).max(60) }),
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
