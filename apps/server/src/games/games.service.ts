/**
 * Orchestration des parties : tirage du contenu, appel du réducteur pur,
 * exécution des effets (timers, événements, fin de partie) et signalement
 * des changements pour rediffusion des projections.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { GameEventMessage, UndercoverAction, WsError } from '../shared';
import { AppConfigService } from '../config/app-config.service';
import { PacksService } from '../packs/packs.service';
import { RoomBus } from '../rooms/room-bus';
import { RoomService } from '../rooms/room.service';
import { TimerService } from '../rooms/timer.service';
import type { Room } from '../rooms/room.types';
import {
  buildUndercoverResult,
  guardUndercover,
  initUndercover,
  reduceUndercover,
  resolveUndercoverParams,
  undercoverManchePoints,
  validateUndercoverSetup,
} from './undercover/undercover.engine';
import type { GameEffect } from '../shared';

@Injectable()
export class GamesService {
  private readonly logger = new Logger('Games');

  constructor(
    private readonly packs: PacksService,
    private readonly timers: TimerService,
    private readonly rooms: RoomService,
    private readonly appConfig: AppConfigService,
    private readonly bus: RoomBus,
  ) {}

  /** Lance la partie sélectionnée (host:start). */
  start(room: Room): { ok: true } | { ok: false; error: WsError } {
    if (room.status !== 'lobby') {
      return { ok: false, error: { code: 'ALREADY_IN_GAME', message: 'Une partie est déjà en cours.' } };
    }
    if (!room.selection) {
      return { ok: false, error: { code: 'GAME_NOT_SELECTED', message: 'Choisis d’abord un jeu.' } };
    }
    const playerIds = room.players.map((p) => p.id);
    const params = resolveUndercoverParams(
      playerIds.length,
      room.selection.paramOverrides,
      this.appConfig.config.timers,
    );
    const setup = validateUndercoverSetup(playerIds.length, params);
    if (!setup.ok) {
      return { ok: false, error: { code: setup.code, message: setup.message } };
    }

    const drawn = this.packs.drawUndercoverEntry(
      room.selection.contentMode,
      room.usedEntryIds,
      room.rng,
      this.appConfig.config.randomWeight,
      room.teamName,
    );
    if ('error' in drawn) {
      return { ok: false, error: { code: 'NO_CONTENT', message: 'Aucun pack de contenu disponible pour ce mode.' } };
    }
    room.contentRecycled = drawn.recycled;

    const { state, effects } = initUndercover(playerIds, drawn.entry, params, { rng: room.rng });
    room.game = state;
    room.status = 'inGame';
    this.rooms.touch(room);
    this.logger.log(`Salon ${room.code} : partie Undercover lancée (${playerIds.length} joueurs).`);
    this.applyEffects(room, effects);
    return { ok: true };
  }

  /** Fait passer une action au réducteur après contrôle de légalité. */
  dispatch(room: Room, action: UndercoverAction): { ok: true } | { ok: false; error: WsError } {
    if (room.status !== 'inGame' || !room.game) {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'Aucune partie en cours.' } };
    }
    const guard = guardUndercover(room.game, action);
    if (!guard.ok) {
      return { ok: false, error: { code: guard.code, message: guard.message } };
    }
    const { state, effects } = reduceUndercover(room.game, action, { rng: room.rng });
    room.game = state;
    this.rooms.touch(room);
    this.applyEffects(room, effects);
    return { ok: true };
  }

  /**
   * Fin de manche non finale (host:next sur l'écran de fin) : nouveau tirage,
   * mêmes paramètres, cumul des points transmis. L'effectif est re-validé
   * (des joueurs ont pu partir ou arriver entre deux manches).
   */
  nextManche(room: Room): { ok: true } | { ok: false; error: WsError } {
    const game = room.game;
    if (room.status !== 'inGame' || !game || game.phase !== 'end') {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'Aucune manche à enchaîner.' } };
    }
    if (game.mancheIndex >= game.params.manchesCount) {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'La série est terminée.' } };
    }
    const playerIds = room.players.map((p) => p.id);
    const setup = validateUndercoverSetup(playerIds.length, game.params);
    if (!setup.ok) {
      return { ok: false, error: { code: setup.code, message: `${setup.message} Ajuste l’effectif ou abandonne la série.` } };
    }
    if (!room.selection) {
      return { ok: false, error: { code: 'GAME_NOT_SELECTED', message: 'Sélection de jeu perdue.' } };
    }

    const drawn = this.packs.drawUndercoverEntry(
      room.selection.contentMode,
      room.usedEntryIds,
      room.rng,
      this.appConfig.config.randomWeight,
      room.teamName,
    );
    if ('error' in drawn) {
      return { ok: false, error: { code: 'NO_CONTENT', message: 'Aucun pack de contenu disponible pour ce mode.' } };
    }
    room.contentRecycled = room.contentRecycled || drawn.recycled;

    const carriedPoints = { ...game.carriedPoints };
    for (const { playerId, points } of undercoverManchePoints(game)) {
      carriedPoints[playerId] = (carriedPoints[playerId] ?? 0) + points;
    }

    const { state, effects } = initUndercover(playerIds, drawn.entry, game.params, { rng: room.rng }, {
      mancheIndex: game.mancheIndex + 1,
      carriedPoints,
    });
    room.game = state;
    this.rooms.touch(room);
    this.logger.log(`Salon ${room.code} : manche ${state.mancheIndex}/${state.params.manchesCount}.`);
    this.applyEffects(room, effects);
    return { ok: true };
  }

  /** L'animateur abandonne la manche/série (suggestion après tours blancs, ou imprévu). */
  abort(room: Room): void {
    this.timers.cancelAll(room.code);
    // Une série écourtée garde une trace au récap si au moins une manche est finie.
    const game = room.game;
    if (game) {
      const completedManches = game.mancheIndex - 1 + (game.phase === 'end' ? 1 : 0);
      if (completedManches >= 1) {
        const result = buildUndercoverResult(game, room.players, Date.now());
        result.summary = `Série écourtée (${completedManches} manche${completedManches > 1 ? 's' : ''} jouée${completedManches > 1 ? 's' : ''}) — ${result.summary}`;
        room.sessionRecap.push(result);
      }
    }
    room.game = undefined;
    room.status = 'lobby';
    this.rooms.touch(room);
    this.bus.emitRoomChanged(room, [{ name: 'roundAborted' }]);
  }

  /** Depuis l'écran de fin : retour au lobby (rejouer ou changer de jeu). */
  backToLobby(room: Room): void {
    room.game = undefined;
    room.status = 'lobby';
    room.contentRecycled = false;
    this.rooms.touch(room);
    this.bus.emitRoomChanged(room, []);
  }

  private applyEffects(room: Room, effects: GameEffect[]): void {
    const events: GameEventMessage[] = [];
    for (const effect of effects) {
      switch (effect.type) {
        case 'timer:start':
          this.timers.start(room.code, effect.id, effect.seconds, () => {
            const result = this.dispatch(room, { type: 'TIMEOUT', timerId: effect.id });
            if (!result.ok) {
              this.logger.warn(`Salon ${room.code} : TIMEOUT ${effect.id} rejeté (${result.error.message})`);
              this.bus.emitRoomChanged(room, []);
            }
          });
          break;
        case 'timer:cancel':
          this.timers.cancel(room.code, effect.id);
          break;
        case 'game:event':
          events.push({ name: effect.name, payload: effect.payload });
          break;
        case 'game:ended': {
          this.timers.cancelAll(room.code);
          room.status = 'recap';
          if (room.game) {
            room.sessionRecap.push(buildUndercoverResult(room.game, room.players, Date.now()));
          }
          events.push({ name: 'gameEnded', payload: { winner: effect.winner } });
          break;
        }
      }
    }
    this.bus.emitRoomChanged(room, events);
  }
}
