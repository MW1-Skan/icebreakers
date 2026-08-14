/**
 * Mini pub-sub interne : les services (timers, jeux) signalent qu'un salon a
 * changé ; le gateway rediffuse les projections. Évite la dépendance circulaire
 * service → gateway.
 */
import { Injectable } from '@nestjs/common';
import type { GameEventMessage } from '../shared';
import type { Room } from './room.types';

type RoomChangedListener = (room: Room, events: GameEventMessage[]) => void;
type RoomClosedListener = (room: Room, reason: string) => void;

@Injectable()
export class RoomBus {
  private changedListeners: RoomChangedListener[] = [];
  private closedListeners: RoomClosedListener[] = [];

  onRoomChanged(listener: RoomChangedListener): void {
    this.changedListeners.push(listener);
  }

  emitRoomChanged(room: Room, events: GameEventMessage[] = []): void {
    for (const listener of this.changedListeners) listener(room, events);
  }

  onRoomClosed(listener: RoomClosedListener): void {
    this.closedListeners.push(listener);
  }

  emitRoomClosed(room: Room, reason: string): void {
    for (const listener of this.closedListeners) listener(room, reason);
  }
}
