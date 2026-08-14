/**
 * Orchestration des parties : tirage du contenu, appel du réducteur pur du jeu
 * sélectionné, exécution des effets (timers, événements, fin de partie) et
 * signalement des changements pour rediffusion des projections.
 */
import { Injectable, Logger } from '@nestjs/common';
import type {
  GameEventMessage,
  ItoAction,
  JustOneAction,
  PlayerId,
  UndercoverAction,
  WavelengthAction,
  WsError,
} from '../shared';
import { AppConfigService } from '../config/app-config.service';
import { PacksService } from '../packs/packs.service';
import { RoomBus } from '../rooms/room-bus';
import { RoomService } from '../rooms/room.service';
import { TimerService } from '../rooms/timer.service';
import type { Room } from '../rooms/room.types';
import type { EngineCtx } from './engine';
import {
  buildUndercoverResult,
  guardUndercover,
  initUndercover,
  reduceUndercover,
  resolveUndercoverParams,
  undercoverManchePoints,
  validateUndercoverSetup,
} from './undercover/undercover.engine';
import {
  applyJustOneRedraw,
  buildJustOneResult,
  canRedrawWord,
  guardJustOne,
  initJustOne,
  reduceJustOne,
  resolveJustOneParams,
  startNextJustOneManche,
  validateJustOneSetup,
} from './justone/justone.engine';
import {
  buildWavelengthResult,
  guardWavelength,
  initWavelength,
  reduceWavelength,
  resolveWavelengthParams,
  startNextWavelengthTurn,
  validateWavelengthSetup,
} from './wavelength/wavelength.engine';
import {
  applyThemeChange,
  buildItoResult,
  canChangeTheme,
  guardIto,
  initIto,
  reduceIto,
  resolveItoParams,
  startNextItoManche,
  validateItoSetup,
} from './ito/ito.engine';
import type { GameEffect } from '../shared';

export type GameAction = UndercoverAction | JustOneAction | WavelengthAction | ItoAction;

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

  private engineCtx(room: Room): EngineCtx {
    return {
      rng: room.rng,
      connectedIds: room.players.filter((p) => p.connected).map((p) => p.id),
    };
  }

  /** Lance la partie sélectionnée (host:start). */
  start(room: Room): { ok: true } | { ok: false; error: WsError } {
    if (room.status !== 'lobby') {
      return { ok: false, error: { code: 'ALREADY_IN_GAME', message: 'Une partie est déjà en cours.' } };
    }
    if (!room.selection) {
      return { ok: false, error: { code: 'GAME_NOT_SELECTED', message: 'Choisis d’abord un jeu.' } };
    }
    switch (room.selection.game) {
      case 'undercover':
        return this.startUndercover(room);
      case 'justone':
        return this.startJustOne(room);
      case 'wavelength':
        return this.startWavelength(room);
      case 'ito':
        return this.startIto(room);
    }
  }

  private startWavelength(room: Room): { ok: true } | { ok: false; error: WsError } {
    const selection = room.selection!;
    if (selection.game !== 'wavelength') throw new Error('unreachable');
    const playerIds = room.players.map((p) => p.id);
    const setup = validateWavelengthSetup(playerIds.length);
    if (!setup.ok) return { ok: false, error: { code: setup.code, message: setup.message } };
    const params = resolveWavelengthParams(playerIds.length, selection.paramOverrides);

    const drawn = this.packs.drawWavelengthEntry(
      selection.contentMode,
      room.usedEntryIds,
      room.rng,
      this.appConfig.config.randomWeight,
      room.teamName,
    );
    if ('error' in drawn) {
      return { ok: false, error: { code: 'NO_CONTENT', message: 'Aucun pack de contenu disponible pour ce mode.' } };
    }
    room.contentRecycled = drawn.recycled;

    const { state, effects } = initWavelength(playerIds, drawn.entry, params, this.engineCtx(room));
    room.game = state;
    room.status = 'inGame';
    this.rooms.touch(room);
    this.logger.log(`Salon ${room.code} : Wavelength lancé (${playerIds.length} joueurs).`);
    this.applyEffects(room, effects);
    return { ok: true };
  }

  private startIto(room: Room): { ok: true } | { ok: false; error: WsError } {
    const selection = room.selection!;
    if (selection.game !== 'ito') throw new Error('unreachable');
    const playerIds = room.players.map((p) => p.id);
    const setup = validateItoSetup(playerIds.length);
    if (!setup.ok) return { ok: false, error: { code: setup.code, message: setup.message } };
    const params = resolveItoParams(selection.paramOverrides);

    const drawn = this.packs.drawItoEntry(
      selection.contentMode,
      room.usedEntryIds,
      room.rng,
      this.appConfig.config.randomWeight,
      room.teamName,
    );
    if ('error' in drawn) {
      return { ok: false, error: { code: 'NO_CONTENT', message: 'Aucun pack de contenu disponible pour ce mode.' } };
    }
    room.contentRecycled = drawn.recycled;

    const { state, effects } = initIto(playerIds, drawn.entry.theme, params, this.engineCtx(room));
    room.game = state;
    room.status = 'inGame';
    this.rooms.touch(room);
    this.logger.log(`Salon ${room.code} : Ito lancé (${playerIds.length} joueurs).`);
    this.applyEffects(room, effects);
    return { ok: true };
  }

  private startUndercover(room: Room): { ok: true } | { ok: false; error: WsError } {
    const selection = room.selection!;
    if (selection.game !== 'undercover') throw new Error('unreachable');
    const playerIds = room.players.map((p) => p.id);
    const params = resolveUndercoverParams(playerIds.length, selection.paramOverrides, this.appConfig.config.timers);
    const setup = validateUndercoverSetup(playerIds.length, params);
    if (!setup.ok) return { ok: false, error: { code: setup.code, message: setup.message } };

    const drawn = this.packs.drawUndercoverEntry(
      selection.contentMode,
      room.usedEntryIds,
      room.rng,
      this.appConfig.config.randomWeight,
      room.teamName,
    );
    if ('error' in drawn) {
      return { ok: false, error: { code: 'NO_CONTENT', message: 'Aucun pack de contenu disponible pour ce mode.' } };
    }
    room.contentRecycled = drawn.recycled;

    const { state, effects } = initUndercover(playerIds, drawn.entry, params, this.engineCtx(room));
    room.game = state;
    room.status = 'inGame';
    this.rooms.touch(room);
    this.logger.log(`Salon ${room.code} : Undercover lancé (${playerIds.length} joueurs).`);
    this.applyEffects(room, effects);
    return { ok: true };
  }

  private startJustOne(room: Room): { ok: true } | { ok: false; error: WsError } {
    const selection = room.selection!;
    if (selection.game !== 'justone') throw new Error('unreachable');
    const playerIds = room.players.map((p) => p.id);
    const setup = validateJustOneSetup(playerIds.length);
    if (!setup.ok) return { ok: false, error: { code: setup.code, message: setup.message } };
    const params = resolveJustOneParams(selection.paramOverrides);

    const drawn = this.packs.drawJustOneEntry(
      selection.contentMode,
      room.usedEntryIds,
      room.rng,
      this.appConfig.config.randomWeight,
      room.teamName,
    );
    if ('error' in drawn) {
      return { ok: false, error: { code: 'NO_CONTENT', message: 'Aucun pack de contenu disponible pour ce mode.' } };
    }
    room.contentRecycled = drawn.recycled;

    const { state, effects } = initJustOne(playerIds, drawn.entry.word, params);
    room.game = state;
    room.status = 'inGame';
    this.rooms.touch(room);
    this.logger.log(`Salon ${room.code} : Just One lancé (${playerIds.length} joueurs).`);
    this.applyEffects(room, effects);
    return { ok: true };
  }

  /** Fait passer une action au réducteur du jeu en cours après contrôle de légalité. */
  dispatch(room: Room, action: GameAction): { ok: true } | { ok: false; error: WsError } {
    if (room.status !== 'inGame' || !room.game) {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'Aucune partie en cours.' } };
    }
    const ctx = this.engineCtx(room);
    if (room.game.kind === 'undercover') {
      const ucAction = action as UndercoverAction;
      const guard = guardUndercover(room.game, ucAction);
      if (!guard.ok) return { ok: false, error: { code: guard.code, message: guard.message } };
      const { state, effects } = reduceUndercover(room.game, ucAction, ctx);
      room.game = state;
      this.rooms.touch(room);
      this.applyEffects(room, effects);
      return { ok: true };
    }
    if (room.game.kind === 'justone') {
      const joAction = action as JustOneAction;
      const guard = guardJustOne(room.game, joAction, ctx);
      if (!guard.ok) return { ok: false, error: { code: guard.code, message: guard.message } };
      const { state, effects } = reduceJustOne(room.game, joAction, ctx);
      room.game = state;
      this.rooms.touch(room);
      this.applyEffects(room, effects);
      return { ok: true };
    }
    if (room.game.kind === 'wavelength') {
      const wlAction = action as WavelengthAction;
      const guard = guardWavelength(room.game, wlAction, ctx);
      if (!guard.ok) return { ok: false, error: { code: guard.code, message: guard.message } };
      const { state, effects } = reduceWavelength(room.game, wlAction, ctx);
      room.game = state;
      this.rooms.touch(room);
      this.applyEffects(room, effects);
      return { ok: true };
    }
    const itoAction = action as ItoAction;
    const guard = guardIto(room.game, itoAction, ctx);
    if (!guard.ok) return { ok: false, error: { code: guard.code, message: guard.message } };
    const { state, effects } = reduceIto(room.game, itoAction, ctx);
    room.game = state;
    this.rooms.touch(room);
    this.applyEffects(room, effects);
    return { ok: true };
  }

  /** Wavelength — tour suivant (host:next depuis la révélation ou une annulation). */
  nextWavelengthTurn(room: Room): { ok: true } | { ok: false; error: WsError } {
    const game = room.game;
    if (
      room.status !== 'inGame' ||
      !game ||
      game.kind !== 'wavelength' ||
      (game.phase !== 'reveal' && game.phase !== 'aborted')
    ) {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'Aucun tour à enchaîner.' } };
    }
    if (game.telepathQueue.length === 0) {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'La partie est terminée.' } };
    }
    if (!room.selection) {
      return { ok: false, error: { code: 'GAME_NOT_SELECTED', message: 'Sélection de jeu perdue.' } };
    }
    const drawn = this.packs.drawWavelengthEntry(
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
    const next = startNextWavelengthTurn(game, drawn.entry, this.engineCtx(room));
    if (!next) {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'La partie est terminée.' } };
    }
    room.game = next.state;
    this.rooms.touch(room);
    this.applyEffects(room, next.effects);
    return { ok: true };
  }

  /** Ito — manche suivante (host:next depuis la fin de manche). */
  nextItoManche(room: Room): { ok: true } | { ok: false; error: WsError } {
    const game = room.game;
    if (room.status !== 'inGame' || !game || game.kind !== 'ito' || game.phase !== 'mancheEnd') {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'Aucune manche à enchaîner.' } };
    }
    if (!room.selection) {
      return { ok: false, error: { code: 'GAME_NOT_SELECTED', message: 'Sélection de jeu perdue.' } };
    }
    const drawn = this.packs.drawItoEntry(
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
    const next = startNextItoManche(game, drawn.entry.theme, this.engineCtx(room));
    if (!next) {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'La partie est terminée.' } };
    }
    room.game = next.state;
    this.rooms.touch(room);
    this.applyEffects(room, next.effects);
    return { ok: true };
  }

  /** Ito — « Changer de thème » (host, uniquement avant la première pose). */
  itoChangeTheme(room: Room): { ok: true } | { ok: false; error: WsError } {
    const game = room.game;
    if (room.status !== 'inGame' || !game || game.kind !== 'ito') {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'Aucune partie Ito en cours.' } };
    }
    const guard = canChangeTheme(game);
    if (!guard.ok) return { ok: false, error: { code: guard.code, message: guard.message } };
    if (!room.selection) {
      return { ok: false, error: { code: 'GAME_NOT_SELECTED', message: 'Sélection de jeu perdue.' } };
    }
    const drawn = this.packs.drawItoEntry(
      room.selection.contentMode,
      room.usedEntryIds,
      room.rng,
      this.appConfig.config.randomWeight,
      room.teamName,
    );
    if ('error' in drawn) {
      return { ok: false, error: { code: 'NO_CONTENT', message: 'Aucun autre thème disponible.' } };
    }
    room.contentRecycled = room.contentRecycled || drawn.recycled;
    const { state, effects } = applyThemeChange(game, drawn.entry.theme);
    room.game = state;
    this.rooms.touch(room);
    this.applyEffects(room, effects);
    return { ok: true };
  }

  /**
   * Undercover — fin de manche non finale : nouveau tirage, mêmes paramètres,
   * cumul transmis, effectif re-validé.
   */
  nextManche(room: Room): { ok: true } | { ok: false; error: WsError } {
    const game = room.game;
    if (room.status !== 'inGame' || !game || game.kind !== 'undercover' || game.phase !== 'end') {
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

    const { state, effects } = initUndercover(playerIds, drawn.entry, game.params, this.engineCtx(room), {
      mancheIndex: game.mancheIndex + 1,
      carriedPoints,
    });
    room.game = state;
    this.rooms.touch(room);
    this.logger.log(`Salon ${room.code} : manche ${state.mancheIndex}/${state.params.manchesCount}.`);
    this.applyEffects(room, effects);
    return { ok: true };
  }

  /** Just One — manche suivante (host:next depuis la résolution). */
  nextJustOneManche(room: Room): { ok: true } | { ok: false; error: WsError } {
    const game = room.game;
    if (room.status !== 'inGame' || !game || game.kind !== 'justone' || game.phase !== 'resolve') {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'Aucune manche à enchaîner.' } };
    }
    if (game.mancheIndex >= game.params.manchesCount) {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'La partie est terminée.' } };
    }
    if (!room.selection) {
      return { ok: false, error: { code: 'GAME_NOT_SELECTED', message: 'Sélection de jeu perdue.' } };
    }
    const drawn = this.packs.drawJustOneEntry(
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
    const { state, effects } = startNextJustOneManche(game, drawn.entry.word);
    room.game = state;
    this.rooms.touch(room);
    this.applyEffects(room, effects);
    return { ok: true };
  }

  /** Just One — « Mot injouable » : l'arbitre demande un autre mot (1×/manche). */
  justOneRedraw(room: Room, actorId: PlayerId): { ok: true } | { ok: false; error: WsError } {
    const game = room.game;
    if (room.status !== 'inGame' || !game || game.kind !== 'justone') {
      return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'Aucune partie Just One en cours.' } };
    }
    const guard = canRedrawWord(game, actorId, this.engineCtx(room));
    if (!guard.ok) return { ok: false, error: { code: guard.code, message: guard.message } };
    if (!room.selection) {
      return { ok: false, error: { code: 'GAME_NOT_SELECTED', message: 'Sélection de jeu perdue.' } };
    }
    const drawn = this.packs.drawJustOneEntry(
      room.selection.contentMode,
      room.usedEntryIds,
      room.rng,
      this.appConfig.config.randomWeight,
      room.teamName,
    );
    if ('error' in drawn) {
      return { ok: false, error: { code: 'NO_CONTENT', message: 'Aucun autre mot disponible.' } };
    }
    room.contentRecycled = room.contentRecycled || drawn.recycled;
    const { state, effects } = applyJustOneRedraw(game, drawn.entry.word);
    room.game = state;
    this.rooms.touch(room);
    this.applyEffects(room, effects);
    return { ok: true };
  }

  /** L'animateur abandonne la manche/partie (suggestion après tours blancs, ou imprévu). */
  abort(room: Room): void {
    this.timers.cancelAll(room.code);
    const game = room.game;
    if (game?.kind === 'undercover') {
      // Une série écourtée garde une trace au récap si au moins une manche est finie.
      const completedManches = game.mancheIndex - 1 + (game.phase === 'end' ? 1 : 0);
      if (completedManches >= 1) {
        const result = buildUndercoverResult(game, room.players, Date.now());
        result.summary = `Série écourtée (${completedManches} manche${completedManches > 1 ? 's' : ''} jouée${completedManches > 1 ? 's' : ''}) — ${result.summary}`;
        room.sessionRecap.push(result);
      }
    } else if (game?.kind === 'justone' && game.history.length >= 1) {
      const result = buildJustOneResult(game, room.players, Date.now());
      result.summary = `Partie écourtée (${game.history.length} manche${game.history.length > 1 ? 's' : ''}) — ${result.summary}`;
      room.sessionRecap.push(result);
    } else if (game?.kind === 'wavelength' && game.history.some((h) => !h.aborted)) {
      const result = buildWavelengthResult(game, room.players, Date.now());
      result.summary = `Partie écourtée — ${result.summary}`;
      room.sessionRecap.push(result);
    } else if (game?.kind === 'ito' && game.history.length >= 1) {
      const result = buildItoResult(game, room.players, Date.now());
      result.summary = `Partie écourtée (${game.history.length} manche${game.history.length > 1 ? 's' : ''}) — ${result.summary}`;
      room.sessionRecap.push(result);
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
            const result = this.dispatch(room, { type: 'TIMEOUT', timerId: effect.id } as GameAction);
            if (!result.ok) {
              this.logger.warn(`Salon ${room.code} : TIMEOUT ${effect.id} rejeté (${result.error.message})`);
              this.bus.emitRoomChanged(room, []);
            }
          });
          break;
        case 'timer:cancel':
          this.timers.cancel(room.code, effect.id);
          break;
        case 'timer:pause':
          this.timers.pause(room.code, effect.id, 'auto');
          break;
        case 'timer:resume':
          this.timers.resume(room.code, effect.id);
          break;
        case 'game:event':
          events.push({ name: effect.name, payload: effect.payload });
          break;
        case 'game:ended': {
          this.timers.cancelAll(room.code);
          room.status = 'recap';
          if (room.game?.kind === 'undercover') {
            room.sessionRecap.push(buildUndercoverResult(room.game, room.players, Date.now()));
          } else if (room.game?.kind === 'justone') {
            room.sessionRecap.push(buildJustOneResult(room.game, room.players, Date.now()));
          } else if (room.game?.kind === 'wavelength') {
            room.sessionRecap.push(buildWavelengthResult(room.game, room.players, Date.now()));
          } else if (room.game?.kind === 'ito') {
            room.sessionRecap.push(buildItoResult(room.game, room.players, Date.now()));
          }
          events.push({ name: 'gameEnded', payload: effect.winner ? { winner: effect.winner } : undefined });
          break;
        }
      }
    }
    this.bus.emitRoomChanged(room, events);
  }
}
