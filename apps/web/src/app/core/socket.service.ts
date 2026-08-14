/**
 * Liaison Socket.IO : l'UI est une fonction pure de la dernière projection
 * `room:state` reçue (signal `view`). Les émissions passent par des acks typés.
 * En cas de reconnexion du socket, la session (code + jeton) est rejouée.
 */
import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { EVENTS } from '@icebreakers/shared';
import type {
  ActionAck,
  ClientView,
  ContentMode,
  GameActionPayload,
  GameEventMessage,
  HostControlPayload,
  RoomCreateAck,
  RoomJoinAck,
  UndercoverParams,
  WsError,
} from '@icebreakers/shared';

const ACK_TIMEOUT_MS = 8000;

type JoinRequest = { name: string; avatar: string } | { token: string };

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket;
  private session: { code: string; token: string } | null = null;

  readonly view = signal<ClientView | null>(null);
  readonly connected = signal(false);
  readonly lastError = signal<WsError | null>(null);
  readonly lastGameEvent = signal<GameEventMessage | null>(null);

  constructor() {
    this.socket = io({ transports: ['websocket', 'polling'] });
    this.socket.on('connect', () => {
      this.connected.set(true);
      void this.replaySession();
    });
    this.socket.on('disconnect', () => this.connected.set(false));
    this.socket.on(EVENTS.roomState, (view: ClientView) => this.view.set(view));
    this.socket.on(EVENTS.error, (error: WsError) => this.lastError.set(error));
    this.socket.on(EVENTS.gameEvent, (event: GameEventMessage) => this.lastGameEvent.set(event));
  }

  private async emitAck<T>(event: string, payload: unknown): Promise<T> {
    try {
      return (await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload)) as T;
    } catch {
      return {
        ok: false,
        error: { code: 'ROOM_NOT_FOUND', message: 'Le serveur ne répond pas — réessaie.' },
      } as T;
    }
  }

  private async replaySession(): Promise<void> {
    if (!this.session) return;
    await this.emitAck<RoomJoinAck>(EVENTS.roomJoin, {
      code: this.session.code,
      token: this.session.token,
    });
  }

  /** Oublie la session en cours (retour à l'accueil, salon fermé…). */
  resetSession(): void {
    this.session = null;
    this.view.set(null);
    this.lastError.set(null);
  }

  async createRoom(seed?: number): Promise<RoomCreateAck> {
    const ack = await this.emitAck<RoomCreateAck>(EVENTS.roomCreate, seed !== undefined ? { seed } : {});
    if (ack.ok) this.session = { code: ack.code, token: ack.token };
    return ack;
  }

  async join(code: string, request: JoinRequest): Promise<RoomJoinAck> {
    const ack = await this.emitAck<RoomJoinAck>(EVENTS.roomJoin, { code, ...request });
    if (ack.ok) this.session = { code: ack.code, token: ack.token };
    return ack;
  }

  selectGame(contentMode: ContentMode, params: Partial<UndercoverParams>): Promise<ActionAck> {
    return this.emitAck<ActionAck>(EVENTS.hostSelectGame, { game: 'undercover', contentMode, params });
  }

  start(): Promise<ActionAck> {
    return this.emitAck<ActionAck>(EVENTS.hostStart, {});
  }

  next(): Promise<ActionAck> {
    return this.emitAck<ActionAck>(EVENTS.hostNext, {});
  }

  control(payload: HostControlPayload): Promise<ActionAck> {
    return this.emitAck<ActionAck>(EVENTS.hostControl, payload);
  }

  gameAction(payload: GameActionPayload): Promise<ActionAck> {
    return this.emitAck<ActionAck>(EVENTS.gameAction, payload);
  }
}
