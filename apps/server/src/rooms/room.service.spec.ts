import { describe, expect, it, vi } from 'vitest';
import { RoomBus } from './room-bus';
import { RoomService } from './room.service';
import { TimerService } from './timer.service';

function makeService(): { service: RoomService; bus: RoomBus } {
  const bus = new RoomBus();
  return { service: new RoomService(new TimerService(), bus), bus };
}

describe('RoomService', () => {
  it('génère des codes à 4 lettres sans O/I ni chiffres (ambiguïtés O/0, I/1)', () => {
    const { service } = makeService();
    for (let i = 0; i < 50; i++) {
      const room = service.createRoom();
      expect(room.code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    }
  });

  it('le créateur devient l’animateur : il n’est PAS dans la liste des joueurs', () => {
    const { service } = makeService();
    const room = service.createRoom();
    expect(room.players).toHaveLength(0);
    expect(room.host.token).toBeTruthy();
    expect(room.status).toBe('lobby');
  });

  it('prénoms uniques (insensible casse/accents) et salon plafonné à 10 joueurs', () => {
    const { service } = makeService();
    const room = service.createRoom();
    expect(service.addPlayer(room, 'Chloé', '🦊').ok).toBe(true);
    const dup = service.addPlayer(room, 'chloe', '🐸');
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('NAME_TAKEN');

    for (let i = 0; i < 9; i++) {
      expect(service.addPlayer(room, `Joueur${i}`, '🙂').ok).toBe(true);
    }
    const full = service.addPlayer(room, 'Onzième', '🙂');
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.error.code).toBe('ROOM_FULL');
  });

  it('reconnexion par jeton : l’animateur et un joueur retrouvent leur place', () => {
    const { service } = makeService();
    const room = service.createRoom();
    const added = service.addPlayer(room, 'Alice', '🦊');
    if (!added.ok) throw new Error('join failed');

    service.markPlayerDisconnected(room, added.player.id);
    expect(room.players[0].connected).toBe(false);
    expect(room.players[0].disconnectedAt).toBeTypeOf('number');

    const back = service.reconnect(room, added.token);
    expect(back).toMatchObject({ kind: 'player' });
    expect(room.players[0].connected).toBe(true);
    expect(room.players[0].disconnectedAt).toBeUndefined();

    service.markHostDisconnected(room);
    expect(service.reconnect(room, room.host.token)).toEqual({ kind: 'host' });
    expect(room.host.connected).toBe(true);

    expect(service.reconnect(room, 'jeton-bidon')).toBeUndefined();
  });

  it('kick possible au lobby seulement, et le jeton kické devient invalide', () => {
    const { service } = makeService();
    const room = service.createRoom();
    const added = service.addPlayer(room, 'Alice', '🦊');
    if (!added.ok) throw new Error('join failed');

    room.status = 'inGame';
    expect(service.kickPlayer(room, added.player.id).ok).toBe(false);

    room.status = 'lobby';
    expect(service.kickPlayer(room, added.player.id).ok).toBe(true);
    expect(room.players).toHaveLength(0);
    expect(service.reconnect(room, added.token)).toBeUndefined();
  });

  it('closeRoom retire le salon et notifie le bus', () => {
    const { service, bus } = makeService();
    const closed = vi.fn();
    bus.onRoomClosed(closed);
    const room = service.createRoom();
    service.closeRoom(room, 'test');
    expect(service.get(room.code)).toBeUndefined();
    expect(closed).toHaveBeenCalledWith(room, 'test');
  });
});
