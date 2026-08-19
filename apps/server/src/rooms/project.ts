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
import {
  guardWavelength,
  resolveWavelengthParams,
  validateWavelengthSetup,
} from '../games/wavelength/wavelength.engine';
import { projectWavelengthMe, projectWavelengthPublic } from '../games/wavelength/wavelength.project';
import { guardIto, resolveItoParams, validateItoSetup } from '../games/ito/ito.engine';
import { projectItoMe, projectItoPublic } from '../games/ito/ito.project';
import {
  guardSpyfall,
  resolveSpyfallParams,
  validateSpyfallSetup,
} from '../games/spyfall/spyfall.engine';
import { projectSpyfallMe, projectSpyfallPublic } from '../games/spyfall/spyfall.project';
import { guardTaboo, resolveTabooParams, validateTabooSetup } from '../games/taboo/taboo.engine';
import { projectTabooMe, projectTabooPublic } from '../games/taboo/taboo.project';
import {
  guardCodenames,
  resolveCodenamesParams,
  validateCodenamesSetup,
} from '../games/codenames/codenames.engine';
import { projectCodenamesMe, projectCodenamesPublic } from '../games/codenames/codenames.project';
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
  } else if (room.selection.game === 'justone') {
    const setup = validateJustOneSetup(playerCount);
    if (!setup.ok) blockers.push(setup.message);
  } else if (room.selection.game === 'wavelength') {
    const setup = validateWavelengthSetup(playerCount);
    if (!setup.ok) blockers.push(setup.message);
  } else if (room.selection.game === 'ito') {
    const setup = validateItoSetup(playerCount);
    if (!setup.ok) blockers.push(setup.message);
  } else if (room.selection.game === 'spyfall') {
    const setup = validateSpyfallSetup(playerCount);
    if (!setup.ok) blockers.push(setup.message);
  } else if (room.selection.game === 'codenames') {
    const setup = validateCodenamesSetup(playerCount);
    if (!setup.ok) blockers.push(setup.message);
  } else {
    const setup = validateTabooSetup(playerCount);
    if (!setup.ok) blockers.push(setup.message);
  }
  if (ctx.selectedPackIds.length === 0) {
    blockers.push('Aucun pack de contenu sélectionné pour ce jeu.');
  } else if (room.selection.game === 'codenames') {
    // La grille exige assez de mots DISTINCTS dans l'union des packs cochés.
    const params = resolveCodenamesParams(room.selection.paramOverrides);
    if (ctx.codenamesDistinctWords !== undefined && ctx.codenamesDistinctWords < params.gridSize) {
      blockers.push(
        `Il faut au moins ${params.gridSize} mots distincts dans les packs cochés (${ctx.codenamesDistinctWords} disponibles).`,
      );
    }
  }
  return blockers;
}

function projectSelection(room: Room, ctx: ProjectionCtx): GameSelectionView | undefined {
  if (!room.selection) return undefined;
  // Les ids cochés projetés sont la sélection RÉSOLUE (packs encore actifs).
  const packIds = [...ctx.selectedPackIds];
  switch (room.selection.game) {
    case 'undercover':
      return {
        game: 'undercover',
        packIds,
        params: resolveUndercoverParams(room.players.length, room.selection.paramOverrides, ctx.timerDefaults),
      };
    case 'justone':
      return {
        game: 'justone',
        packIds,
        params: resolveJustOneParams(room.selection.paramOverrides),
      };
    case 'wavelength':
      return {
        game: 'wavelength',
        packIds,
        params: resolveWavelengthParams(room.players.length, room.selection.paramOverrides),
      };
    case 'ito':
      return {
        game: 'ito',
        packIds,
        params: resolveItoParams(room.selection.paramOverrides),
      };
    case 'spyfall':
      return {
        game: 'spyfall',
        packIds,
        params: resolveSpyfallParams(room.selection.paramOverrides),
      };
    case 'taboo':
      return {
        game: 'taboo',
        packIds,
        params: resolveTabooParams(room.selection.paramOverrides),
      };
    case 'codenames':
      return {
        game: 'codenames',
        packIds,
        params: resolveCodenamesParams(room.selection.paramOverrides),
      };
  }
}

function projectGamePublic(room: Room): GamePublicView | undefined {
  if (!room.game) return undefined;
  switch (room.game.kind) {
    case 'undercover':
      return projectUndercoverPublic(room.game);
    case 'justone':
      return projectJustOnePublic(room.game, connectedIdsOf(room));
    case 'wavelength':
      return projectWavelengthPublic(room.game, connectedIdsOf(room));
    case 'ito':
      return projectItoPublic(room.game);
    case 'spyfall':
      return projectSpyfallPublic(room.game, connectedIdsOf(room));
    case 'taboo':
      return projectTabooPublic(room.game, connectedIdsOf(room));
    case 'codenames':
      return projectCodenamesPublic(room.game);
  }
}

function projectPublic(room: Room, ctx: ProjectionCtx): RoomPublicView {
  const notices: RoomNotice[] = [];
  if (room.contentRecycled) notices.push({ kind: 'contentRecycled' });
  if (!room.host.connected) notices.push({ kind: 'hostDisconnected' });
  // Just One / Wavelength : à moins de 3 joueurs actifs, bandeau TV (fiches 5.2/5.3).
  if (
    (room.game?.kind === 'justone' || room.game?.kind === 'wavelength') &&
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
    availablePacks: ctx.availablePacks.map((p) => ({ ...p })),
    config: { siteName: ctx.config.siteName, internalModeLabel: ctx.config.internalModeLabel },
    recap: room.sessionRecap.map((r) => ({ ...r, points: r.points.map((p) => ({ ...p })) })),
    timers: ctx.timers.map((t) => ({ ...t })),
    notices,
    game: projectGamePublic(room),
  };
}

function projectHostControls(room: Room, ctx: ProjectionCtx): HostControlsView {
  const inGame = room.status === 'inGame' && !!room.game;
  const engineCtx = { rng: () => 0, connectedIds: connectedIdsOf(room) };
  let canNext = false;
  if (inGame && room.game) {
    switch (room.game.kind) {
      case 'undercover':
        // Fin de manche non finale : « Manche suivante » (géré hors réducteur).
        canNext = room.game.phase === 'end' || guardUndercover(room.game, { type: 'HOST_NEXT' }).ok;
        break;
      case 'justone':
        canNext = guardJustOne(room.game, { type: 'HOST_NEXT' }, engineCtx).ok;
        break;
      case 'wavelength':
        canNext = guardWavelength(room.game, { type: 'HOST_NEXT' }, engineCtx).ok;
        break;
      case 'ito':
        canNext = guardIto(room.game, { type: 'HOST_NEXT' }, engineCtx).ok;
        break;
      case 'spyfall':
        canNext = guardSpyfall(room.game, { type: 'HOST_NEXT' }, engineCtx).ok;
        break;
      case 'taboo':
        canNext = guardTaboo(room.game, { type: 'HOST_NEXT' }, engineCtx).ok;
        break;
      case 'codenames':
        // Fin de manche non finale : « Manche suivante » (géré hors réducteur).
        canNext = room.game.phase === 'end' || guardCodenames(room.game, { type: 'HOST_NEXT' }, engineCtx).ok;
        break;
    }
  } else if (room.status === 'recap') {
    canNext = true; // retour au lobby
  }
  // Joueurs « retirables » : Undercover = retrait de la manche ; Ito = libérer la carte.
  let removableIds: PlayerId[] = [];
  if (inGame && room.game?.kind === 'undercover') removableIds = [...room.game.alive];
  if (inGame && room.game?.kind === 'ito' && room.game.phase === 'play') removableIds = [...room.game.holders];
  const activeTimer = ctx.timers[0];
  return {
    canStart: room.status === 'lobby' && computeStartBlockers(room, ctx).length === 0,
    startBlockers: room.status === 'lobby' ? computeStartBlockers(room, ctx) : [],
    canNext,
    canAbort: inGame,
    activeTimer: activeTimer ? { id: activeTimer.id, paused: activeTimer.paused } : undefined,
    removableIds,
    kickableIds: room.status === 'lobby' ? room.players.map((p) => p.id) : [],
  };
}

function projectMeGame(room: Room, playerId: PlayerId): GameMeView | undefined {
  if (!room.game) return undefined;
  switch (room.game.kind) {
    case 'undercover':
      return { undercover: projectUndercoverMe(room.game, playerId) };
    case 'justone':
      return { justone: projectJustOneMe(room.game, playerId, connectedIdsOf(room)) };
    case 'wavelength':
      return { wavelength: projectWavelengthMe(room.game, playerId) };
    case 'ito':
      return { ito: projectItoMe(room.game, playerId) };
    case 'spyfall':
      return { spyfall: projectSpyfallMe(room.game, playerId) };
    case 'taboo':
      return { taboo: projectTabooMe(room.game, playerId) };
    case 'codenames':
      return { codenames: projectCodenamesMe(room.game, playerId) };
  }
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
