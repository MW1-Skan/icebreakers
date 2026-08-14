/**
 * Ito — machine à états pure (fiche 5.5 du PRD).
 *
 * Aucune I/O : le thème est tiré par le serveur et injecté ; les nombres
 * sortent du RNG injecté. Les poses arrivent sérialisées par le serveur et
 * chacune est évaluée dans l'état résultant de la précédente (cas limite
 * « deux poses quasi simultanées »). Chaque cas limite de la fiche a son test.
 */
import type {
  GameEffect,
  GameResult,
  ItoAction,
  ItoFriseCard,
  ItoParams,
  ItoState,
  Player,
  PlayerId,
  Rng,
} from '../../shared';
import { ITO_MAX_PLAYERS, ITO_MIN_PLAYERS } from '../../shared';
import type { EngineCtx, GuardResult, ReduceResult } from '../engine';

// ─── Paramétrage et validation ──────────────────────────────────────────────

export function resolveItoParams(partial: Partial<ItoParams>): ItoParams {
  return {
    manchesCount: partial.manchesCount ?? 3,
    livesCount: partial.livesCount ?? 3,
    rangeMax: partial.rangeMax ?? 100,
    minGap: partial.minGap ?? 8,
  };
}

export function validateItoSetup(
  playerCount: number,
): { ok: true } | { ok: false; code: 'BAD_PLAYER_COUNT'; message: string } {
  if (playerCount < ITO_MIN_PLAYERS || playerCount > ITO_MAX_PLAYERS) {
    return {
      ok: false,
      code: 'BAD_PLAYER_COUNT',
      message: `Ito se joue de ${ITO_MIN_PLAYERS} à ${ITO_MAX_PLAYERS} joueurs actifs (actuellement ${playerCount}).`,
    };
  }
  return { ok: true };
}

/**
 * Écart maximal garantissable pour n nombres distincts dans 1..rangeMax :
 * on tire n valeurs distinctes dans 1..(rangeMax − (n−1)(g−1)) puis on étale.
 */
export function feasibleGap(playerCount: number, rangeMax: number, requestedGap: number): number {
  if (playerCount <= 1) return requestedGap;
  const maxGap = Math.floor((rangeMax - playerCount) / (playerCount - 1)) + 1;
  return Math.max(1, Math.min(requestedGap, maxGap));
}

/** Nombres uniques 1..rangeMax avec écart minimal garanti entre deux quelconques. */
export function drawNumbers(
  playerIds: PlayerId[],
  rangeMax: number,
  gap: number,
  rng: Rng,
): Record<PlayerId, number> {
  const n = playerIds.length;
  const compressedMax = rangeMax - (n - 1) * (gap - 1);
  // n valeurs distinctes dans 1..compressedMax (tirage sans remise)
  const pool = Array.from({ length: compressedMax }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const drawn = pool.slice(0, n).sort((a, b) => a - b);
  // étalement : + (i)(g−1) garantit un écart ≥ g entre valeurs consécutives
  const spread = drawn.map((v, i) => v + i * (gap - 1));
  // attribution aléatoire des nombres aux joueurs
  const shuffledIds = [...playerIds];
  for (let i = shuffledIds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]];
  }
  const numbers: Record<PlayerId, number> = {};
  shuffledIds.forEach((id, i) => (numbers[id] = spread[i]));
  return numbers;
}

// ─── Initialisation et manches ──────────────────────────────────────────────

function startManche(
  base: ItoState,
  mancheIndex: number,
  theme: string,
  ctx: EngineCtx,
): ItoState {
  const gap = feasibleGap(base.playerIds.length, base.params.rangeMax, base.params.minGap);
  return {
    ...base,
    phase: 'play',
    mancheIndex,
    theme,
    numbers: drawNumbers(base.playerIds, base.params.rangeMax, gap, ctx.rng),
    holders: [...base.playerIds],
    frise: [],
    effectiveGap: gap,
    themeLocked: false,
  };
}

export function initIto(
  playerIds: PlayerId[],
  theme: string,
  params: ItoParams,
  ctx: EngineCtx,
): ReduceResult<ItoState> {
  const base: ItoState = {
    kind: 'ito',
    phase: 'play',
    params,
    playerIds: [...playerIds],
    mancheIndex: 1,
    theme,
    numbers: {},
    holders: [],
    frise: [],
    lives: params.livesCount,
    effectiveGap: params.minGap,
    themeLocked: false,
    history: [],
  };
  return {
    state: startManche(base, 1, theme, ctx),
    effects: [{ type: 'game:event', name: 'gameStarted' }],
  };
}

/** Manche suivante (thème tiré par le serveur). Renvoie null si c'était la dernière. */
export function startNextItoManche(state: ItoState, theme: string, ctx: EngineCtx): ReduceResult<ItoState> | null {
  if (state.mancheIndex >= state.params.manchesCount) return null;
  const mancheIndex = state.mancheIndex + 1;
  return {
    state: startManche(state, mancheIndex, theme, ctx),
    effects: [{ type: 'game:event', name: 'mancheStarted', payload: { mancheIndex } }],
  };
}

/** « Changer de thème » (host) : uniquement avant la première pose. */
export function canChangeTheme(state: ItoState): GuardResult {
  if (state.phase !== 'play') return { ok: false, code: 'ACTION_NOT_ALLOWED', message: 'Manche terminée.' };
  if (state.themeLocked) {
    return { ok: false, code: 'ACTION_NOT_ALLOWED', message: 'Trop tard : une carte a déjà été posée.' };
  }
  return { ok: true };
}

export function applyThemeChange(state: ItoState, theme: string): ReduceResult<ItoState> {
  return {
    state: { ...state, theme },
    effects: [{ type: 'game:event', name: 'themeChanged' }],
  };
}

// ─── Garde de légalité ──────────────────────────────────────────────────────

export function guardIto(state: ItoState, action: ItoAction, _ctx: EngineCtx): GuardResult {
  const deny = (message: string): GuardResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });

  switch (action.type) {
    case 'PLAY_CARD':
      if (state.phase !== 'play') return deny('La manche est terminée.');
      if (!state.holders.includes(action.playerId)) return deny('Ta carte est déjà posée.');
      return { ok: true };

    case 'HOST_RELEASE_CARD':
      if (state.phase !== 'play') return deny('La manche est terminée.');
      if (!state.holders.includes(action.playerId)) return deny('Ce joueur n’a plus de carte en main.');
      return { ok: true };

    case 'HOST_NEXT':
      if (state.phase !== 'mancheEnd') return deny('Rien à avancer dans cette phase.');
      return { ok: true };
  }
}

// ─── Réducteur ──────────────────────────────────────────────────────────────

export function reduceIto(state: ItoState, action: ItoAction, ctx: EngineCtx): ReduceResult<ItoState> {
  void ctx;
  switch (action.type) {
    case 'PLAY_CARD':
      return playCard(state, action.playerId);

    case 'HOST_RELEASE_CARD': {
      // Déconnexion > 60 s : la carte est révélée et défaussée SANS coût de vie.
      const card: ItoFriseCard = {
        playerId: action.playerId,
        number: state.numbers[action.playerId],
        kind: 'released',
      };
      const next: ItoState = {
        ...state,
        holders: state.holders.filter((id) => id !== action.playerId),
        frise: [...state.frise, card],
        themeLocked: true,
      };
      return finishMancheIfDone(next, [
        { type: 'game:event', name: 'cardReleased', payload: { playerId: action.playerId } },
      ]);
    }

    case 'HOST_NEXT':
      // La manche suivante vient du serveur (tirage du thème) ; ici, la fin.
      if (state.mancheIndex >= state.params.manchesCount) {
        return {
          state: { ...state, phase: 'end' },
          effects: [{ type: 'game:ended' }, { type: 'game:event', name: 'gameEnded' }],
        };
      }
      return { state, effects: [] };
  }
}

/** Une pose, évaluée dans l'état courant (les poses simultanées sont sérialisées). */
function playCard(state: ItoState, playerId: PlayerId): ReduceResult<ItoState> {
  const myNumber = state.numbers[playerId];
  const smallest = Math.min(...state.holders.map((id) => state.numbers[id]));
  const effects: GameEffect[] = [];

  let next: ItoState;
  if (myNumber === smallest) {
    // ✅ pose correcte
    next = {
      ...state,
      holders: state.holders.filter((id) => id !== playerId),
      frise: [...state.frise, { playerId, number: myNumber, kind: 'posed' }],
      themeLocked: true,
    };
    effects.push({ type: 'game:event', name: 'cardPosed', payload: { playerId, correct: true } });
  } else {
    // ❌ erreur : −1 vie, et tous les nombres strictement inférieurs encore en
    // main sont auto-révélés et défaussés (la manche continue avec le reste).
    const discarded = state.holders
      .filter((id) => id !== playerId && state.numbers[id] < myNumber)
      .sort((a, b) => state.numbers[a] - state.numbers[b])
      .map((id): ItoFriseCard => ({ playerId: id, number: state.numbers[id], kind: 'discarded' }));
    next = {
      ...state,
      // la partie continue même à 0 vie (résultat « défaite ») — plancher à 0
      lives: Math.max(0, state.lives - 1),
      holders: state.holders.filter((id) => id !== playerId && state.numbers[id] > myNumber),
      frise: [...state.frise, { playerId, number: myNumber, kind: 'error' }, ...discarded],
      themeLocked: true,
    };
    effects.push({ type: 'game:event', name: 'lifeLost', payload: { playerId } });
  }

  return finishMancheIfDone(next, effects);
}

function finishMancheIfDone(state: ItoState, effects: GameEffect[]): ReduceResult<ItoState> {
  if (state.holders.length > 0) return { state, effects };
  const record = {
    theme: state.theme,
    livesLost: state.frise.filter((c) => c.kind === 'error').length,
    frise: state.frise.map((c) => ({ ...c })),
  };
  return {
    state: { ...state, phase: 'mancheEnd', history: [...state.history, record] },
    effects: [...effects, { type: 'game:event', name: 'mancheEnded' }],
  };
}

// ─── Verdict et récap ───────────────────────────────────────────────────────

/** Verdict par vies restantes (fiche : 3/3 télépathes … 0 désaccordés). */
export function itoVerdict(lives: number, livesTotal: number): { victory: boolean; label: string } {
  if (lives >= livesTotal) return { victory: true, label: 'Télépathes !' };
  if (lives / livesTotal >= 0.5) return { victory: true, label: 'Accordés' };
  if (lives > 0) return { victory: true, label: 'Ric-rac' };
  return { victory: false, label: 'Désaccordés' };
}

export function buildItoResult(state: ItoState, _players: Player[], endedAt: number): GameResult {
  const verdict = itoVerdict(state.lives, state.params.livesCount);
  return {
    game: 'ito',
    endedAt,
    summary: `${state.lives}/${state.params.livesCount} vie${state.params.livesCount > 1 ? 's' : ''} — ${verdict.label}`,
    points: [], // coopératif : pas de points individuels
  };
}
