/**
 * Gateway Socket.IO (PRD §6.2/§6.4) : authentifier le socket → valider le
 * payload (Zod) → vérifier la légalité de l'action → appeler le réducteur →
 * rediffuser les projections. Rien d'autre — toute la logique de jeu est dans
 * les réducteurs purs.
 */
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  EVENTS,
  gameActionSchema,
  hostControlSchema,
  hostSelectGameSchema,
  mirrorJoinSchema,
  roomCreateSchema,
  roomJoinSchema,
} from '../shared';
import type {
  ActionAck,
  GameEventMessage,
  MirrorJoinAck,
  RoomCreateAck,
  RoomJoinAck,
  UndercoverAction,
  Viewer,
  WsError,
} from '../shared';
import { AppConfigService } from '../config/app-config.service';
import { GamesService } from '../games/games.service';
import { PacksService } from '../packs/packs.service';
import { RoomBus } from '../rooms/room-bus';
import { RoomService } from '../rooms/room.service';
import { TimerService } from '../rooms/timer.service';
import { projectFor } from '../rooms/project';
import type { ProjectionCtx, Room } from '../rooms/room.types';

interface SocketData {
  code?: string;
  viewer?: Viewer;
}

const DEFAULT_AVATAR = '🙂';

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('Gateway');
  @WebSocketServer() server!: Server;

  /** Sockets par salon — chaque socket reçoit SA projection, jamais l'état brut. */
  private socketsByRoom = new Map<string, Set<Socket>>();

  constructor(
    private readonly rooms: RoomService,
    private readonly games: GamesService,
    private readonly packs: PacksService,
    private readonly timers: TimerService,
    private readonly appConfig: AppConfigService,
    private readonly bus: RoomBus,
  ) {
    this.bus.onRoomChanged((room, events) => this.broadcastRoom(room, events));
    this.bus.onRoomClosed((room, reason) => this.notifyRoomClosed(room, reason));
  }

  handleConnection(): void {
    // L'authentification se fait par événement (create/join + jeton).
  }

  handleDisconnect(socket: Socket): void {
    const data = socket.data as SocketData;
    const { code, viewer } = data;
    if (!code || !viewer) return;
    this.socketsByRoom.get(code)?.delete(socket);
    const room = this.rooms.get(code);
    if (!room) return;

    if (viewer.kind === 'host') {
      // Un autre onglet host encore connecté ? (reconnexion avant fermeture)
      if (!this.hasViewer(code, (v) => v.kind === 'host')) {
        this.rooms.markHostDisconnected(room);
        if (room.status === 'inGame') {
          // §3.4 : écran projeté gelé → pause automatique des timers.
          this.timers.autoPauseAll(room.code);
        }
      }
    } else if (viewer.kind === 'player') {
      if (!this.hasViewer(code, (v) => v.kind === 'player' && v.playerId === viewer.playerId)) {
        this.rooms.markPlayerDisconnected(room, viewer.playerId);
      }
    } else if (viewer.kind === 'mirror') {
      room.mirrorConnected = this.hasViewer(code, (v) => v.kind === 'mirror');
    }
    this.broadcastRoom(room);
  }

  // ─── room:create ──────────────────────────────────────────────────────────

  @SubscribeMessage(EVENTS.roomCreate)
  onRoomCreate(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): RoomCreateAck {
    const parsed = roomCreateSchema.safeParse(body ?? {});
    if (!parsed.success) return this.badPayload();
    const seed = this.appConfig.allowSeed ? parsed.data.seed : undefined;
    const room = this.rooms.createRoom(parsed.data.teamName, seed);
    this.attach(socket, room.code, { kind: 'host' });
    this.broadcastRoom(room);
    return { ok: true, code: room.code, token: room.host.token };
  }

  // ─── room:join (nouveau joueur OU reconnexion par jeton, host compris) ────

  @SubscribeMessage(EVENTS.roomJoin)
  onRoomJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): RoomJoinAck {
    const parsed = roomJoinSchema.safeParse(body);
    if (!parsed.success) return this.badPayload();
    const { code, name, avatar, token } = parsed.data;
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: `Salon « ${code} » introuvable.` } };
    }

    if (token) {
      const found = this.rooms.reconnect(room, token);
      if (!found) {
        return { ok: false, error: { code: 'BAD_TOKEN', message: 'Session expirée — rejoins avec ton prénom.' } };
      }
      if (found.kind === 'host') {
        this.attach(socket, room.code, { kind: 'host' });
        if (room.status === 'inGame') this.timers.autoResumeAll(room.code);
        this.broadcastRoom(room);
        return { ok: true, code: room.code, playerId: 'host', token };
      }
      this.attach(socket, room.code, { kind: 'player', playerId: found.player.id });
      this.broadcastRoom(room);
      return { ok: true, code: room.code, playerId: found.player.id, token };
    }

    if (!name) {
      return { ok: false, error: { code: 'BAD_PAYLOAD', message: 'Prénom requis (2–20 caractères).' } };
    }
    const added = this.rooms.addPlayer(room, name, avatar ?? DEFAULT_AVATAR);
    if (!added.ok) return { ok: false, error: added.error };
    this.attach(socket, room.code, { kind: 'player', playerId: added.player.id });
    this.broadcastRoom(room);
    return { ok: true, code: room.code, playerId: added.player.id, token: added.token };
  }

  // ─── mirror:join (lecture seule, optionnel) ───────────────────────────────

  @SubscribeMessage(EVENTS.mirrorJoin)
  onMirrorJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): MirrorJoinAck {
    const parsed = mirrorJoinSchema.safeParse(body);
    if (!parsed.success) return this.badPayload();
    const room = this.rooms.get(parsed.data.code);
    if (!room) {
      return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: `Salon « ${parsed.data.code} » introuvable.` } };
    }
    this.attach(socket, room.code, { kind: 'mirror' });
    room.mirrorConnected = true;
    this.broadcastRoom(room);
    return { ok: true, code: room.code };
  }

  // ─── host:selectGame / host:start / host:next ─────────────────────────────

  @SubscribeMessage(EVENTS.hostSelectGame)
  onHostSelectGame(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): ActionAck {
    const ctx = this.requireHost(socket);
    if ('error' in ctx) return { ok: false, error: ctx.error };
    const parsed = hostSelectGameSchema.safeParse(body);
    if (!parsed.success) return this.badPayload();
    if (ctx.room.status === 'inGame') {
      return { ok: false, error: { code: 'ALREADY_IN_GAME', message: 'Termine la partie en cours d’abord.' } };
    }
    ctx.room.selection = {
      game: parsed.data.game,
      contentMode: parsed.data.contentMode,
      paramOverrides: parsed.data.params,
    };
    this.rooms.touch(ctx.room);
    this.broadcastRoom(ctx.room);
    return { ok: true };
  }

  @SubscribeMessage(EVENTS.hostStart)
  onHostStart(@ConnectedSocket() socket: Socket): ActionAck {
    const ctx = this.requireHost(socket);
    if ('error' in ctx) return { ok: false, error: ctx.error };
    const result = this.games.start(ctx.room);
    if (!result.ok) return result;
    return { ok: true };
  }

  @SubscribeMessage(EVENTS.hostNext)
  onHostNext(@ConnectedSocket() socket: Socket): ActionAck {
    const ctx = this.requireHost(socket);
    if ('error' in ctx) return { ok: false, error: ctx.error };
    if (ctx.room.status === 'recap') {
      this.games.backToLobby(ctx.room);
      return { ok: true };
    }
    return this.games.dispatch(ctx.room, { type: 'HOST_NEXT' });
  }

  // ─── host:control ─────────────────────────────────────────────────────────

  @SubscribeMessage(EVENTS.hostControl)
  onHostControl(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): ActionAck {
    const ctx = this.requireHost(socket);
    if ('error' in ctx) return { ok: false, error: ctx.error };
    const parsed = hostControlSchema.safeParse(body);
    if (!parsed.success) return this.badPayload();
    const { room } = ctx;
    const control = parsed.data;

    switch (control.type) {
      case 'pauseTimer':
      case 'resumeTimer':
      case 'extendTimer': {
        const activeId = this.timers.activeIds(room.code)[0];
        if (!activeId) {
          return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'Aucun timer en cours.' } };
        }
        if (control.type === 'pauseTimer') this.timers.pause(room.code, activeId);
        if (control.type === 'resumeTimer') this.timers.resume(room.code, activeId);
        if (control.type === 'extendTimer') this.timers.extend(room.code, activeId, control.seconds);
        this.rooms.touch(room);
        this.broadcastRoom(room);
        return { ok: true };
      }
      case 'removeFromRound':
        return this.games.dispatch(room, { type: 'HOST_REMOVE_PLAYER', playerId: control.playerId });
      case 'kick': {
        const kicked = this.rooms.kickPlayer(room, control.playerId);
        if (!kicked.ok) return kicked;
        this.disconnectPlayerSockets(room.code, control.playerId, {
          code: 'KICKED',
          message: 'L’animateur t’a retiré du salon.',
        });
        this.broadcastRoom(room);
        return { ok: true };
      }
      case 'abortRound': {
        if (room.status !== 'inGame') {
          return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'Aucune manche en cours.' } };
        }
        this.games.abort(room);
        return { ok: true };
      }
    }
  }

  // ─── game:action (joueurs) ────────────────────────────────────────────────

  @SubscribeMessage(EVENTS.gameAction)
  onGameAction(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): ActionAck {
    const data = socket.data as SocketData;
    if (!data.code || data.viewer?.kind !== 'player') {
      return { ok: false, error: { code: 'NOT_PLAYER', message: 'Rejoins d’abord le salon comme joueur.' } };
    }
    const room = this.rooms.get(data.code);
    if (!room) return { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'Salon fermé.' } };
    const parsed = gameActionSchema.safeParse(body);
    if (!parsed.success) return this.badPayload();

    const playerId = data.viewer.playerId;
    let action: UndercoverAction;
    switch (parsed.data.type) {
      case 'seenWord':
        action = { type: 'SEEN_WORD', playerId };
        break;
      case 'vote':
        action = { type: 'CAST_VOTE', playerId, target: parsed.data.target };
        break;
      case 'guess':
        action = { type: 'SUBMIT_GUESS', playerId, guess: parsed.data.guess };
        break;
    }
    return this.games.dispatch(room, action);
  }

  // ─── Diffusion des projections ────────────────────────────────────────────

  private projectionCtx(room: Room): ProjectionCtx {
    return {
      timers: this.timers.viewsFor(room.code),
      availableModes: this.packs.availableModesFor(room.selection?.game ?? 'undercover'),
      config: {
        siteName: this.appConfig.config.siteName,
        internalModeLabel: this.appConfig.config.internalModeLabel,
      },
      timerDefaults: this.appConfig.config.timers,
    };
  }

  private broadcastRoom(room: Room, events: GameEventMessage[] = []): void {
    const sockets = this.socketsByRoom.get(room.code);
    if (!sockets) return;
    const ctx = this.projectionCtx(room);
    for (const socket of sockets) {
      const viewer = (socket.data as SocketData).viewer;
      if (!viewer) continue;
      socket.emit(EVENTS.roomState, projectFor(room, viewer, ctx));
      for (const event of events) socket.emit(EVENTS.gameEvent, event);
    }
  }

  private notifyRoomClosed(room: Room, reason: string): void {
    const sockets = this.socketsByRoom.get(room.code);
    if (!sockets) return;
    const error: WsError = { code: 'ROOM_CLOSED', message: reason };
    for (const socket of sockets) {
      socket.emit(EVENTS.error, error);
      socket.disconnect(true);
    }
    this.socketsByRoom.delete(room.code);
  }

  // ─── Aides internes ───────────────────────────────────────────────────────

  private attach(socket: Socket, code: string, viewer: Viewer): void {
    const data = socket.data as SocketData;
    // Un socket ne représente qu'un seul viewer d'un seul salon.
    if (data.code && data.code !== code) {
      this.socketsByRoom.get(data.code)?.delete(socket);
    }
    data.code = code;
    data.viewer = viewer;
    let set = this.socketsByRoom.get(code);
    if (!set) {
      set = new Set();
      this.socketsByRoom.set(code, set);
    }
    set.add(socket);
  }

  private hasViewer(code: string, predicate: (v: Viewer) => boolean): boolean {
    const sockets = this.socketsByRoom.get(code);
    if (!sockets) return false;
    for (const socket of sockets) {
      const viewer = (socket.data as SocketData).viewer;
      if (viewer && predicate(viewer)) return true;
    }
    return false;
  }

  private disconnectPlayerSockets(code: string, playerId: string, error: WsError): void {
    const sockets = this.socketsByRoom.get(code);
    if (!sockets) return;
    for (const socket of [...sockets]) {
      const viewer = (socket.data as SocketData).viewer;
      if (viewer?.kind === 'player' && viewer.playerId === playerId) {
        socket.emit(EVENTS.error, error);
        sockets.delete(socket);
        socket.disconnect(true);
      }
    }
  }

  private requireHost(socket: Socket): { room: Room } | { error: WsError } {
    const data = socket.data as SocketData;
    if (!data.code || data.viewer?.kind !== 'host') {
      return { error: { code: 'NOT_HOST', message: 'Réservé à l’animateur.' } };
    }
    const room = this.rooms.get(data.code);
    if (!room) return { error: { code: 'ROOM_NOT_FOUND', message: 'Salon fermé.' } };
    return { room };
  }

  private badPayload(): { ok: false; error: WsError } {
    return { ok: false, error: { code: 'BAD_PAYLOAD', message: 'Requête invalide.' } };
  }
}
