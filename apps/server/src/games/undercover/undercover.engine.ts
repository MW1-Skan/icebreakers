/**
 * Undercover — machine à états pure (fiche 5.1 du PRD, qui est LA spec).
 *
 * Aucune I/O ici : les timers sont demandés via des effets et le hasard vient
 * du RNG injecté (seedable). Chaque cas limite de la fiche a son test unitaire
 * dans `undercover.engine.spec.ts`.
 */
import {
  fuzzyEquals,
  shuffled,
  UNDERCOVER_DEFAULT_ROLES,
  UNDERCOVER_MAX_PLAYERS,
  UNDERCOVER_MIN_PLAYERS,
  UNDERCOVER_MIN_PLAYERS_FOR_MRWHITE,
  UNDERCOVER_POINTS,
} from '../../shared';
import type {
  GameEffect,
  GameResult,
  Player,
  PlayerId,
  Rng,
  UndercoverAction,
  UndercoverElimination,
  UndercoverParams,
  UndercoverRevealOutcome,
  UndercoverRole,
  UndercoverState,
  UndercoverWinner,
} from '../../shared';
import type { EngineCtx, GuardResult, ReduceResult } from '../engine';

// ─── Paramétrage et validation du lancement ─────────────────────────────────

export interface UndercoverSetupDefaults {
  discussSeconds: number;
  voteSeconds: number;
  whiteGuessSeconds: number;
}

/** Complète les paramètres host avec les défauts (répartition = tableau de la fiche). */
export function resolveUndercoverParams(
  playerCount: number,
  partial: Partial<UndercoverParams>,
  defaults: UndercoverSetupDefaults,
): UndercoverParams {
  const table = UNDERCOVER_DEFAULT_ROLES[Math.min(Math.max(playerCount, 4), 10)] ?? {
    undercover: 1,
    mrWhite: false,
  };
  return {
    undercoverCount: partial.undercoverCount ?? table.undercover,
    mrWhite: partial.mrWhite ?? table.mrWhite,
    discussSeconds: partial.discussSeconds ?? defaults.discussSeconds,
    voteSeconds: partial.voteSeconds ?? defaults.voteSeconds,
    whiteGuessSeconds: partial.whiteGuessSeconds ?? defaults.whiteGuessSeconds,
    publicVotes: partial.publicVotes ?? false,
    manchesCount: partial.manchesCount ?? 1,
    describePasses: partial.describePasses ?? 1,
  };
}

/** Contraintes de lancement (4–10 joueurs, Mr. White ≥ 5, civils majoritaires). */
export function validateUndercoverSetup(
  playerCount: number,
  params: UndercoverParams,
): { ok: true } | { ok: false; code: 'BAD_PLAYER_COUNT' | 'MRWHITE_MIN_PLAYERS' | 'BAD_ROLE_CONFIG'; message: string } {
  if (playerCount < UNDERCOVER_MIN_PLAYERS || playerCount > UNDERCOVER_MAX_PLAYERS) {
    return {
      ok: false,
      code: 'BAD_PLAYER_COUNT',
      message: `Undercover se joue de ${UNDERCOVER_MIN_PLAYERS} à ${UNDERCOVER_MAX_PLAYERS} joueurs actifs (actuellement ${playerCount}).`,
    };
  }
  if (params.mrWhite && playerCount < UNDERCOVER_MIN_PLAYERS_FOR_MRWHITE) {
    return {
      ok: false,
      code: 'MRWHITE_MIN_PLAYERS',
      message: `Mr. White nécessite au moins ${UNDERCOVER_MIN_PLAYERS_FOR_MRWHITE} joueurs.`,
    };
  }
  const infiltrators = params.undercoverCount + (params.mrWhite ? 1 : 0);
  if (params.undercoverCount < 1 || infiltrators >= playerCount / 2) {
    return {
      ok: false,
      code: 'BAD_ROLE_CONFIG',
      message: 'Répartition invalide : il faut au moins 1 undercover et une majorité stricte de civils.',
    };
  }
  return { ok: true };
}

// ─── Initialisation ─────────────────────────────────────────────────────────

/**
 * Ordre de parole : Mr. White ne parle jamais en premier au tour 1
 * (re-tirage si besoin, fiche 5.1 étape 1).
 */
function drawSpeakingOrder(
  candidates: PlayerId[],
  roles: Record<PlayerId, UndercoverRole>,
  round: number,
  rng: Rng,
): PlayerId[] {
  let order = shuffled(candidates, rng);
  if (round === 1) {
    let attempts = 0;
    while (roles[order[0]] === 'mrwhite' && attempts < 50) {
      order = shuffled(candidates, rng);
      attempts++;
    }
    if (roles[order[0]] === 'mrwhite') {
      // Garde-fou théorique : on échange avec un non-White (il en existe toujours).
      const other = order.findIndex((id) => roles[id] !== 'mrwhite');
      [order[0], order[other]] = [order[other], order[0]];
    }
  }
  return order;
}

export interface UndercoverMancheContext {
  /** Manche 1 par défaut ; les manches suivantes portent le cumul précédent. */
  mancheIndex?: number;
  carriedPoints?: Record<PlayerId, number>;
}

export function initUndercover(
  playerIds: PlayerId[],
  entry: { a: string; b: string },
  params: UndercoverParams,
  ctx: EngineCtx,
  manche: UndercoverMancheContext = {},
): ReduceResult<UndercoverState> {
  const civilianWord: 'a' | 'b' = ctx.rng() < 0.5 ? 'a' : 'b';
  const shuffledIds = shuffled(playerIds, ctx.rng);
  const roles: Record<PlayerId, UndercoverRole> = {};
  shuffledIds.forEach((id, index) => {
    if (index < params.undercoverCount) roles[id] = 'undercover';
    else if (params.mrWhite && index === params.undercoverCount) roles[id] = 'mrwhite';
    else roles[id] = 'civilian';
  });

  const mancheIndex = manche.mancheIndex ?? 1;
  const state: UndercoverState = {
    kind: 'undercover',
    phase: 'distribute',
    params,
    mancheIndex,
    carriedPoints: { ...(manche.carriedPoints ?? {}) },
    goodVoterIds: [],
    describePass: 1,
    playerIds: [...playerIds],
    pair: { a: entry.a, b: entry.b },
    civilianWord,
    roles,
    alive: [...playerIds],
    round: 1,
    speakingOrder: drawSpeakingOrder(playerIds, roles, 1, ctx.rng),
    turnIndex: 0,
    seenWord: [],
    votes: {},
    blankStreak: 0,
    suggestAbort: false,
    eliminations: [],
  };
  return {
    state,
    effects: [{ type: 'game:event', name: mancheIndex === 1 ? 'gameStarted' : 'mancheStarted', payload: { mancheIndex } }],
  };
}

// ─── Sélecteurs ─────────────────────────────────────────────────────────────

export function civilianWordText(state: UndercoverState): string {
  return state.civilianWord === 'a' ? state.pair.a : state.pair.b;
}

export function undercoverWordText(state: UndercoverState): string {
  return state.civilianWord === 'a' ? state.pair.b : state.pair.a;
}

export function wordFor(state: UndercoverState, playerId: PlayerId): string | undefined {
  const role = state.roles[playerId];
  if (role === 'civilian') return civilianWordText(state);
  if (role === 'undercover') return undercoverWordText(state);
  return undefined; // Mr. White n'a pas de mot
}

function aliveInfiltrators(state: UndercoverState): PlayerId[] {
  return state.alive.filter((id) => state.roles[id] !== 'civilian');
}

/** Conditions de fin (fiche 5.1 étape 9) — à évaluer après chaque élimination résolue. */
function evaluateWinner(state: UndercoverState): UndercoverWinner | undefined {
  if (aliveInfiltrators(state).length === 0) return 'civilians';
  if (state.alive.length <= 2) return 'infiltrators';
  return undefined;
}

/** Cibles de vote autorisées pour un joueur (vivants sauf soi ; ex æquo si re-vote). */
export function voteOptionsFor(state: UndercoverState, voterId: PlayerId): PlayerId[] {
  const base = state.revoteCandidates ?? state.alive;
  return base.filter((id) => id !== voterId && state.alive.includes(id));
}

// ─── Garde de légalité (avant reduce) ───────────────────────────────────────

export function guardUndercover(state: UndercoverState, action: UndercoverAction): GuardResult {
  const deny = (message: string): GuardResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });
  if (state.phase === 'end' && action.type !== 'SEEN_WORD') return deny('La partie est terminée.');

  switch (action.type) {
    case 'SEEN_WORD':
      if (!state.playerIds.includes(action.playerId)) return deny('Tu ne fais pas partie de cette partie.');
      return { ok: true };

    case 'HOST_NEXT':
      switch (state.phase) {
        case 'distribute':
        case 'describe':
        case 'discuss':
          return { ok: true };
        case 'vote':
          return deny('Le vote se clôt automatiquement (tous votés ou timeout).');
        case 'reveal':
          return { ok: true };
        case 'whiteGuess':
          if (!state.whiteGuess?.resolved) return deny('Mr. White n’a pas encore tenté sa chance.');
          return { ok: true };
        default:
          return deny('Rien à avancer dans cette phase.');
      }

    case 'CAST_VOTE': {
      if (state.phase !== 'vote') return deny('Ce n’est pas la phase de vote.');
      if (!state.alive.includes(action.playerId)) return deny('Seuls les joueurs vivants votent.');
      if (action.target !== 'blank') {
        if (action.target === action.playerId) return deny('Impossible de voter pour soi-même.');
        if (!voteOptionsFor(state, action.playerId).includes(action.target)) {
          return deny('Cible de vote invalide.');
        }
      }
      return { ok: true };
    }

    case 'SUBMIT_GUESS':
      if (state.phase !== 'whiteGuess') return deny('Aucun guess en cours.');
      if (state.whiteGuess?.playerId !== action.playerId) return deny('Seul Mr. White éliminé peut deviner.');
      if (state.whiteGuess.resolved) return deny('Le guess est déjà résolu.');
      return { ok: true };

    case 'TIMEOUT':
      // Toujours accepté : un timer périmé sur une phase passée est ignoré par le réducteur.
      return { ok: true };

    case 'HOST_REMOVE_PLAYER': {
      if (!['distribute', 'describe', 'discuss', 'vote'].includes(state.phase)) {
        return deny('Retrait impossible pendant une révélation ou un guess.');
      }
      if (!state.alive.includes(action.playerId)) return deny('Ce joueur n’est plus en jeu.');
      return { ok: true };
    }
  }
}

// ─── Réducteur ──────────────────────────────────────────────────────────────

export function reduceUndercover(
  state: UndercoverState,
  action: UndercoverAction,
  ctx: EngineCtx,
): ReduceResult<UndercoverState> {
  switch (action.type) {
    case 'SEEN_WORD': {
      if (state.seenWord.includes(action.playerId)) return { state, effects: [] };
      return { state: { ...state, seenWord: [...state.seenWord, action.playerId] }, effects: [] };
    }

    case 'HOST_NEXT':
      return hostNext(state, ctx);

    case 'CAST_VOTE': {
      const votes = { ...state.votes, [action.playerId]: action.target };
      const next: UndercoverState = { ...state, votes };
      if (Object.keys(votes).length >= state.alive.length) {
        return resolveVotes(next, [{ type: 'timer:cancel', id: 'vote' }]);
      }
      return { state: next, effects: [] };
    }

    case 'SUBMIT_GUESS': {
      const correct = fuzzyEquals(action.guess, civilianWordText(state));
      const next: UndercoverState = {
        ...state,
        whiteGuess: { playerId: action.playerId, guess: action.guess, correct, resolved: true },
        winner: correct ? 'mrwhite' : evaluateWinner(state),
      };
      return {
        state: next,
        effects: [
          { type: 'timer:cancel', id: 'whiteGuess' },
          { type: 'game:event', name: 'whiteGuessResolved', payload: { correct } },
        ],
      };
    }

    case 'TIMEOUT':
      return handleTimeout(state, action.timerId);

    case 'HOST_REMOVE_PLAYER':
      return removePlayer(state, action.playerId);
  }
}

function hostNext(state: UndercoverState, ctx: EngineCtx): ReduceResult<UndercoverState> {
  switch (state.phase) {
    case 'distribute':
      return { state: { ...state, phase: 'describe', turnIndex: 0 }, effects: [] };

    case 'describe': {
      if (state.turnIndex < state.speakingOrder.length - 1) {
        return { state: { ...state, turnIndex: state.turnIndex + 1 }, effects: [] };
      }
      // Fin d'une passe : passe suivante (même ordre) ou discussion.
      if (state.describePass < state.params.describePasses) {
        return {
          state: { ...state, describePass: state.describePass + 1, turnIndex: 0 },
          effects: [{ type: 'game:event', name: 'describePass', payload: { pass: state.describePass + 1 } }],
        };
      }
      return startDiscuss(state);
    }

    case 'discuss':
      return startVote({ ...state }, [{ type: 'timer:cancel', id: 'discuss' }]);

    case 'reveal': {
      if (state.winner) return endManche(state);
      if (state.pendingWhiteGuessFor) return startWhiteGuess(state);
      return startNextRound(state, ctx);
    }

    case 'whiteGuess': {
      if (state.winner) return endManche(state);
      return startNextRound(state, ctx);
    }

    default:
      return { state, effects: [] };
  }
}

function startDiscuss(state: UndercoverState): ReduceResult<UndercoverState> {
  return {
    state: { ...state, phase: 'discuss' },
    effects: [{ type: 'timer:start', id: 'discuss', seconds: state.params.discussSeconds }],
  };
}

function startVote(state: UndercoverState, extraEffects: GameEffect[] = []): ReduceResult<UndercoverState> {
  return {
    state: { ...state, phase: 'vote', votes: {}, revoteCandidates: undefined },
    effects: [...extraEffects, { type: 'timer:start', id: 'vote', seconds: state.params.voteSeconds }],
  };
}

function startWhiteGuess(state: UndercoverState): ReduceResult<UndercoverState> {
  const playerId = state.pendingWhiteGuessFor!;
  return {
    state: {
      ...state,
      phase: 'whiteGuess',
      pendingWhiteGuessFor: undefined,
      whiteGuess: { playerId, resolved: false },
    },
    effects: [
      { type: 'timer:start', id: 'whiteGuess', seconds: state.params.whiteGuessSeconds },
      { type: 'game:event', name: 'whiteGuessStarted' },
    ],
  };
}

function startNextRound(state: UndercoverState, ctx: EngineCtx): ReduceResult<UndercoverState> {
  const round = state.round + 1;
  return {
    state: {
      ...state,
      phase: 'describe',
      round,
      describePass: 1,
      // Dès le tour 2, Mr. White peut parler en premier (la contrainte ne vaut qu'au tour 1).
      speakingOrder: drawSpeakingOrder(state.alive, state.roles, round, ctx.rng),
      turnIndex: 0,
      votes: {},
      revoteCandidates: undefined,
      lastReveal: undefined,
      whiteGuess: undefined,
    },
    effects: [{ type: 'game:event', name: 'newRound', payload: { round } }],
  };
}

/** Fin de manche : dernière manche → fin de série ; sinon la suite viendra du serveur. */
function endManche(state: UndercoverState): ReduceResult<UndercoverState> {
  const winner = state.winner!;
  const isFinal = state.mancheIndex >= state.params.manchesCount;
  return {
    state: { ...state, phase: 'end' },
    effects: isFinal
      ? [{ type: 'game:ended', winner }]
      : [{ type: 'game:event', name: 'mancheEnded', payload: { winner, mancheIndex: state.mancheIndex } }],
  };
}

function handleTimeout(state: UndercoverState, timerId: 'discuss' | 'vote' | 'whiteGuess'): ReduceResult<UndercoverState> {
  // Timer périmé (phase déjà passée) → no-op silencieux.
  if (timerId === 'discuss' && state.phase === 'discuss') {
    return startVote(state);
  }
  if (timerId === 'vote' && state.phase === 'vote') {
    // Timeout 45 s → vote blanc pour les retardataires (fiche 5.1 étape 5).
    const votes = { ...state.votes };
    for (const id of state.alive) {
      if (!(id in votes)) votes[id] = 'blank';
    }
    return resolveVotes({ ...state, votes });
  }
  if (timerId === 'whiteGuess' && state.phase === 'whiteGuess' && state.whiteGuess && !state.whiteGuess.resolved) {
    const next: UndercoverState = {
      ...state,
      whiteGuess: { ...state.whiteGuess, correct: false, resolved: true },
      winner: evaluateWinner(state),
    };
    return { state: next, effects: [{ type: 'game:event', name: 'whiteGuessResolved', payload: { correct: false } }] };
  }
  return { state, effects: [] };
}

// ─── Dépouillement (fiche 5.1 étape 6 : égalités, re-vote, votes blancs) ────

function resolveVotes(baseState: UndercoverState, extraEffects: GameEffect[] = []): ReduceResult<UndercoverState> {
  // Bonus de « bon vote » : un dépouillement (élimination, égalité, re-vote
  // déclenché) marque les CIVILS ayant visé un infiltré — uniquement si les
  // civils n'ont pas tous voté la même chose. Une convergence unanime (plébiscite
  // dès le tour 1, dernier tour à 2 civils…) ne distingue personne : pas de
  // bonus, que la cible commune soit l'undercover ou Mr. White (cf. DECISIONS.md).
  const goodVoterIds = [...baseState.goodVoterIds];
  const civilianBallots = baseState.alive
    .filter((id) => baseState.roles[id] === 'civilian')
    .map((id) => baseState.votes[id] ?? 'blank');
  const civiliansUnanimous = new Set(civilianBallots).size <= 1;
  if (!civiliansUnanimous) {
    for (const [voterId, target] of Object.entries(baseState.votes)) {
      if (
        baseState.roles[voterId] === 'civilian' &&
        target !== 'blank' &&
        baseState.roles[target] !== 'civilian' &&
        !goodVoterIds.includes(voterId)
      ) {
        goodVoterIds.push(voterId);
      }
    }
  }
  const state: UndercoverState = { ...baseState, goodVoterIds };

  const counts = new Map<PlayerId, number>();
  let blankCount = 0;
  for (const target of Object.values(state.votes)) {
    if (target === 'blank') blankCount++;
    else counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  const tally = [...counts.entries()]
    .map(([playerId, count]) => ({ playerId, count }))
    .sort((x, y) => y.count - x.count);
  const votesByVoter = state.params.publicVotes
    ? Object.entries(state.votes).map(([voterId, target]) => ({ voterId, target }))
    : undefined;

  const max = tally.length > 0 ? tally[0].count : 0;

  // Tous blancs (ou aucun vote) : personne d'éliminé, nouveau tour.
  if (max === 0) {
    const blankStreak = state.blankStreak + 1;
    const outcome: UndercoverRevealOutcome = { kind: 'blank-noelim', tally, blankCount, votesByVoter };
    return {
      state: {
        ...state,
        phase: 'reveal',
        lastReveal: outcome,
        revoteCandidates: undefined,
        blankStreak,
        // Au 2e tour blanc consécutif, la TV suggère d'abandonner la manche.
        suggestAbort: blankStreak >= 2,
      },
      effects: [...extraEffects, { type: 'game:event', name: 'voteResolved', payload: { kind: outcome.kind } }],
    };
  }

  const leaders = tally.filter((t) => t.count === max).map((t) => t.playerId);

  if (leaders.length > 1) {
    if (!state.revoteCandidates) {
      // Égalité : re-vote immédiat entre les ex æquo uniquement.
      return {
        state: {
          ...state,
          phase: 'vote',
          votes: {},
          revoteCandidates: leaders,
        },
        effects: [
          ...extraEffects,
          { type: 'timer:start', id: 'vote', seconds: state.params.voteSeconds },
          { type: 'game:event', name: 'revote', payload: { candidates: leaders } },
        ],
      };
    }
    // Nouvelle égalité → personne n'est éliminé, on enchaîne un nouveau tour.
    const outcome: UndercoverRevealOutcome = { kind: 'tie-noelim', tally, blankCount, votesByVoter };
    return {
      state: {
        ...state,
        phase: 'reveal',
        lastReveal: outcome,
        revoteCandidates: undefined,
        blankStreak: 0,
        suggestAbort: false,
      },
      effects: [...extraEffects, { type: 'game:event', name: 'voteResolved', payload: { kind: outcome.kind } }],
    };
  }

  // Élimination unique : rôle révélé sur la TV (pas le mot).
  const eliminatedId = leaders[0];
  return applyElimination(state, eliminatedId, false, { tally, blankCount, votesByVoter }, extraEffects);
}

function applyElimination(
  state: UndercoverState,
  playerId: PlayerId,
  byAdmin: boolean,
  voteInfo: Pick<UndercoverRevealOutcome, 'tally' | 'blankCount' | 'votesByVoter'>,
  extraEffects: GameEffect[] = [],
): ReduceResult<UndercoverState> {
  const elimination: UndercoverElimination = {
    playerId,
    role: state.roles[playerId],
    round: state.round,
    byAdmin,
  };
  const afterElimination: UndercoverState = {
    ...state,
    alive: state.alive.filter((id) => id !== playerId),
    eliminations: [...state.eliminations, elimination],
    revoteCandidates: undefined,
    blankStreak: 0,
    suggestAbort: false,
  };

  // Mr. White éliminé PAR VOTE : droit de guess avant toute évaluation de fin.
  // Retiré administrativement : rôle révélé mais SANS droit de guess (fiche 5.1).
  const pendingGuess = !byAdmin && elimination.role === 'mrwhite';
  const winner = pendingGuess ? undefined : evaluateWinner(afterElimination);

  const outcome: UndercoverRevealOutcome = {
    kind: byAdmin ? 'admin-removal' : 'eliminated',
    eliminated: elimination,
    ...voteInfo,
  };

  return {
    state: {
      ...afterElimination,
      phase: 'reveal',
      lastReveal: outcome,
      pendingWhiteGuessFor: pendingGuess ? playerId : undefined,
      winner,
    },
    effects: [
      ...extraEffects,
      { type: 'game:event', name: 'playerEliminated', payload: { playerId, role: elimination.role, byAdmin } },
    ],
  };
}

// ─── Retrait administratif (déconnexion > 60 s, AFK — §3.4) ─────────────────

/**
 * Le retrait administratif clôt le tour en cours : élimination immédiate avec
 * rôle révélé (phase reveal), puis l'animateur enchaîne (nouveau tour ou fin).
 * Un vote/une discussion en cours est simplement abandonné (cf. DECISIONS.md).
 */
function removePlayer(state: UndercoverState, playerId: PlayerId): ReduceResult<UndercoverState> {
  const cancelEffects: GameEffect[] = [];
  if (state.phase === 'vote') cancelEffects.push({ type: 'timer:cancel', id: 'vote' });
  if (state.phase === 'discuss') cancelEffects.push({ type: 'timer:cancel', id: 'discuss' });
  return applyElimination({ ...state, votes: {} }, playerId, true, { tally: [], blankCount: 0 }, cancelEffects);
}

// ─── Points et récap (fiche 5.1 étape 10) ───────────────────────────────────

/**
 * Points de LA manche (barème révisé, cf. DECISIONS.md) :
 * civils vainqueurs → 2 pts chacun, +1 pour ceux qui ont visé un infiltré dans
 * un dépouillement ; undercover vainqueurs → 3 pts par infiltré vivant ;
 * Mr. White vainqueur au guess → 4 pts.
 */
export function undercoverManchePoints(
  state: UndercoverState,
): Array<{ playerId: PlayerId; points: number; goodVote: boolean }> {
  const winner = state.winner;
  return state.playerIds.map((playerId) => {
    const role = state.roles[playerId];
    const goodVote = role === 'civilian' && state.goodVoterIds.includes(playerId);
    let points = 0;
    if (winner === 'civilians' && role === 'civilian') {
      points = UNDERCOVER_POINTS.civilian + (goodVote ? UNDERCOVER_POINTS.goodVoteBonus : 0);
    }
    if (winner === 'infiltrators' && role !== 'civilian' && state.alive.includes(playerId)) {
      points = UNDERCOVER_POINTS.undercover;
    }
    if (winner === 'mrwhite' && role === 'mrwhite') points = UNDERCOVER_POINTS.mrwhite;
    return { playerId, points, goodVote };
  });
}

/** Cumul de la série : manches précédentes + manche courante (si terminée). */
export function undercoverCumulativePoints(state: UndercoverState): Array<{ playerId: PlayerId; points: number }> {
  const cumul = new Map<PlayerId, number>(Object.entries(state.carriedPoints));
  if (state.phase === 'end') {
    for (const { playerId, points } of undercoverManchePoints(state)) {
      cumul.set(playerId, (cumul.get(playerId) ?? 0) + points);
    }
  }
  for (const playerId of state.playerIds) {
    if (!cumul.has(playerId)) cumul.set(playerId, 0);
  }
  return [...cumul.entries()]
    .map(([playerId, points]) => ({ playerId, points }))
    .sort((x, y) => y.points - x.points);
}

export function undercoverSummary(winner: UndercoverWinner): string {
  switch (winner) {
    case 'civilians':
      return 'Victoire des civils';
    case 'infiltrators':
      return 'Victoire des infiltrés';
    case 'mrwhite':
      return 'Mr. White gagne seul';
  }
}

/** Résultat pour le récap de soirée — cumul de série, résumé selon 1 ou N manches. */
export function buildUndercoverResult(state: UndercoverState, players: Player[], endedAt: number): GameResult {
  const byId = new Map(players.map((p) => [p.id, p]));
  const cumulative = undercoverCumulativePoints(state);
  let summary: string;
  if (state.params.manchesCount <= 1) {
    summary = undercoverSummary(state.winner ?? 'civilians');
  } else {
    const top = cumulative.filter((c) => c.points === cumulative[0]?.points && c.points > 0);
    const names = top.map((c) => byId.get(c.playerId)?.name ?? '???').join(' & ');
    summary =
      top.length > 0
        ? `${state.mancheIndex} manches — en tête : ${names} (${top[0].points} pts)`
        : `${state.mancheIndex} manches jouées`;
  }
  return {
    game: 'undercover',
    endedAt,
    summary,
    points: cumulative.map(({ playerId, points }) => ({
      playerId,
      name: byId.get(playerId)?.name ?? '???',
      avatar: byId.get(playerId)?.avatar ?? '❓',
      points,
    })),
  };
}
