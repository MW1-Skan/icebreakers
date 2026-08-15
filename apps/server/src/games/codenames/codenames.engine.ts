/**
 * Codenames — machine à états pure (fiche validée en session) : deux équipes,
 * un maître-espion par équipe, une grille dont les couleurs sont secrètes.
 *
 * Aucune I/O : la grille (mots distincts) est injectée à l'init ; le serveur
 * rejette automatiquement un indice égal à un mot non révélé de la grille
 * (normalisé). Les touches sont sérialisées par l'ordre d'arrivée (le guard
 * refuse toute touche hors tour ou sans budget restant).
 */
import { normalizeText, shuffled } from '../../shared';
import type {
  CodenamesAction,
  CodenamesCard,
  CodenamesCardKind,
  CodenamesClue,
  CodenamesMancheResult,
  CodenamesParams,
  CodenamesState,
  CodenamesTeam,
  CodenamesTimerId,
  GameEffect,
  GameResult,
  Player,
  PlayerId,
  Rng,
} from '../../shared';
import {
  CODENAMES_DISTRIBUTIONS,
  CODENAMES_MAX_PLAYERS,
  CODENAMES_MIN_PLAYERS,
  CODENAMES_TEAM_LABELS,
} from '../../shared';
import type { EngineCtx, GuardResult, ReduceResult } from '../engine';

// ─── Paramétrage, équipes, validation ───────────────────────────────────────

export function resolveCodenamesParams(partial: Partial<CodenamesParams>): CodenamesParams {
  return {
    gridSize: partial.gridSize ?? 25,
    manchesCount: partial.manchesCount ?? 1,
    clueSeconds: partial.clueSeconds ?? 90,
    guessSeconds: partial.guessSeconds ?? 120,
    teams: partial.teams,
    spymasters: partial.spymasters,
  };
}

export function validateCodenamesSetup(
  playerCount: number,
): { ok: true } | { ok: false; code: 'BAD_PLAYER_COUNT'; message: string } {
  if (playerCount < CODENAMES_MIN_PLAYERS || playerCount > CODENAMES_MAX_PLAYERS) {
    return {
      ok: false,
      code: 'BAD_PLAYER_COUNT',
      message: `Codenames se joue de ${CODENAMES_MIN_PLAYERS} à ${CODENAMES_MAX_PLAYERS} joueurs actifs (actuellement ${playerCount}).`,
    };
  }
  return { ok: true };
}

/**
 * Équipes : celles du host si elles partitionnent les joueurs en deux camps
 * de ≥ 2, sinon répartition aléatoire (l'écart d'effectif ne dépasse jamais 1).
 * Maîtres-espions : ceux du host s'ils appartiennent à leur équipe, sinon tirés.
 */
export function composeCodenamesTeams(
  playerIds: PlayerId[],
  teamsOverride: [PlayerId[], PlayerId[]] | undefined,
  spymastersOverride: [PlayerId, PlayerId] | undefined,
  rng: Rng,
): { teams: [PlayerId[], PlayerId[]]; spymasters: [PlayerId, PlayerId] } {
  let teams: [PlayerId[], PlayerId[]];
  if (teamsOverride && validTeams(playerIds, teamsOverride)) {
    teams = [[...teamsOverride[0]], [...teamsOverride[1]]];
  } else {
    const pool = shuffled(playerIds, rng);
    const half = Math.ceil(pool.length / 2);
    teams = [pool.slice(0, half), pool.slice(half)];
  }
  const spymasters: [PlayerId, PlayerId] = [pickSpymaster(teams[0], spymastersOverride?.[0], rng), pickSpymaster(teams[1], spymastersOverride?.[1], rng)];
  return { teams, spymasters };
}

function validTeams(playerIds: PlayerId[], teams: [PlayerId[], PlayerId[]]): boolean {
  const flat = [...teams[0], ...teams[1]];
  return (
    flat.length === playerIds.length &&
    new Set(flat).size === flat.length &&
    flat.every((id) => playerIds.includes(id)) &&
    teams.every((t) => t.length >= 2)
  );
}

function pickSpymaster(team: PlayerId[], override: PlayerId | undefined, rng: Rng): PlayerId {
  if (override && team.includes(override)) return override;
  return team[Math.floor(rng() * team.length)];
}

// ─── Initialisation ─────────────────────────────────────────────────────────

export interface CodenamesInitOpts {
  mancheIndex?: number;
  carriedPoints?: Record<PlayerId, number>;
  history?: CodenamesMancheResult[];
  teams?: [PlayerId[], PlayerId[]];
  spymasters?: [PlayerId, PlayerId];
  startingTeam?: CodenamesTeam;
}

export function initCodenames(
  playerIds: PlayerId[],
  words: string[],
  params: CodenamesParams,
  ctx: EngineCtx,
  opts: CodenamesInitOpts = {},
): ReduceResult<CodenamesState> {
  const { teams, spymasters } =
    opts.teams && opts.spymasters
      ? { teams: opts.teams, spymasters: opts.spymasters }
      : composeCodenamesTeams(playerIds, params.teams, params.spymasters, ctx.rng);
  const startingTeam: CodenamesTeam = opts.startingTeam ?? (ctx.rng() < 0.5 ? 0 : 1);

  const [startCount, otherCount, neutralCount, assassinCount] = CODENAMES_DISTRIBUTIONS[params.gridSize];
  const kinds: CodenamesCardKind[] = [
    ...Array<CodenamesCardKind>(startCount).fill(startingTeam === 0 ? 'red' : 'blue'),
    ...Array<CodenamesCardKind>(otherCount).fill(startingTeam === 0 ? 'blue' : 'red'),
    ...Array<CodenamesCardKind>(neutralCount).fill('neutral'),
    ...Array<CodenamesCardKind>(assassinCount).fill('assassin'),
  ];
  const cards: CodenamesCard[] = shuffled(kinds, ctx.rng).map((kind, i) => ({
    word: words[i],
    kind,
    revealed: false,
  }));

  const state: CodenamesState = {
    kind: 'codenames',
    phase: 'brief',
    params,
    playerIds: [...playerIds],
    teams: [[...teams[0]], [...teams[1]]],
    spymasters: [...spymasters],
    mancheIndex: opts.mancheIndex ?? 1,
    startingTeam,
    cards,
    activeTeam: startingTeam,
    currentClue: undefined,
    clues: [],
    seenKeyIds: [],
    winner: undefined,
    endedByAssassin: false,
    assassinTeam: undefined,
    history: opts.history ?? [],
    carriedPoints: { ...(opts.carriedPoints ?? {}) },
    frozen: false,
  };
  return { state, effects: [{ type: 'game:event', name: 'gameStarted' }] };
}

/** Manche suivante : équipes stables, maîtres-espions TOURNANTS, camp de départ alterné. */
export function startNextCodenamesManche(
  state: CodenamesState,
  words: string[],
  ctx: EngineCtx,
): ReduceResult<CodenamesState> | undefined {
  if (state.phase !== 'end' || state.mancheIndex >= state.params.manchesCount) return undefined;
  const carriedPoints = { ...state.carriedPoints };
  for (const { playerId, points } of codenamesManchePoints(state)) {
    carriedPoints[playerId] = (carriedPoints[playerId] ?? 0) + points;
  }
  const rotated: [PlayerId, PlayerId] = [nextSpymaster(state, 0), nextSpymaster(state, 1)];
  return initCodenames(state.playerIds, words, state.params, ctx, {
    mancheIndex: state.mancheIndex + 1,
    carriedPoints,
    history: [...state.history, mancheResultOf(state)],
    teams: state.teams,
    spymasters: rotated,
    startingTeam: (1 - state.startingTeam) as CodenamesTeam,
  });
}

function nextSpymaster(state: CodenamesState, team: CodenamesTeam): PlayerId {
  const members = state.teams[team];
  const idx = members.indexOf(state.spymasters[team]);
  return members[(idx + 1) % members.length];
}

// ─── Sélecteurs ─────────────────────────────────────────────────────────────

export function codenamesTeamOf(state: CodenamesState, playerId: PlayerId): CodenamesTeam | undefined {
  if (state.teams[0].includes(playerId)) return 0;
  if (state.teams[1].includes(playerId)) return 1;
  return undefined;
}

function kindOfTeam(team: CodenamesTeam): CodenamesCardKind {
  return team === 0 ? 'red' : 'blue';
}

/** Mots restant à trouver par équipe (compteurs publics). */
export function codenamesRemaining(state: CodenamesState): [number, number] {
  const count = (team: CodenamesTeam): number =>
    state.cards.filter((c) => !c.revealed && c.kind === kindOfTeam(team)).length;
  return [count(0), count(1)];
}

function guessersOf(state: CodenamesState, team: CodenamesTeam): PlayerId[] {
  return state.teams[team].filter((id) => id !== state.spymasters[team]);
}

function guessesMade(state: CodenamesState): number {
  if (!state.currentClue) return 0;
  return state.currentClue.count + 1 - state.currentClue.guessesLeft;
}

/** Barème de la manche courante : gagnants 3, perdants 1 (0 si défaite assassin). */
export function codenamesManchePoints(state: CodenamesState): Array<{ playerId: PlayerId; points: number }> {
  if (state.phase !== 'end' || state.winner === undefined) return [];
  const loserPoints = state.endedByAssassin ? 0 : 1;
  return state.playerIds.map((playerId) => {
    const team = codenamesTeamOf(state, playerId);
    return { playerId, points: team === state.winner ? 3 : loserPoints };
  });
}

/** Cumul de série : manches précédentes + manche courante si terminée. */
export function codenamesCumulative(state: CodenamesState): Array<{ playerId: PlayerId; points: number }> {
  const totals: Record<PlayerId, number> = { ...state.carriedPoints };
  for (const { playerId, points } of codenamesManchePoints(state)) {
    totals[playerId] = (totals[playerId] ?? 0) + points;
  }
  return state.playerIds
    .map((playerId) => ({ playerId, points: totals[playerId] ?? 0 }))
    .sort((a, b) => b.points - a.points);
}

function mancheResultOf(state: CodenamesState): CodenamesMancheResult {
  const [redTotal, blueTotal] = [
    state.cards.filter((c) => c.kind === 'red' && c.revealed).length,
    state.cards.filter((c) => c.kind === 'blue' && c.revealed).length,
  ];
  return {
    winner: state.winner!,
    byAssassin: state.endedByAssassin,
    assassinTeam: state.assassinTeam,
    startingTeam: state.startingTeam,
    revealedWords: [redTotal, blueTotal],
    cluesCount: state.clues.length,
  };
}

// ─── Garde de légalité ──────────────────────────────────────────────────────

export function guardCodenames(state: CodenamesState, action: CodenamesAction, ctx: EngineCtx): GuardResult {
  void ctx;
  const deny = (message: string): GuardResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });

  switch (action.type) {
    case 'SEEN_KEY':
      if (state.phase !== 'brief') return deny('La clé se consulte pendant la préparation.');
      if (!state.spymasters.includes(action.playerId)) return deny('Seuls les maîtres-espions ont la clé.');
      return { ok: true };

    case 'HOST_NEXT':
      if (state.phase !== 'brief') return deny('Rien à avancer dans cette phase.');
      return { ok: true };

    case 'GIVE_CLUE': {
      if (state.phase !== 'clue') return deny('Aucun indice attendu maintenant.');
      if (state.frozen) return deny('Le jeu est en pause (déconnexion).');
      if (action.playerId !== state.spymasters[state.activeTeam]) {
        return deny('Seul le maître-espion de l’équipe active donne l’indice.');
      }
      if (/\s/.test(action.word.trim())) return deny('Un indice = UN seul mot (sans espace).');
      const normalized = normalizeText(action.word);
      const clash = state.cards.find((c) => !c.revealed && normalizeText(c.word) === normalized);
      if (clash) return deny(`« ${clash.word} » est sur la grille — choisis un autre indice.`);
      return { ok: true };
    }

    case 'REVEAL': {
      if (state.phase !== 'guess' || !state.currentClue) return deny('Aucune devinette en cours.');
      if (state.frozen) return deny('Le jeu est en pause (déconnexion).');
      if (!guessersOf(state, state.activeTeam).includes(action.playerId)) {
        return deny('Seuls les devineurs de l’équipe active touchent la grille.');
      }
      const card = state.cards[action.cardIndex];
      if (!card) return deny('Carte inconnue.');
      if (card.revealed) return deny('Cette carte est déjà révélée.');
      if (state.currentClue.guessesLeft <= 0) return deny('Plus de touche disponible sur cet indice.');
      return { ok: true };
    }

    case 'STOP_GUESSING':
      if (state.phase !== 'guess' || !state.currentClue) return deny('Aucune devinette en cours.');
      if (state.frozen) return deny('Le jeu est en pause (déconnexion).');
      if (!guessersOf(state, state.activeTeam).includes(action.playerId)) {
        return deny('Seuls les devineurs de l’équipe active peuvent s’arrêter.');
      }
      if (guessesMade(state) === 0) return deny('Au moins une touche avant de s’arrêter (règle officielle).');
      return { ok: true };

    case 'HOST_INVALIDATE_CLUE':
      if (state.phase !== 'guess' || !state.currentClue) return deny('Aucun indice à invalider.');
      if (guessesMade(state) > 0) return deny('Trop tard — une carte a déjà été touchée (arbitrage oral).');
      return { ok: true };

    case 'HOST_TRANSFER_SPYMASTER': {
      if (state.phase === 'end') return deny('La manche est terminée.');
      const team = codenamesTeamOf(state, action.playerId);
      if (team === undefined) return deny('Ce joueur n’est pas dans la partie.');
      if (state.spymasters[team] === action.playerId) return deny('Ce joueur est déjà maître-espion.');
      return { ok: true };
    }

    case 'TIMEOUT':
      return { ok: true };

    case 'PLAYER_GONE':
      if (state.frozen || (state.phase !== 'clue' && state.phase !== 'guess')) return deny('Rien à geler.');
      return { ok: true };

    case 'PLAYER_BACK':
      if (!state.frozen) return deny('Aucun gel en cours.');
      return { ok: true };
  }
}

// ─── Réducteur ──────────────────────────────────────────────────────────────

export function reduceCodenames(
  state: CodenamesState,
  action: CodenamesAction,
  ctx: EngineCtx,
): ReduceResult<CodenamesState> {
  switch (action.type) {
    case 'SEEN_KEY': {
      if (state.seenKeyIds.includes(action.playerId)) return { state, effects: [] };
      return { state: { ...state, seenKeyIds: [...state.seenKeyIds, action.playerId] }, effects: [] };
    }

    case 'HOST_NEXT':
      // brief → premier indice de l'équipe qui commence.
      return {
        state: { ...state, phase: 'clue' },
        effects: [...startClueTimer(state), { type: 'game:event', name: 'cluePhase' }],
      };

    case 'GIVE_CLUE': {
      const clue: CodenamesClue = {
        team: state.activeTeam,
        spymasterId: action.playerId,
        word: action.word.trim(),
        count: action.count,
        guesses: [],
        stopped: false,
      };
      return {
        state: {
          ...state,
          phase: 'guess',
          clues: [...state.clues, clue],
          currentClue: {
            spymasterId: action.playerId,
            word: clue.word,
            count: action.count,
            guessesLeft: action.count + 1,
          },
        },
        effects: [
          { type: 'timer:cancel', id: 'clue' },
          ...startGuessTimer(state),
          { type: 'game:event', name: 'clueGiven', payload: { word: clue.word, count: action.count } },
        ],
      };
    }

    case 'REVEAL':
      return reveal(state, action.playerId, action.cardIndex);

    case 'STOP_GUESSING': {
      const clues = markLastClue(state.clues, { stopped: true });
      return endTurn({ ...state, clues }, [{ type: 'game:event', name: 'stopped' }]);
    }

    case 'HOST_INVALIDATE_CLUE': {
      // Avant toute touche : l'indice est retiré, le maître-espion en redonne un.
      const clues = state.clues.slice(0, -1);
      return {
        state: { ...state, phase: 'clue', clues, currentClue: undefined },
        effects: [
          { type: 'timer:cancel', id: 'guess' },
          ...startClueTimer(state),
          { type: 'game:event', name: 'clueInvalidated' },
        ],
      };
    }

    case 'HOST_TRANSFER_SPYMASTER': {
      const team = codenamesTeamOf(state, action.playerId)!;
      const spymasters: [PlayerId, PlayerId] = [...state.spymasters];
      spymasters[team] = action.playerId;
      // Le transfert répond au gel « maître-espion actif déconnecté » : si le
      // nouveau est connecté et que c'était le blocage, le jeu repart.
      const unfreeze =
        state.frozen &&
        state.phase === 'clue' &&
        team === state.activeTeam &&
        (ctx.connectedIds?.includes(action.playerId) ?? true);
      return {
        state: { ...state, spymasters, frozen: unfreeze ? false : state.frozen },
        effects: [
          ...(unfreeze
            ? [{ type: 'timer:resume', id: 'clue' } as GameEffect, { type: 'game:event', name: 'gameResumed' } as GameEffect]
            : []),
          { type: 'game:event', name: 'spymasterTransferred', payload: { team, playerId: action.playerId } },
        ],
      };
    }

    case 'TIMEOUT':
      return handleTimeout(state, action.timerId);

    case 'PLAYER_GONE':
      return {
        state: { ...state, frozen: true },
        effects: [
          { type: 'timer:pause', id: state.phase === 'clue' ? 'clue' : 'guess' },
          { type: 'game:event', name: 'gameFrozen' },
        ],
      };

    case 'PLAYER_BACK':
      return {
        state: { ...state, frozen: false },
        effects: [
          { type: 'timer:resume', id: state.phase === 'clue' ? 'clue' : 'guess' },
          { type: 'game:event', name: 'gameResumed' },
        ],
      };
  }
}

function startClueTimer(state: CodenamesState): GameEffect[] {
  return state.params.clueSeconds > 0
    ? [{ type: 'timer:start', id: 'clue', seconds: state.params.clueSeconds }]
    : [];
}

function startGuessTimer(state: CodenamesState): GameEffect[] {
  return state.params.guessSeconds > 0
    ? [{ type: 'timer:start', id: 'guess', seconds: state.params.guessSeconds }]
    : [];
}

function markLastClue(clues: CodenamesClue[], patch: Partial<CodenamesClue>): CodenamesClue[] {
  const out = [...clues];
  out[out.length - 1] = { ...out[out.length - 1], ...patch };
  return out;
}

/** Résout une touche : sa couleur → on continue ; neutre/adverse → fin de tour ; assassin → défaite. */
function reveal(state: CodenamesState, playerId: PlayerId, cardIndex: number): ReduceResult<CodenamesState> {
  const card = state.cards[cardIndex];
  const cards = state.cards.map((c, i) => (i === cardIndex ? { ...c, revealed: true } : c));
  const clues = markLastClue(state.clues, {
    guesses: [...state.clues[state.clues.length - 1].guesses, { cardIndex, kind: card.kind, playerId }],
  });
  const next: CodenamesState = {
    ...state,
    cards,
    clues,
    currentClue: { ...state.currentClue!, guessesLeft: state.currentClue!.guessesLeft - 1 },
  };
  const revealEvent: GameEffect = {
    type: 'game:event',
    name: 'cardRevealed',
    payload: { word: card.word, kind: card.kind },
  };

  if (card.kind === 'assassin') {
    const winner = (1 - state.activeTeam) as CodenamesTeam;
    return endManche(
      { ...next, endedByAssassin: true, assassinTeam: state.activeTeam },
      winner,
      [revealEvent, { type: 'game:event', name: 'assassin', payload: { team: state.activeTeam } }],
    );
  }

  const remaining = codenamesRemaining(next);
  const ownKind = kindOfTeam(state.activeTeam);

  if (card.kind === ownKind) {
    if (remaining[state.activeTeam] === 0) {
      return endManche(next, state.activeTeam, [revealEvent]);
    }
    if (next.currentClue!.guessesLeft <= 0) {
      return endTurn(next, [revealEvent]);
    }
    return { state: next, effects: [revealEvent] };
  }

  if (card.kind !== 'neutral') {
    // Carte adverse : elle compte pour l'adversaire — qui peut gagner sur ce cadeau.
    const opponent = (1 - state.activeTeam) as CodenamesTeam;
    if (remaining[opponent] === 0) {
      return endManche(next, opponent, [revealEvent]);
    }
  }
  return endTurn(next, [revealEvent]);
}

function endTurn(state: CodenamesState, extraEffects: GameEffect[]): ReduceResult<CodenamesState> {
  const next: CodenamesState = {
    ...state,
    phase: 'clue',
    activeTeam: (1 - state.activeTeam) as CodenamesTeam,
    currentClue: undefined,
  };
  return {
    state: next,
    effects: [
      ...extraEffects,
      { type: 'timer:cancel', id: 'guess' },
      ...startClueTimer(next),
      { type: 'game:event', name: 'turnEnded', payload: { activeTeam: next.activeTeam } },
    ],
  };
}

function endManche(
  state: CodenamesState,
  winner: CodenamesTeam,
  extraEffects: GameEffect[],
): ReduceResult<CodenamesState> {
  const next: CodenamesState = { ...state, phase: 'end', winner, currentClue: undefined };
  const isFinal = state.mancheIndex >= state.params.manchesCount;
  return {
    state: next,
    effects: [
      ...extraEffects,
      { type: 'timer:cancel', id: 'clue' },
      { type: 'timer:cancel', id: 'guess' },
      { type: 'game:event', name: 'mancheEnded', payload: { winner } },
      ...(isFinal ? [{ type: 'game:ended', winner: CODENAMES_TEAM_LABELS[winner] } as GameEffect] : []),
    ],
  };
}

function handleTimeout(state: CodenamesState, timerId: CodenamesTimerId): ReduceResult<CodenamesState> {
  if (timerId === 'clue' && state.phase === 'clue' && !state.frozen) {
    // Pas d'indice à temps : le tour passe à l'autre équipe.
    const next: CodenamesState = { ...state, activeTeam: (1 - state.activeTeam) as CodenamesTeam };
    return {
      state: next,
      effects: [...startClueTimer(next), { type: 'game:event', name: 'clueTimeout' }],
    };
  }
  if (timerId === 'guess' && state.phase === 'guess' && !state.frozen) {
    return endTurn(state, [{ type: 'game:event', name: 'guessTimeout' }]);
  }
  return { state, effects: [] };
}

// ─── Récap ──────────────────────────────────────────────────────────────────

export function buildCodenamesResult(state: CodenamesState, players: Player[], endedAt: number): GameResult {
  const byId = new Map(players.map((p) => [p.id, p]));
  const cumulative = codenamesCumulative(state);
  const allManches = [...state.history, ...(state.phase === 'end' && state.winner !== undefined ? [mancheResultOf(state)] : [])];

  let summary: string;
  if (allManches.length > 1) {
    const wins: [number, number] = [0, 0];
    for (const m of allManches) wins[m.winner]++;
    const lead: CodenamesTeam = wins[0] >= wins[1] ? 0 : 1;
    summary = `Série : ${CODENAMES_TEAM_LABELS[lead]} ${wins[lead]} – ${wins[1 - lead]} ${CODENAMES_TEAM_LABELS[1 - lead]}`;
  } else {
    const m = allManches[0];
    if (!m) {
      summary = 'Partie interrompue';
    } else if (m.byAssassin) {
      summary = `Les ${CODENAMES_TEAM_LABELS[m.winner]}s gagnent — les ${CODENAMES_TEAM_LABELS[m.assassinTeam!]}s ont touché l'assassin ☠️`;
    } else {
      const [red, blue] = m.revealedWords;
      const score = m.winner === 0 ? `${red}–${blue}` : `${blue}–${red}`;
      summary = `Les ${CODENAMES_TEAM_LABELS[m.winner]}s gagnent ${score}`;
    }
  }

  return {
    game: 'codenames',
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
