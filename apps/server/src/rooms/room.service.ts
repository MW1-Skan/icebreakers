/**
 * Salons en mémoire (`Map<roomCode, Room>`, PRD §6.1/§6.5) — aucune base de
 * données, sessions éphémères, fermeture auto après 2 h d'inactivité.
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mulberry32, normalizeText, randomSeed } from '../shared';
import type { Player, PlayerId, WsError } from '../shared';
import { RoomBus } from './room-bus';
import { TimerService } from './timer.service';
import type { Room } from './room.types';

/** Sans ambiguïtés O/0 et I/1 (PRD §3.1). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_MAX_PLAYERS = 10; // le produit supporte 3 à 10 joueurs actifs (§1.2)
const ROOM_IDLE_CLOSE_MS = 2 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export type JoinResult =
  | { ok: true; kind: 'player'; room: Room; playerId: PlayerId; token: string }
  | { ok: true; kind: 'host'; room: Room }
  | { ok: false; error: WsError };

@Injectable()
export class RoomService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Rooms');
  readonly rooms = new Map<string, Room>();
  private sweeper?: NodeJS.Timeout;

  constructor(
    private readonly timers: TimerService,
    private readonly bus: RoomBus,
  ) {}

  onModuleInit(): void {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  createRoom(teamName?: string, seed?: number): Room {
    const code = this.generateCode();
    const room: Room = {
      code,
      teamName,
      host: { token: randomUUID(), connected: true },
      players: [],
      playerTokens: new Map(),
      mirrorConnected: false,
      status: 'lobby',
      sessionRecap: [],
      usedEntryIds: new Set(),
      contentRecycled: false,
      rng: mulberry32(seed ?? randomSeed()),
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    this.rooms.set(code, room);
    this.logger.log(`Salon ${code} créé${seed !== undefined ? ` (seed ${seed})` : ''}`);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  touch(room: Room): void {
    room.lastActivityAt = Date.now();
  }

  /** Rejoindre en tant que nouveau joueur (prénom obligatoire, unique, salon non plein). */
  addPlayer(room: Room, name: string, avatar: string): { ok: true; player: Player; token: string } | { ok: false; error: WsError } {
    if (room.players.length >= ROOM_MAX_PLAYERS) {
      return { ok: false, error: { code: 'ROOM_FULL', message: `Salon complet (${ROOM_MAX_PLAYERS} joueurs max).` } };
    }
    const normalized = normalizeText(name);
    if (room.players.some((p) => normalizeText(p.name) === normalized)) {
      return { ok: false, error: { code: 'NAME_TAKEN', message: `Le prénom « ${name} » est déjà pris.` } };
    }
    const player: Player = {
      id: randomUUID(),
      name,
      avatar,
      connected: true,
      joinedAt: Date.now(),
    };
    const token = randomUUID();
    room.players.push(player);
    room.playerTokens.set(token, player.id);
    this.touch(room);
    return { ok: true, player, token };
  }

  /** Reconnexion par jeton (§3.4) : l'animateur ou un joueur retrouve sa place. */
  reconnect(room: Room, token: string): { kind: 'host' } | { kind: 'player'; player: Player } | undefined {
    if (room.host.token === token) {
      room.host.connected = true;
      room.host.disconnectedAt = undefined;
      this.touch(room);
      return { kind: 'host' };
    }
    const playerId = room.playerTokens.get(token);
    if (!playerId) return undefined;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return undefined;
    player.connected = true;
    player.disconnectedAt = undefined;
    this.touch(room);
    return { kind: 'player', player };
  }

  markPlayerDisconnected(room: Room, playerId: PlayerId): void {
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;
    player.connected = false;
    player.disconnectedAt = Date.now();
  }

  markHostDisconnected(room: Room): void {
    room.host.connected = false;
    room.host.disconnectedAt = Date.now();
  }

  /** Kick (lobby uniquement — en partie, c'est « retirer de la manche »). */
  kickPlayer(room: Room, playerId: PlayerId): { ok: true } | { ok: false; error: WsError } {
    if (room.status !== 'lobby') {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'Kick possible uniquement au lobby.' } };
    }
    const index = room.players.findIndex((p) => p.id === playerId);
    if (index === -1) {
      return { ok: false, error: { code: 'NOT_PLAYER', message: 'Joueur introuvable.' } };
    }
    room.players.splice(index, 1);
    for (const [token, id] of room.playerTokens) {
      if (id === playerId) room.playerTokens.delete(token);
    }
    this.touch(room);
    return { ok: true };
  }

  private generateCode(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Impossible de générer un code de salon unique.');
  }

  private sweep(): void {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      if (now - room.lastActivityAt > ROOM_IDLE_CLOSE_MS) {
        this.closeRoom(room, 'Salon fermé après 2 h d’inactivité.');
      }
    }
  }

  closeRoom(room: Room, reason: string): void {
    this.timers.cancelAll(room.code);
    this.rooms.delete(room.code);
    this.bus.emitRoomClosed(room, reason);
    this.logger.log(`Salon ${room.code} fermé : ${reason}`);
  }
}
