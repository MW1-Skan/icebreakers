/**
 * `projectFor(room, viewer)` — LA règle d'or (PRD §6.3) : l'unique objet envoyé
 * à un client. host = projection publique + état des contrôles ; mirror =
 * projection publique seule. Dans les deux cas : zéro secret (écran projeté).
 */
import type {
  ClientView,
  GameMeView,
  GamePublicView,
  GameSelectionView,
  HostControlsView,
  PlayerId,
  RoomPublicView,
  RoomNotice,
  Viewer,
} from '../shared';
import {
  guardUndercover,
  resolveUndercoverParams,
  validateUndercoverSetup,
} from '../games/undercover/undercover.engine';
import { projectUndercoverMe, projectUndercoverPublic } from '../games/undercover/undercover.project';
import {
  guardJustOne,
  resolveJustOneParams,
  validateJustOneSetup,
} from '../games/justone/justone.engine';
import { projectJustOneMe, projectJustOnePublic } from '../games/justone/justone.project';
import type { ProjectionCtx, Room } from './room.types';

function connectedIdsOf(room: Room): PlayerId[] {
  return room.players.filter((p) => p.connected).map((p) => p.id);
}

function computeStartBlockers(room: Room, ctx: ProjectionCtx): string[] {
  if (!room.selection) return ['Choisis un jeu pour lancer la partie.'];
  const blockers: string[] = [];
  const playerCount = room.players.length;
  if (room.selection.game === 'undercover') {
    const params = resolveUndercoverParams(playerCount, room.selection.paramOverrides, ctx.timerDefaults);
    const setup = validateUndercoverSetup(playerCount, params);
    if (!setup.ok) blockers.push(setup.message);
  } else {
    const setup = validateJustOneSetup(playerCount);
    if (!setup.ok) blockers.push(setup.message);
  }
  const { contentMode } = room.selection;
  const contentOk =
    contentMode === 'random' ? ctx.availableModes.length > 0 : ctx.availableModes.includes(contentMode);
  if (!contentOk) blockers.push('Aucun pack de contenu disponible pour ce mode.');
  return blockers;
}

function projectSelection(room: Room, ctx: ProjectionCtx): GameSelectionView | undefined {
  if (!room.selection) return undefined;
  if (room.selection.game === 'undercover') {
    return {
      game: 'undercover',
      contentMode: room.selection.contentMode,
      params: resolveUndercoverParams(room.players.length, room.selection.paramOverrides, ctx.timerDefaults),
    };
  }
  return {
    game: 'justone',
    contentMode: room.selection.contentMode,
    params: resolveJustOneParams(room.selection.paramOverrides),
  };
}

function projectGamePublic(room: Room): GamePublicView | undefined {
  if (!room.game) return undefined;
  if (room.game.kind === 'undercover') return projectUndercoverPublic(room.game);
  return projectJustOnePublic(room.game, connectedIdsOf(room));
}

function projectPublic(room: Room, ctx: ProjectionCtx): RoomPublicView {
  const notices: RoomNotice[] = [];
  if (room.contentRecycled) notices.push({ kind: 'contentRecycled' });
  if (!room.host.connected) notices.push({ kind: 'hostDisconnected' });
  // Just One : à moins de 3 joueurs actifs, la TV suggère de passer à autre chose.
  if (
    room.game?.kind === 'justone' &&
    room.status === 'inGame' &&
    room.game.playerIds.filter((id) => connectedIdsOf(room).includes(id)).length < 3
  ) {
    notices.push({ kind: 'fewActivePlayers' });
  }

  return {
    code: room.code,
    status: room.status,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      connected: p.connected,
      disconnectedAt: p.connected ? undefined : p.disconnectedAt,
    })),
    hostConnected: room.host.connected,
    // Animateur déconnecté en partie → pause automatique (§3.4).
    paused: !room.host.connected && room.status === 'inGame',
    selection: projectSelection(room, ctx),
    availableModes: [...ctx.availableModes],
    config: { siteName: ctx.config.siteName, internalModeLabel: ctx.config.internalModeLabel },
    recap: room.sessionRecap.map((r) => ({ ...r, points: r.points.map((p) => ({ ...p })) })),
    timers: ctx.timers.map((t) => ({ ...t })),
    notices,
    game: projectGamePublic(room),
  };
}

function projectHostControls(room: Room, ctx: ProjectionCtx): HostControlsView {
  const inGame = room.status === 'inGame' && !!room.game;
  let canNext = false;
  if (inGame && room.game) {
    if (room.game.kind === 'undercover') {
      // Fin de manche non finale : « Manche suivante » (géré hors réducteur).
      canNext = room.game.phase === 'end' || guardUndercover(room.game, { type: 'HOST_NEXT' }).ok;
    } else {
      canNext = guardJustOne(room.game, { type: 'HOST_NEXT' }, { rng: () => 0, connectedIds: connectedIdsOf(room) }).ok;
    }
  } else if (room.status === 'recap') {
    canNext = true; // retour au lobby
  }
  const activeTimer = ctx.timers[0];
  return {
    canStart: room.status === 'lobby' && computeStartBlockers(room, ctx).length === 0,
    startBlockers: room.status === 'lobby' ? computeStartBlockers(room, ctx) : [],
    canNext,
    canAbort: inGame,
    activeTimer: activeTimer ? { id: activeTimer.id, paused: activeTimer.paused } : undefined,
    removableIds: inGame && room.game?.kind === 'undercover' ? [...room.game.alive] : [],
    kickableIds: room.status === 'lobby' ? room.players.map((p) => p.id) : [],
  };
}

function projectMeGame(room: Room, playerId: PlayerId): GameMeView | undefined {
  if (!room.game) return undefined;
  if (room.game.kind === 'undercover') {
    return { undercover: projectUndercoverMe(room.game, playerId) };
  }
  return { justone: projectJustOneMe(room.game, playerId, connectedIdsOf(room)) };
}

export function projectFor(room: Room, viewer: Viewer, ctx: ProjectionCtx): ClientView {
  const publicView = projectPublic(room, ctx);
  switch (viewer.kind) {
    case 'host':
      return { viewerKind: 'host', room: publicView, hostControls: projectHostControls(room, ctx) };
    case 'mirror':
      return { viewerKind: 'mirror', room: publicView };
    case 'player': {
      const player = room.players.find((p) => p.id === viewer.playerId);
      return {
        viewerKind: 'player',
        room: publicView,
        me: player
          ? {
              playerId: player.id,
              name: player.name,
              avatar: player.avatar,
              game: projectMeGame(room, player.id),
            }
          : undefined,
      };
    }
  }
}
