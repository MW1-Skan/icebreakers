/**
 * Taboo — machine à états pure (fiche 5.6 du PRD) : binômes, passages de 60 s,
 * buzz des arbitres.
 *
 * Aucune I/O : le deck complet (mélangé) est injecté à l'init ; l'épuisement en
 * cours de passage re-mélange les cartes des passages PRÉCÉDENTS via le RNG
 * injecté. Buzz ↔ Trouvé sont sérialisés par le numéro de carte (`cardSeq`) :
 * le premier événement reçu fait foi, l'autre est refusé avec un message.
 */
import { shuffled } from '../../shared';
import type {
  GameEffect,
  GameResult,
  Player,
  PlayerId,
  Rng,
  TabooAction,
  TabooCard,
  TabooParams,
  TabooPassage,
  TabooPassageSpec,
  TabooState,
} from '../../shared';
import { TABOO_MAX_PLAYERS, TABOO_MIN_PLAYERS, TABOO_SUDDEN_DEATH_SECONDS } from '../../shared';
import type { EngineCtx, GuardResult, ReduceResult } from '../engine';

// ─── Paramétrage, binômes, validation ───────────────────────────────────────

export function resolveTabooParams(partial: Partial<TabooParams>): TabooParams {
  return {
    passageSeconds: partial.passageSeconds ?? 60,
    passesPerTeam: partial.passesPerTeam ?? 2,
    hardPass: partial.hardPass ?? false,
    teams: partial.teams,
  };
}

export function validateTabooSetup(
  playerCount: number,
): { ok: true } | { ok: false; code: 'BAD_PLAYER_COUNT'; message: string } {
  if (playerCount < TABOO_MIN_PLAYERS || playerCount > TABOO_MAX_PLAYERS) {
    return {
      ok: false,
      code: 'BAD_PLAYER_COUNT',
      message: `Taboo se joue de ${TABOO_MIN_PLAYERS} à ${TABOO_MAX_PLAYERS} joueurs actifs (actuellement ${playerCount}).`,
    };
  }
  return { ok: true };
}

/**
 * Binômes : ceux du host s'ils partitionnent bien les joueurs (paires, un trio
 * si effectif impair), sinon tirage aléatoire.
 */
export function composeTeams(playerIds: PlayerId[], override: PlayerId[][] | undefined, rng: Rng): {
  teams: PlayerId[][];
  error?: string;
} {
  if (override) {
    const flat = override.flat();
    const valid =
      flat.length === playerIds.length &&
      new Set(flat).size === flat.length &&
      flat.every((id) => playerIds.includes(id)) &&
      override.every((t) => t.length === 2 || t.length === 3) &&
      override.filter((t) => t.length === 3).length === (playerIds.length % 2 === 1 ? 1 : 0);
    if (valid) return { teams: override.map((t) => [...t]) };
    return { teams: randomTeams(playerIds, rng), error: 'Binômes invalides — composition aléatoire utilisée.' };
  }
  return { teams: randomTeams(playerIds, rng) };
}

function randomTeams(playerIds: PlayerId[], rng: Rng): PlayerId[][] {
  const pool = shuffled(playerIds, rng);
  const teams: PlayerId[][] = [];
  // effectif impair → le dernier binôme devient un trio (tournant)
  while (pool.length > 0) {
    if (pool.length === 3) {
      teams.push(pool.splice(0, 3));
    } else {
      teams.push(pool.splice(0, 2));
    }
  }
  return teams;
}

/** Planning : passes × binômes ; dans un binôme, l'orateur tourne à chaque passage. */
function buildSchedule(teams: PlayerId[][], passesPerTeam: number, passageSeconds: number): TabooPassageSpec[] {
  const schedule: TabooPassageSpec[] = [];
  for (let pass = 0; pass < passesPerTeam; pass++) {
    teams.forEach((team, teamIndex) => {
      schedule.push({
        teamIndex,
        oratorId: team[pass % team.length],
        durationSeconds: passageSeconds,
        suddenDeath: false,
      });
    });
  }
  return schedule;
}

function makePassage(spec: TabooPassageSpec, teams: PlayerId[][]): TabooPassage {
  return {
    ...spec,
    guesserIds: teams[spec.teamIndex].filter((id) => id !== spec.oratorId),
    played: [],
    score: 0,
    aborted: false,
  };
}

// ─── Initialisation ─────────────────────────────────────────────────────────

export function initTaboo(
  playerIds: PlayerId[],
  cards: TabooCard[],
  params: TabooParams,
  ctx: EngineCtx,
): ReduceResult<TabooState> {
  const { teams } = composeTeams(playerIds, params.teams, ctx.rng);
  const schedule = buildSchedule(teams, params.passesPerTeam, params.passageSeconds);
  const [first, ...rest] = schedule;
  const state: TabooState = {
    kind: 'taboo',
    phase: 'prep',
    params,
    playerIds: [...playerIds],
    teams,
    schedule: rest,
    current: makePassage(first, teams),
    deck: shuffled(cards, ctx.rng),
    discardPool: [],
    cardSeq: 0,
    passages: [],
    frozen: false,
    replayedKeys: [],
    suddenDeathDone: false,
  };
  return { state, effects: [{ type: 'game:event', name: 'gameStarted' }] };
}

// ─── Sélecteurs ─────────────────────────────────────────────────────────────

export function arbitersOf(state: TabooState): PlayerId[] {
  if (!state.current) return [];
  const team = new Set(state.teams[state.current.teamIndex]);
  return state.playerIds.filter((id) => !team.has(id));
}

export function currentCard(state: TabooState): TabooCard | undefined {
  return state.phase === 'live' ? state.deck[0] : undefined;
}

/** Cumul par binôme (passages terminés non annulés). */
export function tabooTotals(state: TabooState): Array<{ teamIndex: number; points: number }> {
  const totals = state.teams.map((_, teamIndex) => ({ teamIndex, points: 0 }));
  for (const p of state.passages) {
    if (!p.aborted) totals[p.teamIndex].points += p.score;
  }
  return [...totals].sort((a, b) => b.points - a.points);
}

function passageKey(spec: TabooPassageSpec): string {
  return `${spec.teamIndex}:${spec.oratorId}:${spec.suddenDeath ? 'sd' : 'std'}`;
}

// ─── Garde de légalité ──────────────────────────────────────────────────────

export function guardTaboo(state: TabooState, action: TabooAction, _ctx: EngineCtx): GuardResult {
  const deny = (message: string): GuardResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });

  switch (action.type) {
    case 'GO':
      if (state.phase !== 'prep' || !state.current) return deny('Aucun passage à lancer.');
      if (action.playerId !== state.current.oratorId) return deny('Seul l’orateur lance le chrono.');
      return { ok: true };

    case 'FOUND':
    case 'PASS_CARD':
      if (state.phase !== 'live' || !state.current) return deny('Aucun passage en cours.');
      if (action.playerId !== state.current.oratorId) return deny('Seul l’orateur marque Trouvé/Passer.');
      if (state.deck.length === 0) return deny('Plus aucune carte disponible.');
      if (action.cardSeq !== state.cardSeq) return deny('Trop tard — la carte a changé.');
      return { ok: true };

    case 'BUZZ':
      if (state.phase !== 'live' || !state.current) return deny('Aucun passage en cours.');
      if (!arbitersOf(state).includes(action.playerId)) return deny('Seuls les arbitres buzzent.');
      // Sérialisation buzz ↔ trouvé : le premier reçu fait foi.
      if (action.cardSeq !== state.cardSeq) return deny('Trop tard — la carte a changé.');
      return { ok: true };

    case 'HOST_CANCEL_BUZZ': {
      if (state.phase !== 'live' && state.phase !== 'recap') return deny('Rien à annuler.');
      if (!state.lastBuzz) return deny('Aucun buzz sur ce passage.');
      const played = state.current?.played ?? [];
      const last = played[played.length - 1];
      if (!last || last.outcome !== 'buzzed') return deny('Le dernier buzz n’est plus annulable.');
      return { ok: true };
    }

    case 'HOST_NEXT':
      if (state.phase !== 'recap') return deny('Rien à avancer dans cette phase.');
      return { ok: true };

    case 'TIMEOUT':
      return { ok: true };

    case 'PLAYER_GONE':
      if (state.phase !== 'live' || state.frozen) return deny('Rien à geler.');
      return { ok: true };

    case 'PLAYER_BACK':
      if (!state.frozen) return deny('Aucun gel en cours.');
      return { ok: true };
  }
}

// ─── Réducteur ──────────────────────────────────────────────────────────────

export function reduceTaboo(state: TabooState, action: TabooAction, ctx: EngineCtx): ReduceResult<TabooState> {
  switch (action.type) {
    case 'GO': {
      // Deck épuisé entre deux passages → re-mélange des cartes déjà jouées.
      let deck = state.deck;
      let discardPool = state.discardPool;
      const effects: GameEffect[] = [];
      if (deck.length === 0 && discardPool.length > 0) {
        deck = shuffled(discardPool, ctx.rng);
        discardPool = [];
        effects.push({ type: 'game:event', name: 'deckReshuffled' });
      }
      return {
        state: { ...state, phase: 'live', deck, discardPool, cardSeq: state.cardSeq + 1, lastBuzz: undefined },
        effects: [
          ...effects,
          { type: 'timer:start', id: 'passage', seconds: state.current!.durationSeconds },
          { type: 'game:event', name: 'passageStarted' },
        ],
      };
    }

    case 'FOUND':
      return playCurrentCard(state, 'found', +1, ctx);

    case 'PASS_CARD':
      return playCurrentCard(state, 'passed', state.params.hardPass ? -1 : 0, ctx);

    case 'BUZZ': {
      const card = state.deck[0];
      const result = playCurrentCard(state, 'buzzed', -1, ctx);
      // La carte buzzée est défaussée et s'affiche 3 s sur la TV (publique).
      return {
        state: { ...result.state, lastBuzz: { card, cardSeq: state.cardSeq } },
        effects: [...result.effects, { type: 'game:event', name: 'buzz', payload: { word: card.word } }],
      };
    }

    case 'HOST_CANCEL_BUZZ': {
      const current = state.current!;
      const played = [...current.played];
      const last = played[played.length - 1];
      // annule le −1 ; restitue le +1 si le mot avait été trouvé juste avant
      const outcome = action.countAsFound ? 'buzzFound' : 'buzzCancelled';
      const delta = action.countAsFound ? 2 : 1; // −1 → 0 ou −1 → +1
      played[played.length - 1] = { ...last, outcome };
      return {
        state: {
          ...state,
          current: { ...current, played, score: current.score + delta },
          lastBuzz: undefined,
        },
        effects: [{ type: 'game:event', name: 'buzzCancelled', payload: { countAsFound: action.countAsFound } }],
      };
    }

    case 'TIMEOUT':
      return handleTimeout(state, action.timerId, ctx);

    case 'HOST_NEXT':
      return advance(state);

    case 'PLAYER_GONE':
      // Orateur/devineur déconnecté : chrono en pause, 30 s pour revenir.
      return {
        state: { ...state, frozen: true },
        effects: [
          { type: 'timer:pause', id: 'passage' },
          { type: 'timer:start', id: 'playerGone', seconds: 30 },
          { type: 'game:event', name: 'passageFrozen' },
        ],
      };

    case 'PLAYER_BACK':
      return {
        state: { ...state, frozen: false },
        effects: [
          { type: 'timer:cancel', id: 'playerGone' },
          { type: 'timer:resume', id: 'passage' },
          { type: 'game:event', name: 'passageResumed' },
        ],
      };
  }
}

/** Résout la carte courante et avance (re-mélange si le deck s'épuise). */
function playCurrentCard(
  state: TabooState,
  outcome: 'found' | 'passed' | 'buzzed',
  delta: number,
  ctx: EngineCtx,
): ReduceResult<TabooState> {
  const card = state.deck[0];
  const current = state.current!;
  let deck = state.deck.slice(1);
  let discardPool = state.discardPool;
  const effects: GameEffect[] = [];

  if (deck.length === 0) {
    if (discardPool.length > 0) {
      // Deck épuisé : re-mélange des cartes des passages précédents (jamais
      // celles du passage en cours).
      deck = shuffled(discardPool, ctx.rng);
      discardPool = [];
      effects.push({ type: 'game:event', name: 'deckReshuffled' });
    }
  }

  const next: TabooState = {
    ...state,
    deck,
    discardPool,
    cardSeq: state.cardSeq + 1,
    current: {
      ...current,
      played: [...current.played, { card, outcome }],
      score: current.score + delta,
    },
  };

  // Plus aucune carte disponible nulle part : le passage s'arrête là.
  if (next.deck.length === 0) {
    return endPassage(next, [...effects, { type: 'timer:cancel', id: 'passage' }]);
  }
  return { state: next, effects };
}

function handleTimeout(state: TabooState, timerId: 'passage' | 'playerGone', ctx: EngineCtx): ReduceResult<TabooState> {
  void ctx;
  if (timerId === 'passage' && state.phase === 'live') {
    return endPassage(state, []);
  }
  if (timerId === 'playerGone' && state.frozen) {
    // Passage annulé, rejoué en fin de rotation avec de nouvelles cartes (1×).
    const current = state.current!;
    const key = passageKey(current);
    const canReplay = !state.replayedKeys.includes(key);
    const spec: TabooPassageSpec = {
      teamIndex: current.teamIndex,
      oratorId: current.oratorId,
      durationSeconds: current.durationSeconds,
      suddenDeath: current.suddenDeath,
    };
    const aborted: TabooState = {
      ...state,
      frozen: false,
      current: { ...current, aborted: true },
      schedule: canReplay ? [...state.schedule, spec] : state.schedule,
      replayedKeys: canReplay ? [...state.replayedKeys, key] : state.replayedKeys,
    };
    return endPassage(aborted, [{ type: 'timer:cancel', id: 'passage' }]);
  }
  return { state, effects: [] };
}

/** Fin de passage : les cartes jouées rejoignent la réserve de re-mélange. */
function endPassage(state: TabooState, extraEffects: GameEffect[]): ReduceResult<TabooState> {
  const current = state.current!;
  return {
    state: {
      ...state,
      phase: 'recap',
      discardPool: [...state.discardPool, ...current.played.map((p) => p.card)],
    },
    effects: [...extraEffects, { type: 'game:event', name: 'passageEnded', payload: { score: current.score } }],
  };
}

/** Recap → passage suivant, mort subite sur égalité en tête, ou fin. */
function advance(state: TabooState): ReduceResult<TabooState> {
  const passages = state.current ? [...state.passages, state.current] : state.passages;
  const base: TabooState = { ...state, passages, current: undefined, lastBuzz: undefined };

  if (base.schedule.length > 0) {
    const [next, ...rest] = base.schedule;
    return {
      state: { ...base, phase: 'prep', schedule: rest, current: makePassage(next, base.teams) },
      effects: [{ type: 'game:event', name: 'passagePrepared' }],
    };
  }

  // Égalité en tête → mort subite 30 s pour chaque binôme ex æquo (une fois).
  const totals = tabooTotals(base);
  const top = totals.filter((t) => t.points === totals[0]?.points);
  if (top.length > 1 && !base.suddenDeathDone) {
    const specs = top.map(
      (t): TabooPassageSpec => ({
        teamIndex: t.teamIndex,
        // l'orateur est celui qui a le moins fait deviner
        oratorId: leastSuccessfulOrator(base, t.teamIndex),
        durationSeconds: TABOO_SUDDEN_DEATH_SECONDS,
        suddenDeath: true,
      }),
    );
    const [first, ...rest] = specs;
    return {
      state: {
        ...base,
        phase: 'prep',
        suddenDeathDone: true,
        schedule: rest,
        current: makePassage(first, base.teams),
      },
      effects: [{ type: 'game:event', name: 'suddenDeath', payload: { teams: top.map((t) => t.teamIndex) } }],
    };
  }

  // Nouvelle égalité (ou pas d'égalité) → fin, victoire éventuellement partagée.
  return {
    state: { ...base, phase: 'end' },
    effects: [{ type: 'game:ended' }, { type: 'game:event', name: 'gameEnded' }],
  };
}

/** Le membre du binôme qui, comme orateur, a le moins fait deviner. */
function leastSuccessfulOrator(state: TabooState, teamIndex: number): PlayerId {
  const team = state.teams[teamIndex];
  const foundByOrator = new Map<PlayerId, number>(team.map((id) => [id, 0]));
  for (const p of state.passages) {
    if (p.teamIndex !== teamIndex || p.aborted) continue;
    const found = p.played.filter((c) => c.outcome === 'found' || c.outcome === 'buzzFound').length;
    foundByOrator.set(p.oratorId, (foundByOrator.get(p.oratorId) ?? 0) + found);
  }
  return [...foundByOrator.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

// ─── Récap ──────────────────────────────────────────────────────────────────

export function buildTabooResult(state: TabooState, players: Player[], endedAt: number): GameResult {
  const byId = new Map(players.map((p) => [p.id, p]));
  const totals = tabooTotals(state);
  const top = totals.filter((t) => t.points === totals[0]?.points);
  const teamName = (teamIndex: number): string =>
    state.teams[teamIndex].map((id) => byId.get(id)?.name ?? '???').join(' & ');
  return {
    game: 'taboo',
    endedAt,
    summary:
      top.length > 1
        ? `Victoire partagée (${top.map((t) => teamName(t.teamIndex)).join(' / ')}, ${top[0].points} pts)`
        : `${teamName(top[0].teamIndex)} gagnent (${top[0].points} pts)`,
    points: totals.flatMap(({ teamIndex, points }) =>
      state.teams[teamIndex].map((playerId) => ({
        playerId,
        name: byId.get(playerId)?.name ?? '???',
        avatar: byId.get(playerId)?.avatar ?? '❓',
        points,
      })),
    ),
  };
}
