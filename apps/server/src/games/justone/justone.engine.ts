/**
 * Just One — machine à états pure (fiche 5.3 du PRD, qui est LA spec).
 *
 * Aucune I/O : le mot est tiré par le serveur et injecté (init, manche suivante,
 * mot injouable) ; les timers sont des effets. Chaque cas limite de la fiche a
 * son test dans `justone.engine.spec.ts`.
 */
import { fuzzyEquals, normalizeText, levenshtein } from '../../shared';
import type {
  GameEffect,
  GameResult,
  JustOneAction,
  JustOneClue,
  JustOneOutcome,
  JustOneParams,
  JustOnePhase,
  JustOneState,
  JustOneTimerId,
  Player,
  PlayerId,
} from '../../shared';
import { JUSTONE_MAX_PLAYERS, JUSTONE_MIN_PLAYERS, isClueCancelled } from '../../shared';
import type { EngineCtx, GuardResult, ReduceResult } from '../engine';

// ─── Paramétrage et validation ──────────────────────────────────────────────

export interface JustOneSetupDefaults {
  writeSeconds: number;
  validateSeconds: number;
  guessSeconds: number;
  arbitrateSeconds: number;
}

export const JUSTONE_DEFAULTS: JustOneSetupDefaults = {
  writeSeconds: 45,
  validateSeconds: 30,
  guessSeconds: 60,
  arbitrateSeconds: 30,
};

export function resolveJustOneParams(
  partial: Partial<JustOneParams>,
  defaults: JustOneSetupDefaults = JUSTONE_DEFAULTS,
): JustOneParams {
  return {
    manchesCount: partial.manchesCount ?? 8,
    writeSeconds: partial.writeSeconds ?? defaults.writeSeconds,
    validateSeconds: partial.validateSeconds ?? defaults.validateSeconds,
    guessSeconds: partial.guessSeconds ?? defaults.guessSeconds,
    arbitrateSeconds: partial.arbitrateSeconds ?? defaults.arbitrateSeconds,
    softPenalty: partial.softPenalty ?? false,
  };
}

export function validateJustOneSetup(
  playerCount: number,
): { ok: true } | { ok: false; code: 'BAD_PLAYER_COUNT'; message: string } {
  if (playerCount < JUSTONE_MIN_PLAYERS || playerCount > JUSTONE_MAX_PLAYERS) {
    return {
      ok: false,
      code: 'BAD_PLAYER_COUNT',
      message: `Just One se joue de ${JUSTONE_MIN_PLAYERS} à ${JUSTONE_MAX_PLAYERS} joueurs actifs (actuellement ${playerCount}).`,
    };
  }
  return { ok: true };
}

// ─── Sélecteurs ─────────────────────────────────────────────────────────────

export function giversOf(state: JustOneState): PlayerId[] {
  return state.playerIds.filter((id) => id !== state.guesserId);
}

function connectedSet(state: JustOneState, ctx: EngineCtx): Set<PlayerId> {
  return new Set(ctx.connectedIds ?? state.playerIds);
}

/** Donneurs connectés — le « Y » de « X/Y indices écrits ». */
export function activeGivers(state: JustOneState, ctx: EngineCtx): PlayerId[] {
  const connected = connectedSet(state, ctx);
  return giversOf(state).filter((id) => connected.has(id));
}

/**
 * Arbitre EFFECTIF : le nominal, ou s'il est déconnecté, le donneur suivant
 * dans la rotation (fiche 5.3 : « le rôle glisse au donneur d'indices suivant »).
 */
export function effectiveArbiterId(state: JustOneState, connectedIds?: PlayerId[]): PlayerId {
  const connected = new Set(connectedIds ?? state.playerIds);
  if (connected.has(state.arbiterId)) return state.arbiterId;
  const n = state.playerIds.length;
  const start = state.playerIds.indexOf(state.arbiterId);
  for (let step = 1; step < n; step++) {
    const candidate = state.playerIds[(start + step) % n];
    if (candidate !== state.guesserId && connected.has(candidate)) return candidate;
  }
  return state.arbiterId;
}

/**
 * Deux indices « se ressemblent » : identiques normalisés, ou Levenshtein
 * ≤ 1 (≤ 5 caractères) / ≤ 2 (sinon) — tolérance sur le plus long des deux
 * (même règle que le guess de Mr. White, fiche 5.1).
 */
export function cluesLookAlike(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return true;
  const tolerance = Math.max(na.length, nb.length) <= 5 ? 1 : 2;
  return levenshtein(na, nb) <= tolerance;
}

// ─── Initialisation et rotation ─────────────────────────────────────────────

function rolesForManche(playerIds: PlayerId[], mancheIndex: number): { guesserId: PlayerId; arbiterId: PlayerId } {
  const n = playerIds.length;
  return {
    guesserId: playerIds[(mancheIndex - 1) % n],
    arbiterId: playerIds[mancheIndex % n], // le prochain devineur de la rotation
  };
}

export function initJustOne(
  playerIds: PlayerId[],
  word: string,
  params: JustOneParams,
): ReduceResult<JustOneState> {
  const roles = rolesForManche(playerIds, 1);
  const state: JustOneState = {
    kind: 'justone',
    phase: 'write',
    params,
    playerIds: [...playerIds],
    mancheIndex: 1,
    guesserId: roles.guesserId,
    arbiterId: roles.arbiterId,
    word,
    unplayableUsed: false,
    clues: {},
    readyGiverIds: [],
    score: 0,
    history: [],
    guesserFrozen: false,
  };
  return {
    state,
    effects: [
      { type: 'timer:start', id: 'write', seconds: params.writeSeconds },
      { type: 'game:event', name: 'gameStarted' },
    ],
  };
}

/** Manche suivante (mot tiré par le serveur) — rotation naturelle du devineur. */
export function startNextJustOneManche(state: JustOneState, word: string): ReduceResult<JustOneState> {
  const mancheIndex = state.mancheIndex + 1;
  const roles = rolesForManche(state.playerIds, mancheIndex);
  return {
    state: {
      ...state,
      phase: 'write',
      mancheIndex,
      guesserId: roles.guesserId,
      arbiterId: roles.arbiterId,
      word,
      unplayableUsed: false,
      clues: {},
      validatedClues: undefined,
      readyGiverIds: [],
      guess: undefined,
      outcome: undefined,
      guesserFrozen: false,
    },
    effects: [
      { type: 'timer:start', id: 'write', seconds: state.params.writeSeconds },
      { type: 'game:event', name: 'mancheStarted', payload: { mancheIndex } },
    ],
  };
}

/** « Mot injouable » accepté : nouveau mot, timer d'écriture relancé. */
export function applyJustOneRedraw(state: JustOneState, word: string): ReduceResult<JustOneState> {
  return {
    state: { ...state, word, unplayableUsed: true },
    effects: [
      { type: 'timer:start', id: 'write', seconds: state.params.writeSeconds },
      { type: 'game:event', name: 'wordRedrawn' },
    ],
  };
}

/** Légalité du « Mot injouable » (avant le 1er indice, 1× par manche, arbitre). */
export function canRedrawWord(state: JustOneState, actorId: PlayerId, ctx: EngineCtx): GuardResult {
  if (state.phase !== 'write') {
    return { ok: false, code: 'ACTION_NOT_ALLOWED', message: 'Trop tard : la manche est lancée.' };
  }
  if (actorId !== effectiveArbiterId(state, ctx.connectedIds)) {
    return { ok: false, code: 'ACTION_NOT_ALLOWED', message: 'Réservé à l’arbitre de manche.' };
  }
  if (state.unplayableUsed) {
    return { ok: false, code: 'ACTION_NOT_ALLOWED', message: 'Déjà utilisé cette manche.' };
  }
  if (Object.keys(state.clues).length > 0) {
    return { ok: false, code: 'ACTION_NOT_ALLOWED', message: 'Un indice a déjà été soumis.' };
  }
  return { ok: true };
}

// ─── Garde de légalité ──────────────────────────────────────────────────────

export function guardJustOne(state: JustOneState, action: JustOneAction, ctx: EngineCtx): GuardResult {
  const deny = (message: string): GuardResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });
  const isGiver = (id: PlayerId) => state.playerIds.includes(id) && id !== state.guesserId;

  switch (action.type) {
    case 'SUBMIT_CLUE':
      if (state.phase !== 'write') return deny('La phase d’écriture est terminée.');
      if (!isGiver(action.playerId)) return deny('Le devineur n’écrit pas d’indice.');
      // Un seul mot (traits d'union admis) — le schéma partagé est plus permissif
      // car l'indice Wavelength, lui, accepte une courte expression.
      if (/\s/.test(action.text.trim())) return deny('Un seul mot (les traits d’union sont admis).');
      if (action.text.trim().length > 30) return deny('30 caractères maximum.');
      return { ok: true };

    case 'FLAG_CLUE': {
      if (state.phase !== 'validate') return deny('Pas en phase de validation.');
      if (!isGiver(action.playerId)) return deny('Réservé aux donneurs d’indices.');
      const clue = state.validatedClues?.find((c) => c.giverId === action.giverId);
      if (!clue) return deny('Indice introuvable.');
      if (clue.cancelledAuto) return deny('Annulé automatiquement (ressemblance) : verrouillé.');
      return { ok: true };
    }

    case 'READY':
      if (state.phase !== 'validate') return deny('Pas en phase de validation.');
      if (!isGiver(action.playerId)) return deny('Réservé aux donneurs d’indices.');
      return { ok: true };

    case 'FORCE_CLOSE':
      if (state.phase !== 'validate') return deny('Pas en phase de validation.');
      if (action.playerId !== effectiveArbiterId(state, ctx.connectedIds)) {
        return deny('Réservé à l’arbitre de manche.');
      }
      return { ok: true };

    case 'SUBMIT_GUESS':
      if (state.phase !== 'guess') return deny('Pas encore le moment de deviner.');
      if (action.playerId !== state.guesserId) return deny('Seul le devineur répond.');
      return { ok: true };

    case 'PASS':
      if (state.phase !== 'guess') return deny('Pas encore le moment de deviner.');
      if (action.playerId !== state.guesserId) return deny('Seul le devineur peut passer.');
      return { ok: true };

    case 'ARBITRATE':
      if (state.phase !== 'arbitrate') return deny('Aucune réponse à arbitrer.');
      if (action.playerId !== effectiveArbiterId(state, ctx.connectedIds)) {
        return deny('Réservé à l’arbitre de manche.');
      }
      return { ok: true };

    case 'HOST_NEXT':
      if (state.phase !== 'resolve') return deny('Rien à avancer dans cette phase.');
      return { ok: true };

    case 'TIMEOUT':
      return { ok: true }; // un timer périmé est ignoré par le réducteur

    case 'GUESSER_DISCONNECTED':
      if (state.phase === 'resolve' || state.phase === 'end') return deny('Manche déjà résolue.');
      if (state.guesserFrozen) return deny('Déjà gelée.');
      return { ok: true };

    case 'GUESSER_RECONNECTED':
      if (!state.guesserFrozen) return deny('Aucun gel en cours.');
      return { ok: true };
  }
}

// ─── Réducteur ──────────────────────────────────────────────────────────────

function phaseTimerId(phase: JustOnePhase): JustOneTimerId | undefined {
  switch (phase) {
    case 'write':
      return 'write';
    case 'validate':
      return 'validate';
    case 'guess':
      return 'guess';
    case 'arbitrate':
      return 'arbitrate';
    default:
      return undefined;
  }
}

export function reduceJustOne(
  state: JustOneState,
  action: JustOneAction,
  ctx: EngineCtx,
): ReduceResult<JustOneState> {
  switch (action.type) {
    case 'SUBMIT_CLUE': {
      const next: JustOneState = { ...state, clues: { ...state.clues, [action.playerId]: action.text } };
      // Clôture anticipée : tous les donneurs CONNECTÉS ont écrit.
      const active = activeGivers(next, ctx);
      if (active.length > 0 && active.every((id) => id in next.clues)) {
        return closeWrite(next, [{ type: 'timer:cancel', id: 'write' }]);
      }
      return { state: next, effects: [] };
    }

    case 'FLAG_CLUE': {
      const validatedClues = state.validatedClues!.map((c) =>
        c.giverId === action.giverId ? { ...c, cancelledManual: action.cancelled } : c,
      );
      // Un toggle rouvre la réflexion : les « Prêt » déjà donnés restent acquis
      // (litige tranché par le dernier toggle ou la clôture forcée de l'arbitre).
      return { state: { ...state, validatedClues }, effects: [] };
    }

    case 'READY': {
      if (state.readyGiverIds.includes(action.playerId)) return { state, effects: [] };
      const next: JustOneState = { ...state, readyGiverIds: [...state.readyGiverIds, action.playerId] };
      const active = activeGivers(next, ctx);
      if (active.every((id) => next.readyGiverIds.includes(id))) {
        return startGuess(next, [{ type: 'timer:cancel', id: 'validate' }]);
      }
      return { state: next, effects: [] };
    }

    case 'FORCE_CLOSE':
      return startGuess(state, [{ type: 'timer:cancel', id: 'validate' }]);

    case 'SUBMIT_GUESS': {
      const guess = action.guess;
      if (normalizeText(guess) === normalizeText(state.word)) {
        return finishManche({ ...state, guess }, 'correct', +1, [{ type: 'timer:cancel', id: 'guess' }]);
      }
      if (fuzzyEquals(guess, state.word)) {
        // Proche (faute de frappe, flexion) : l'arbitre de manche tranche.
        return {
          state: { ...state, phase: 'arbitrate', guess },
          effects: [
            { type: 'timer:cancel', id: 'guess' },
            { type: 'timer:start', id: 'arbitrate', seconds: state.params.arbitrateSeconds },
            { type: 'game:event', name: 'closeGuess' },
          ],
        };
      }
      return finishManche({ ...state, guess }, 'wrong', state.params.softPenalty ? 0 : -1, [
        { type: 'timer:cancel', id: 'guess' },
      ]);
    }

    case 'PASS':
      return finishManche(state, 'pass', 0, [{ type: 'timer:cancel', id: 'guess' }]);

    case 'ARBITRATE': {
      const effects: GameEffect[] = [{ type: 'timer:cancel', id: 'arbitrate' }];
      if (action.decision === 'accept') return finishManche(state, 'correct', +1, effects);
      return finishManche(state, 'wrong', state.params.softPenalty ? 0 : -1, effects);
    }

    case 'HOST_NEXT': {
      // Manche non finale : la suivante vient du serveur (tirage du mot).
      if (state.mancheIndex >= state.params.manchesCount) {
        return {
          state: { ...state, phase: 'end' },
          effects: [{ type: 'game:ended' }, { type: 'game:event', name: 'gameEnded' }],
        };
      }
      return { state, effects: [] };
    }

    case 'TIMEOUT':
      return handleTimeout(state, action.timerId, ctx);

    case 'GUESSER_DISCONNECTED': {
      const timerId = phaseTimerId(state.phase);
      const effects: GameEffect[] = [];
      if (timerId) effects.push({ type: 'timer:pause', id: timerId });
      effects.push(
        { type: 'timer:start', id: 'guesserGone', seconds: 60 },
        { type: 'game:event', name: 'guesserFrozen' },
      );
      return { state: { ...state, guesserFrozen: true }, effects };
    }

    case 'GUESSER_RECONNECTED': {
      const timerId = phaseTimerId(state.phase);
      const effects: GameEffect[] = [{ type: 'timer:cancel', id: 'guesserGone' }];
      if (timerId) effects.push({ type: 'timer:resume', id: timerId });
      effects.push({ type: 'game:event', name: 'guesserBack' });
      return { state: { ...state, guesserFrozen: false }, effects };
    }
  }
}

function handleTimeout(state: JustOneState, timerId: JustOneTimerId, ctx: EngineCtx): ReduceResult<JustOneState> {
  if (timerId === 'write' && state.phase === 'write') {
    // Timeout → les retardataires ne fournissent pas d'indice (pas de pénalité).
    return closeWrite(state, []);
  }
  if (timerId === 'validate' && state.phase === 'validate') {
    return startGuess(state, []);
  }
  if (timerId === 'guess' && state.phase === 'guess') {
    return finishManche(state, 'timeout', 0, []);
  }
  if (timerId === 'arbitrate' && state.phase === 'arbitrate') {
    // L'arbitre n'a pas tranché : on pardonne (même esprit que la tolérance aux fautes).
    return finishManche(state, 'correct', +1, []);
  }
  if (timerId === 'guesserGone' && state.guesserFrozen) {
    // Devineur parti > 60 s : manche annulée, ni point ni malus (fiche 5.3).
    const phaseTimer = phaseTimerId(state.phase);
    const effects: GameEffect[] = phaseTimer ? [{ type: 'timer:cancel', id: phaseTimer }] : [];
    return finishManche({ ...state, guesserFrozen: false }, 'aborted', 0, effects);
  }
  void ctx;
  return { state, effects: [] };
}

// ─── Transitions internes ───────────────────────────────────────────────────

/** Fige les indices, annule les ressemblants EN BLOC (et tout indice ≈ mot). */
function closeWrite(state: JustOneState, extraEffects: GameEffect[]): ReduceResult<JustOneState> {
  const givers = giversOf(state);
  const entries = givers
    .filter((id) => id in state.clues)
    .map((id) => ({ giverId: id, text: state.clues[id] }));

  // Regroupement transitif par ressemblance (union-find naïf, n ≤ 9).
  const groups = entries.map((_, i) => i);
  const find = (i: number): number => (groups[i] === i ? i : (groups[i] = find(groups[i])));
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (cluesLookAlike(entries[i].text, entries[j].text)) {
        groups[find(i)] = find(j);
      }
    }
  }
  const groupSizes = new Map<number, number>();
  for (let i = 0; i < entries.length; i++) {
    const root = find(i);
    groupSizes.set(root, (groupSizes.get(root) ?? 0) + 1);
  }

  const validatedClues: JustOneClue[] = entries.map((entry, i) => ({
    giverId: entry.giverId,
    text: entry.text,
    cancelledAuto:
      (groupSizes.get(find(i)) ?? 1) > 1 ||
      // Un indice qui ressemble au mot mystère est invalide (règle officielle).
      cluesLookAlike(entry.text, state.word),
    cancelledManual: false,
  }));

  const next: JustOneState = { ...state, validatedClues, readyGiverIds: [] };

  // Rien à valider (aucun indice) → devinette directe, à l'aveugle.
  if (validatedClues.length === 0) {
    return startGuess(next, extraEffects);
  }
  return {
    state: { ...next, phase: 'validate' },
    effects: [
      ...extraEffects,
      { type: 'timer:start', id: 'validate', seconds: state.params.validateSeconds },
      { type: 'game:event', name: 'validationStarted' },
    ],
  };
}

function startGuess(state: JustOneState, extraEffects: GameEffect[]): ReduceResult<JustOneState> {
  return {
    state: { ...state, phase: 'guess' },
    effects: [
      ...extraEffects,
      { type: 'timer:start', id: 'guess', seconds: state.params.guessSeconds },
      { type: 'game:event', name: 'guessStarted' },
    ],
  };
}

function finishManche(
  state: JustOneState,
  outcome: JustOneOutcome,
  delta: number,
  extraEffects: GameEffect[],
): ReduceResult<JustOneState> {
  const record = {
    word: state.word,
    guesserId: state.guesserId,
    clues: (state.validatedClues ?? []).map((c) => ({ ...c })),
    guess: state.guess,
    outcome,
    delta,
  };
  return {
    state: {
      ...state,
      phase: 'resolve',
      outcome,
      score: state.score + delta,
      history: [...state.history, record],
    },
    effects: [...extraEffects, { type: 'game:event', name: 'mancheResolved', payload: { outcome, delta } }],
  };
}

// ─── Score et récap ─────────────────────────────────────────────────────────

/** Barème de la fiche (calibré sur 8 manches), proportionnel au nb de manches. */
export function justOneScoreLabel(score: number, manchesCount: number): string {
  if (score >= manchesCount) return 'Score parfait !';
  const ratio = score / manchesCount;
  if (ratio >= 0.85) return 'Incroyable !';
  if (ratio >= 0.6) return 'Waouh !';
  if (ratio >= 0.35) return 'Pas mal';
  return 'On réessaie ?';
}

export function buildJustOneResult(state: JustOneState, _players: Player[], endedAt: number): GameResult {
  return {
    game: 'justone',
    endedAt,
    summary: `Score d'équipe : ${state.score}/${state.params.manchesCount} — ${justOneScoreLabel(state.score, state.params.manchesCount)}`,
    points: [], // coopératif : le score est collectif, pas de points individuels
  };
}
