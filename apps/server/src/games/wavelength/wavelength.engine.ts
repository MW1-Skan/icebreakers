/**
 * Wavelength — machine à états pure (fiche 5.2 du PRD, v3 : score individuel).
 *
 * Aucune I/O : l'axe est tiré par le serveur et injecté ; la cible sort du RNG
 * injecté. Chaque cas limite de la fiche a son test dans
 * `wavelength.engine.spec.ts`.
 */
import { fuzzyEquals } from '../../shared';
import type {
  GameEffect,
  GameResult,
  Player,
  PlayerId,
  Rng,
  WavelengthAction,
  WavelengthAxis,
  WavelengthMancheRecord,
  WavelengthParams,
  WavelengthState,
} from '../../shared';
import {
  WAVELENGTH_MAX_PLAYERS,
  WAVELENGTH_MIN_PLAYERS,
  WAVELENGTH_ZONE_POINTS,
} from '../../shared';
import type { EngineCtx, GuardResult, ReduceResult } from '../engine';

// ─── Paramétrage et validation ──────────────────────────────────────────────

export function resolveWavelengthParams(
  playerCount: number,
  partial: Partial<WavelengthParams>,
): WavelengthParams {
  return {
    // Défaut fiche : chacun est télépathe une fois, plafonné à 7.
    manchesCount: partial.manchesCount ?? Math.min(Math.max(playerCount, 1), 7),
    placeSeconds: partial.placeSeconds ?? 45,
    zoneWidth: partial.zoneWidth ?? 5,
  };
}

export function validateWavelengthSetup(
  playerCount: number,
): { ok: true } | { ok: false; code: 'BAD_PLAYER_COUNT'; message: string } {
  if (playerCount < WAVELENGTH_MIN_PLAYERS || playerCount > WAVELENGTH_MAX_PLAYERS) {
    return {
      ok: false,
      code: 'BAD_PLAYER_COUNT',
      message: `Wavelength se joue de ${WAVELENGTH_MIN_PLAYERS} à ${WAVELENGTH_MAX_PLAYERS} joueurs actifs (actuellement ${playerCount}).`,
    };
  }
  return { ok: true };
}

// ─── Sélecteurs ─────────────────────────────────────────────────────────────

export function placersOf(state: WavelengthState): PlayerId[] {
  return state.playerIds.filter((id) => id !== state.currentTelepathId);
}

/** Points d'un curseur : écart ≤ w → 4, ≤ 2w → 3, ≤ 3w → 2, sinon 0. */
export function pointsForPlacement(value: number, target: number, zoneWidth: number): number {
  const distance = Math.abs(value - target);
  for (let zone = 0; zone < WAVELENGTH_ZONE_POINTS.length; zone++) {
    if (distance <= zoneWidth * (zone + 1)) return WAVELENGTH_ZONE_POINTS[zone];
  }
  return 0;
}

/**
 * Règles d'indice vérifiables par le serveur : pas de nombre, pas les mots des
 * pôles (le reste — traduction, périphrase — relève de l'invalidation host).
 */
export function clueViolation(clue: string, axis: WavelengthAxis): string | undefined {
  if (/\d/.test(clue)) return 'Pas de nombre dans l’indice !';
  if (fuzzyEquals(clue, axis.left) || fuzzyEquals(clue, axis.right)) {
    return 'L’indice ne peut pas être un mot des pôles.';
  }
  return undefined;
}

// ─── Initialisation et rotation ─────────────────────────────────────────────

function drawTarget(rng: Rng): number {
  return Math.floor(rng() * 101); // 0–100 inclus
}

export function initWavelength(
  playerIds: PlayerId[],
  axis: WavelengthAxis,
  params: WavelengthParams,
  ctx: EngineCtx,
): ReduceResult<WavelengthState> {
  // File des télépathes : l'ordre d'arrivée, en boucle si plus de manches que de joueurs.
  const queue: PlayerId[] = [];
  for (let i = 0; i < params.manchesCount; i++) queue.push(playerIds[i % playerIds.length]);
  const currentTelepathId = queue.shift()!;

  const state: WavelengthState = {
    kind: 'wavelength',
    phase: 'clue',
    params,
    playerIds: [...playerIds],
    telepathQueue: queue,
    retriedIds: [],
    currentTelepathId,
    mancheNumber: 1,
    manchesPlanned: params.manchesCount,
    axis,
    target: drawTarget(ctx.rng),
    placements: {},
    totals: Object.fromEntries(playerIds.map((id) => [id, 0])),
    history: [],
  };
  return { state, effects: [{ type: 'game:event', name: 'gameStarted' }] };
}

/** Tour suivant (axe tiré par le serveur). Renvoie null si la partie est finie. */
export function startNextWavelengthTurn(
  state: WavelengthState,
  axis: WavelengthAxis,
  ctx: EngineCtx,
): ReduceResult<WavelengthState> | null {
  if (state.telepathQueue.length === 0) return null;
  const [next, ...rest] = state.telepathQueue;
  const mancheNumber = state.mancheNumber + 1;
  return {
    state: {
      ...state,
      phase: 'clue',
      telepathQueue: rest,
      currentTelepathId: next,
      mancheNumber,
      axis,
      target: drawTarget(ctx.rng),
      clue: undefined,
      placements: {},
      lastResult: state.lastResult,
    },
    effects: [{ type: 'game:event', name: 'mancheStarted', payload: { mancheNumber } }],
  };
}

// ─── Garde de légalité ──────────────────────────────────────────────────────

export function guardWavelength(
  state: WavelengthState,
  action: WavelengthAction,
  _ctx: EngineCtx,
): GuardResult {
  const deny = (message: string): GuardResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });

  switch (action.type) {
    case 'SUBMIT_CLUE':
      if (state.phase !== 'clue') return deny('L’indice est déjà donné.');
      if (action.playerId !== state.currentTelepathId) return deny('Seul le télépathe donne l’indice.');
      {
        const violation = clueViolation(action.clue, state.axis);
        if (violation) return deny(violation);
      }
      return { ok: true };

    case 'HOST_INVALIDATE_CLUE':
      if (state.phase !== 'place') return deny('Aucun indice à invalider.');
      return { ok: true };

    case 'PLACE':
      if (state.phase !== 'place') return deny('Ce n’est pas la phase de placement.');
      if (action.playerId === state.currentTelepathId) return deny('Le télépathe ne place pas de curseur.');
      if (!state.playerIds.includes(action.playerId)) return deny('Tu ne fais pas partie de cette partie.');
      return { ok: true };

    case 'HOST_NEXT':
      if (state.phase !== 'reveal' && state.phase !== 'aborted') return deny('Rien à avancer dans cette phase.');
      return { ok: true };

    case 'TIMEOUT':
      return { ok: true };

    case 'TELEPATH_LEFT':
      // La cible est compromise seulement tant que l'indice n'est pas donné.
      if (state.phase !== 'clue') return deny('La manche continue sans lui (indice déjà donné).');
      return { ok: true };
  }
}

// ─── Réducteur ──────────────────────────────────────────────────────────────

export function reduceWavelength(
  state: WavelengthState,
  action: WavelengthAction,
  ctx: EngineCtx,
): ReduceResult<WavelengthState> {
  switch (action.type) {
    case 'SUBMIT_CLUE':
      return {
        state: { ...state, phase: 'place', clue: action.clue.trim() },
        effects: [
          { type: 'timer:start', id: 'place', seconds: state.params.placeSeconds },
          { type: 'game:event', name: 'clueGiven' },
        ],
      };

    case 'HOST_INVALIDATE_CLUE':
      // Indice illégal : le télépathe re-saisit, la cible ne change pas.
      return {
        state: { ...state, phase: 'clue', clue: undefined, placements: {} },
        effects: [
          { type: 'timer:cancel', id: 'place' },
          { type: 'game:event', name: 'clueInvalidated' },
        ],
      };

    case 'PLACE': {
      const placements = { ...state.placements, [action.playerId]: action.value };
      const next: WavelengthState = { ...state, placements };
      // Clôture anticipée : tous les placeurs CONNECTÉS ont placé.
      const connected = new Set(ctx.connectedIds ?? state.playerIds);
      const activePlacers = placersOf(next).filter((id) => connected.has(id));
      if (activePlacers.length > 0 && activePlacers.every((id) => id in placements)) {
        return reveal(next, [{ type: 'timer:cancel', id: 'place' }]);
      }
      return { state: next, effects: [] };
    }

    case 'TIMEOUT':
      if (action.timerId === 'place' && state.phase === 'place') {
        return reveal(state, []);
      }
      return { state, effects: [] };

    case 'TELEPATH_LEFT': {
      // Manche annulée (carte défaussée) ; rejouée en fin de partie s'il
      // revient — un seul repêchage par télépathe.
      const alreadyRetried = state.retriedIds.includes(state.currentTelepathId);
      const record: WavelengthMancheRecord = {
        telepathId: state.currentTelepathId,
        axis: state.axis,
        clue: undefined,
        target: state.target,
        results: [],
        telepathPoints: 0,
        aborted: true,
      };
      return {
        state: {
          ...state,
          phase: 'aborted',
          telepathQueue: alreadyRetried
            ? state.telepathQueue
            : [...state.telepathQueue, state.currentTelepathId],
          retriedIds: alreadyRetried ? state.retriedIds : [...state.retriedIds, state.currentTelepathId],
          manchesPlanned: alreadyRetried ? state.manchesPlanned : state.manchesPlanned + 1,
          history: [...state.history, record],
        },
        effects: [{ type: 'game:event', name: 'mancheAborted', payload: { telepathId: state.currentTelepathId } }],
      };
    }

    case 'HOST_NEXT': {
      // La suite (nouvel axe) vient du serveur ; ici on ne gère que la fin.
      if (state.telepathQueue.length === 0) {
        return {
          state: { ...state, phase: 'end' },
          effects: [{ type: 'game:ended' }, { type: 'game:event', name: 'gameEnded' }],
        };
      }
      return { state, effects: [] };
    }
  }
}

/** Révélation d'un coup : cible, curseurs nominatifs, points, cumul. */
function reveal(state: WavelengthState, extraEffects: GameEffect[]): ReduceResult<WavelengthState> {
  const results = placersOf(state)
    .filter((id) => id in state.placements)
    .map((playerId) => ({
      playerId,
      value: state.placements[playerId],
      points: pointsForPlacement(state.placements[playerId], state.target, state.params.zoneWidth),
    }));
  // Le télépathe est noté sur la qualité de son indice : moyenne arrondie des
  // points des joueurs AYANT placé (un déconnecté ne le pénalise pas).
  const telepathPoints =
    results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.points, 0) / results.length) : 0;

  const totals = { ...state.totals };
  for (const r of results) totals[r.playerId] = (totals[r.playerId] ?? 0) + r.points;
  totals[state.currentTelepathId] = (totals[state.currentTelepathId] ?? 0) + telepathPoints;

  const record: WavelengthMancheRecord = {
    telepathId: state.currentTelepathId,
    axis: state.axis,
    clue: state.clue,
    target: state.target,
    results,
    telepathPoints,
    aborted: false,
  };

  return {
    state: {
      ...state,
      phase: 'reveal',
      lastResult: record,
      totals,
      history: [...state.history, record],
    },
    effects: [...extraEffects, { type: 'game:event', name: 'revealed' }],
  };
}

// ─── Récap ──────────────────────────────────────────────────────────────────

export function sortedTotals(state: WavelengthState): Array<{ playerId: PlayerId; points: number }> {
  return Object.entries(state.totals)
    .map(([playerId, points]) => ({ playerId, points }))
    .sort((a, b) => b.points - a.points);
}

export function buildWavelengthResult(state: WavelengthState, players: Player[], endedAt: number): GameResult {
  const byId = new Map(players.map((p) => [p.id, p]));
  const totals = sortedTotals(state);
  const top = totals.filter((t) => t.points === totals[0]?.points && t.points > 0);
  const names = top.map((t) => byId.get(t.playerId)?.name ?? '???').join(' & ');
  return {
    game: 'wavelength',
    endedAt,
    // Égalité au classement final : victoire partagée (fiche 5.2).
    summary: top.length > 0 ? `En tête : ${names} (${top[0].points} pts)` : 'Personne n’a marqué',
    points: totals.map(({ playerId, points }) => ({
      playerId,
      name: byId.get(playerId)?.name ?? '???',
      avatar: byId.get(playerId)?.avatar ?? '❓',
      points,
    })),
  };
}
