/**
 * Spyfall — machine à états pure (fiche 5.4 du PRD, v3 : thèmes publics).
 *
 * Aucune I/O : thème + grille sont tirés par le serveur et injectés ; l'espion
 * et la carte sortent du RNG injecté. Les accusations et le coup de l'espion
 * sont sérialisés par construction (le premier événement qui change la phase
 * fige le jeu, le suivant est refusé par la garde — et non consommé).
 */
import { normalizeText } from '../../shared';
import type {
  GameEffect,
  GameResult,
  Player,
  PlayerId,
  SpyfallAction,
  SpyfallOutcome,
  SpyfallParams,
  SpyfallState,
} from '../../shared';
import { SPYFALL_MAX_PLAYERS, SPYFALL_MIN_PLAYERS, SPYFALL_POINTS } from '../../shared';
import type { EngineCtx, GuardResult, ReduceResult } from '../engine';

// ─── Paramétrage et validation ──────────────────────────────────────────────

export function resolveSpyfallParams(partial: Partial<SpyfallParams>): SpyfallParams {
  return {
    mancheSeconds: partial.mancheSeconds ?? 360,
    manchesCount: partial.manchesCount ?? 1,
    accusationVoteSeconds: partial.accusationVoteSeconds ?? 30,
    finalVoteSeconds: partial.finalVoteSeconds ?? 45,
    spyGuessSeconds: partial.spyGuessSeconds ?? 45,
  };
}

export function validateSpyfallSetup(
  playerCount: number,
): { ok: true } | { ok: false; code: 'BAD_PLAYER_COUNT'; message: string } {
  if (playerCount < SPYFALL_MIN_PLAYERS || playerCount > SPYFALL_MAX_PLAYERS) {
    return {
      ok: false,
      code: 'BAD_PLAYER_COUNT',
      message: `Spyfall se joue de ${SPYFALL_MIN_PLAYERS} à ${SPYFALL_MAX_PLAYERS} joueurs actifs (actuellement ${playerCount}).`,
    };
  }
  return { ok: true };
}

// ─── Initialisation et manches ──────────────────────────────────────────────

function startManche(
  base: SpyfallState,
  mancheIndex: number,
  category: string,
  grid: string[],
  ctx: EngineCtx,
): SpyfallState {
  // L'espion est désigné parmi les joueurs actifs — jamais l'animateur (il
  // n'est pas dans playerIds par construction).
  const spyId = base.playerIds[Math.floor(ctx.rng() * base.playerIds.length)];
  const card = grid[Math.floor(ctx.rng() * grid.length)];
  const firstQuestionerId = base.playerIds[Math.floor(ctx.rng() * base.playerIds.length)];
  return {
    ...base,
    phase: 'brief',
    mancheIndex,
    category,
    grid: [...grid],
    card,
    spyId,
    firstQuestionerId,
    seenCardIds: [],
    accusationsUsed: [],
    accusation: undefined,
    finalVotes: {},
    frozen: false,
    lastOutcome: undefined,
  };
}

export function initSpyfall(
  playerIds: PlayerId[],
  theme: { category: string; grid: string[] },
  params: SpyfallParams,
  ctx: EngineCtx,
): ReduceResult<SpyfallState> {
  const base: SpyfallState = {
    kind: 'spyfall',
    phase: 'brief',
    params,
    playerIds: [...playerIds],
    mancheIndex: 1,
    category: theme.category,
    grid: theme.grid,
    card: '',
    spyId: playerIds[0],
    firstQuestionerId: playerIds[0],
    seenCardIds: [],
    accusationsUsed: [],
    finalVotes: {},
    frozen: false,
    totals: Object.fromEntries(playerIds.map((id) => [id, 0])),
    history: [],
  };
  return {
    state: startManche(base, 1, theme.category, theme.grid, ctx),
    effects: [{ type: 'game:event', name: 'gameStarted' }],
  };
}

/** Manche suivante (nouveau thème/carte/espion). Null si c'était la dernière. */
export function startNextSpyfallManche(
  state: SpyfallState,
  theme: { category: string; grid: string[] },
  ctx: EngineCtx,
): ReduceResult<SpyfallState> | null {
  if (state.mancheIndex >= state.params.manchesCount) return null;
  const mancheIndex = state.mancheIndex + 1;
  return {
    state: startManche(state, mancheIndex, theme.category, theme.grid, ctx),
    effects: [{ type: 'game:event', name: 'mancheStarted', payload: { mancheIndex } }],
  };
}

// ─── Sélecteurs ─────────────────────────────────────────────────────────────

function connectedSet(state: SpyfallState, ctx: EngineCtx): Set<PlayerId> {
  return new Set(ctx.connectedIds ?? state.playerIds);
}

/** Votants attendus au vote d'accusation : connectés, sauf l'accusé. */
export function accusationVoters(state: SpyfallState, ctx: EngineCtx): PlayerId[] {
  if (!state.accusation) return [];
  const connected = connectedSet(state, ctx);
  return state.playerIds.filter((id) => id !== state.accusation!.accusedId && connected.has(id));
}

export function finalVoters(state: SpyfallState, ctx: EngineCtx): PlayerId[] {
  const connected = connectedSet(state, ctx);
  return state.playerIds.filter((id) => connected.has(id));
}

// ─── Garde de légalité ──────────────────────────────────────────────────────

export function guardSpyfall(state: SpyfallState, action: SpyfallAction, ctx: EngineCtx): GuardResult {
  const deny = (message: string): GuardResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });
  const inGame = (id: PlayerId) => state.playerIds.includes(id);

  switch (action.type) {
    case 'SEEN_CARD':
      if (!inGame(action.playerId)) return deny('Tu ne fais pas partie de cette partie.');
      return { ok: true };

    case 'HOST_NEXT':
      if (state.phase !== 'brief' && state.phase !== 'reveal') return deny('Rien à avancer dans cette phase.');
      return { ok: true };

    case 'ACCUSE':
      if (state.phase === 'accusationVote') return deny('Une accusation est déjà en cours.');
      if (state.phase === 'spyGuess') return deny('L’espion est en train de se révéler.');
      if (state.phase !== 'interrogate') return deny('Les accusations se font pendant l’interrogatoire.');
      if (!inGame(action.accuserId) || !inGame(action.accusedId)) return deny('Joueur inconnu.');
      if (action.accuserId === action.accusedId) return deny('Impossible de s’accuser soi-même.');
      if (state.accusationsUsed.includes(action.accuserId)) {
        return deny('Tu as déjà utilisé ton accusation cette manche.');
      }
      return { ok: true };

    case 'VOTE_ACCUSATION':
      if (state.phase !== 'accusationVote' || !state.accusation) return deny('Aucun vote d’accusation en cours.');
      if (!inGame(action.playerId)) return deny('Tu ne fais pas partie de cette partie.');
      if (action.playerId === state.accusation.accusedId) return deny('On vote sur toi — tu ne votes pas.');
      return { ok: true };

    case 'SPY_REVEAL':
      if (state.phase === 'accusationVote') return deny('Une accusation est en cours.');
      if (state.phase !== 'interrogate') return deny('Trop tard (ou trop tôt) pour se révéler.');
      if (action.playerId !== state.spyId) return deny('Seul l’espion peut tenter ce coup.');
      return { ok: true };

    case 'SPY_GUESS':
      if (state.phase !== 'spyGuess') return deny('L’espion ne s’est pas révélé.');
      if (action.playerId !== state.spyId) return deny('Seul l’espion choisit la carte.');
      if (!state.grid.some((c) => normalizeText(c) === normalizeText(action.card))) {
        return deny('Cette carte n’est pas dans la grille.');
      }
      return { ok: true };

    case 'VOTE_FINAL':
      if (state.phase !== 'finalVote') return deny('Pas de vote final en cours.');
      if (!inGame(action.playerId)) return deny('Tu ne fais pas partie de cette partie.');
      if (action.playerId === action.target) return deny('Impossible de se désigner soi-même.');
      if (!inGame(action.target)) return deny('Suspect inconnu.');
      return { ok: true };

    case 'TIMEOUT':
      return { ok: true };

    case 'SPY_DISCONNECTED':
      if (state.phase === 'reveal' || state.phase === 'end') return deny('Manche déjà résolue.');
      if (state.frozen) return deny('Déjà gelée.');
      return { ok: true };

    case 'SPY_RECONNECTED':
      if (!state.frozen) return deny('Aucun gel en cours.');
      return { ok: true };
  }
}

// ─── Réducteur ──────────────────────────────────────────────────────────────

export function reduceSpyfall(
  state: SpyfallState,
  action: SpyfallAction,
  ctx: EngineCtx,
): ReduceResult<SpyfallState> {
  switch (action.type) {
    case 'SEEN_CARD': {
      if (state.seenCardIds.includes(action.playerId)) return { state, effects: [] };
      return { state: { ...state, seenCardIds: [...state.seenCardIds, action.playerId] }, effects: [] };
    }

    case 'HOST_NEXT': {
      if (state.phase === 'brief') {
        return {
          state: { ...state, phase: 'interrogate' },
          effects: [
            { type: 'timer:start', id: 'manche', seconds: state.params.mancheSeconds },
            { type: 'game:event', name: 'interrogationStarted' },
          ],
        };
      }
      // reveal : la manche suivante vient du serveur ; ici, la fin de partie.
      if (state.mancheIndex >= state.params.manchesCount) {
        return {
          state: { ...state, phase: 'end' },
          effects: [{ type: 'game:ended' }, { type: 'game:event', name: 'gameEnded' }],
        };
      }
      return { state, effects: [] };
    }

    case 'ACCUSE':
      // Le timer de manche se fige ; l'accusation est consommée dès l'ouverture.
      return {
        state: {
          ...state,
          phase: 'accusationVote',
          accusationsUsed: [...state.accusationsUsed, action.accuserId],
          accusation: { accuserId: action.accuserId, accusedId: action.accusedId, votes: {} },
        },
        effects: [
          { type: 'timer:pause', id: 'manche' },
          { type: 'timer:start', id: 'accusationVote', seconds: state.params.accusationVoteSeconds },
          { type: 'game:event', name: 'accusation', payload: { accuserId: action.accuserId, accusedId: action.accusedId } },
        ],
      };

    case 'VOTE_ACCUSATION': {
      const accusation = {
        ...state.accusation!,
        votes: { ...state.accusation!.votes, [action.playerId]: action.yes },
      };
      const next: SpyfallState = { ...state, accusation };
      const voters = accusationVoters(next, ctx);
      if (voters.every((id) => id in accusation.votes)) {
        return resolveAccusation(next, ctx, [{ type: 'timer:cancel', id: 'accusationVote' }]);
      }
      return { state: next, effects: [] };
    }

    case 'SPY_REVEAL':
      return {
        state: { ...state, phase: 'spyGuess' },
        effects: [
          { type: 'timer:pause', id: 'manche' },
          { type: 'timer:start', id: 'spyGuess', seconds: state.params.spyGuessSeconds },
          { type: 'game:event', name: 'spyRevealed', payload: { spyId: state.spyId } },
        ],
      };

    case 'SPY_GUESS': {
      const correct = normalizeText(action.card) === normalizeText(state.card);
      return finishManche(
        state,
        {
          winner: correct ? 'spy' : 'team',
          reason: correct ? 'spyGuessRight' : 'spyGuessWrong',
          spyId: state.spyId,
          card: state.card,
          guessedCard: action.card,
        },
        [{ type: 'timer:cancel', id: 'spyGuess' }, { type: 'timer:cancel', id: 'manche' }],
      );
    }

    case 'VOTE_FINAL': {
      const finalVotes = { ...state.finalVotes, [action.playerId]: action.target };
      const next: SpyfallState = { ...state, finalVotes };
      const voters = finalVoters(next, ctx);
      if (voters.every((id) => id in finalVotes)) {
        return resolveFinalVote(next, [{ type: 'timer:cancel', id: 'finalVote' }]);
      }
      return { state: next, effects: [] };
    }

    case 'TIMEOUT':
      return handleTimeout(state, action.timerId, ctx);

    case 'SPY_DISCONNECTED': {
      const timerId = activePhaseTimer(state);
      const effects: GameEffect[] = [];
      if (timerId) effects.push({ type: 'timer:pause', id: timerId });
      effects.push(
        { type: 'timer:start', id: 'spyGone', seconds: 60 },
        { type: 'game:event', name: 'spyFrozen' },
      );
      return { state: { ...state, frozen: true }, effects };
    }

    case 'SPY_RECONNECTED': {
      const timerId = activePhaseTimer(state);
      const effects: GameEffect[] = [{ type: 'timer:cancel', id: 'spyGone' }];
      if (timerId) effects.push({ type: 'timer:resume', id: timerId });
      effects.push({ type: 'game:event', name: 'spyBack' });
      return { state: { ...state, frozen: false }, effects };
    }
  }
}

function activePhaseTimer(state: SpyfallState): 'manche' | 'accusationVote' | 'spyGuess' | 'finalVote' | undefined {
  switch (state.phase) {
    case 'interrogate':
      return 'manche';
    case 'accusationVote':
      return 'accusationVote';
    case 'spyGuess':
      return 'spyGuess';
    case 'finalVote':
      return 'finalVote';
    default:
      return undefined;
  }
}

function handleTimeout(
  state: SpyfallState,
  timerId: 'manche' | 'accusationVote' | 'spyGuess' | 'finalVote' | 'spyGone',
  ctx: EngineCtx,
): ReduceResult<SpyfallState> {
  if (timerId === 'manche' && state.phase === 'interrogate') {
    // Fin du timer → vote final obligatoire.
    return {
      state: { ...state, phase: 'finalVote', finalVotes: {} },
      effects: [
        { type: 'timer:start', id: 'finalVote', seconds: state.params.finalVoteSeconds },
        { type: 'game:event', name: 'finalVoteStarted' },
      ],
    };
  }
  if (timerId === 'accusationVote' && state.phase === 'accusationVote') {
    // Votes manquants = pas d'unanimité.
    return resolveAccusation(state, ctx, []);
  }
  if (timerId === 'spyGuess' && state.phase === 'spyGuess') {
    // L'espion s'est révélé puis n'a pas choisi : la grille lui a échappé.
    return finishManche(
      state,
      { winner: 'team', reason: 'spyGuessWrong', spyId: state.spyId, card: state.card },
      [{ type: 'timer:cancel', id: 'manche' }],
    );
  }
  if (timerId === 'finalVote' && state.phase === 'finalVote') {
    return resolveFinalVote(state, []);
  }
  if (timerId === 'spyGone' && state.frozen) {
    // Espion parti > 60 s : manche annulée, aucune valeur (fiche 5.4).
    const timer = activePhaseTimer(state);
    const effects: GameEffect[] = timer ? [{ type: 'timer:cancel', id: timer }] : [];
    return finishManche(
      { ...state, frozen: false },
      { reason: 'aborted', spyId: state.spyId, card: state.card },
      effects,
    );
  }
  return { state, effects: [] };
}

// ─── Résolutions ────────────────────────────────────────────────────────────

function resolveAccusation(
  state: SpyfallState,
  ctx: EngineCtx,
  extraEffects: GameEffect[],
): ReduceResult<SpyfallState> {
  const accusation = state.accusation!;
  const voters = accusationVoters(state, ctx);
  const unanimousYes = voters.length > 0 && voters.every((id) => accusation.votes[id] === true);

  if (!unanimousYes) {
    // Le timer reprend, l'accusation est consommée (déjà fait à l'ouverture).
    return {
      state: { ...state, phase: 'interrogate', accusation: undefined },
      effects: [
        ...extraEffects,
        { type: 'timer:resume', id: 'manche' },
        { type: 'game:event', name: 'accusationFailed' },
      ],
    };
  }

  const accusedIsSpy = accusation.accusedId === state.spyId;
  return finishManche(
    state,
    accusedIsSpy
      ? {
          winner: 'team',
          reason: 'accusationRight',
          spyId: state.spyId,
          card: state.card,
          decisiveAccuserId: accusation.accuserId,
        }
      : { winner: 'spy', reason: 'accusationWrong', spyId: state.spyId, card: state.card },
    [...extraEffects, { type: 'timer:cancel', id: 'manche' }],
  );
}

function resolveFinalVote(state: SpyfallState, extraEffects: GameEffect[]): ReduceResult<SpyfallState> {
  const counts = new Map<PlayerId, number>();
  for (const target of Object.values(state.finalVotes)) {
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  const tally = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = tally[0]?.[1] ?? 0;
  const leaders = tally.filter(([, count]) => count === max).map(([id]) => id);
  // Égalité (ou personne) → l'espion gagne (il a semé le doute) ; sinon le plus
  // voté est révélé : espion → équipe, civil → espion.
  const single = leaders.length === 1 ? leaders[0] : undefined;
  const teamWins = single === state.spyId;
  return finishManche(
    state,
    {
      winner: teamWins ? 'team' : 'spy',
      reason: teamWins ? 'finalVoteRight' : 'finalVoteMiss',
      spyId: state.spyId,
      card: state.card,
      topVotedId: single,
    },
    extraEffects,
  );
}

function finishManche(
  state: SpyfallState,
  outcome: SpyfallOutcome,
  extraEffects: GameEffect[],
): ReduceResult<SpyfallState> {
  const totals = { ...state.totals };
  if (outcome.winner === 'team') {
    for (const id of state.playerIds) {
      if (id !== state.spyId) totals[id] = (totals[id] ?? 0) + SPYFALL_POINTS.teamMember;
    }
    if (outcome.decisiveAccuserId) {
      totals[outcome.decisiveAccuserId] =
        (totals[outcome.decisiveAccuserId] ?? 0) + SPYFALL_POINTS.decisiveAccuserBonus;
    }
  } else if (outcome.winner === 'spy') {
    totals[state.spyId] = (totals[state.spyId] ?? 0) + SPYFALL_POINTS.spy;
  }
  return {
    state: {
      ...state,
      phase: 'reveal',
      accusation: undefined,
      lastOutcome: outcome,
      totals,
      history: [
        ...state.history,
        { category: state.category, card: state.card, spyId: state.spyId, outcome },
      ],
    },
    effects: [...extraEffects, { type: 'game:event', name: 'mancheResolved', payload: { reason: outcome.reason } }],
  };
}

// ─── Récap ──────────────────────────────────────────────────────────────────

export function sortedSpyfallTotals(state: SpyfallState): Array<{ playerId: PlayerId; points: number }> {
  return Object.entries(state.totals)
    .map(([playerId, points]) => ({ playerId, points }))
    .sort((a, b) => b.points - a.points);
}

export function buildSpyfallResult(state: SpyfallState, players: Player[], endedAt: number): GameResult {
  const byId = new Map(players.map((p) => [p.id, p]));
  const teamWins = state.history.filter((h) => h.outcome.winner === 'team').length;
  const spyWins = state.history.filter((h) => h.outcome.winner === 'spy').length;
  return {
    game: 'spyfall',
    endedAt,
    summary:
      state.history.length === 1
        ? state.history[0].outcome.winner === 'team'
          ? 'L’équipe démasque l’espion'
          : state.history[0].outcome.winner === 'spy'
            ? 'L’espion s’en sort'
            : 'Manche annulée'
        : `Équipe ${teamWins} — Espions ${spyWins}`,
    points: sortedSpyfallTotals(state).map(({ playerId, points }) => ({
      playerId,
      name: byId.get(playerId)?.name ?? '???',
      avatar: byId.get(playerId)?.avatar ?? '❓',
      points,
    })),
  };
}
