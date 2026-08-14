/**
 * Tests du réducteur Undercover — la fiche 5.1 est la loi :
 * chaque cas limite de la fiche a son test ici.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../shared';
import type {
  PlayerId,
  UndercoverAction,
  UndercoverParams,
  UndercoverState,
} from '../../shared';
import type { EngineCtx, ReduceResult } from '../engine';
import {
  buildUndercoverResult,
  guardUndercover,
  initUndercover,
  reduceUndercover,
  resolveUndercoverParams,
  undercoverCumulativePoints,
  undercoverManchePoints,
  validateUndercoverSetup,
  voteOptionsFor,
  wordFor,
} from './undercover.engine';

const DEFAULTS = { discussSeconds: 60, voteSeconds: 45, whiteGuessSeconds: 30 };

function ids(n: number): PlayerId[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

function params(overrides: Partial<UndercoverParams> = {}): UndercoverParams {
  return {
    undercoverCount: 1,
    mrWhite: false,
    discussSeconds: 60,
    voteSeconds: 45,
    whiteGuessSeconds: 30,
    publicVotes: false,
    manchesCount: 1,
    describePasses: 1,
    ...overrides,
  };
}

function ctx(seed = 1): EngineCtx {
  return { rng: mulberry32(seed) };
}

/** État 4 joueurs contrôlé : p1..p3 civils (« MOTCIVIL »), p4 undercover (« MOTUNDER »). */
function state4(overrides: Partial<UndercoverState> = {}): UndercoverState {
  return {
    kind: 'undercover',
    phase: 'vote',
    params: params(),
    mancheIndex: 1,
    carriedPoints: {},
    goodVoterIds: [],
    describePass: 1,
    playerIds: ids(4),
    pair: { a: 'MOTCIVIL', b: 'MOTUNDER' },
    civilianWord: 'a',
    roles: { p1: 'civilian', p2: 'civilian', p3: 'civilian', p4: 'undercover' },
    alive: ids(4),
    round: 1,
    speakingOrder: ids(4),
    turnIndex: 0,
    seenWord: [],
    votes: {},
    blankStreak: 0,
    suggestAbort: false,
    eliminations: [],
    ...overrides,
  };
}

/** État 5 joueurs : p1..p3 civils, p4 undercover, p5 Mr. White. */
function state5(overrides: Partial<UndercoverState> = {}): UndercoverState {
  return state4({
    params: params({ mrWhite: true }),
    playerIds: ids(5),
    roles: { p1: 'civilian', p2: 'civilian', p3: 'civilian', p4: 'undercover', p5: 'mrwhite' },
    alive: ids(5),
    speakingOrder: ids(5),
    ...overrides,
  });
}

function dispatch(state: UndercoverState, action: UndercoverAction, seed = 1): ReduceResult<UndercoverState> {
  const g = guardUndercover(state, action);
  expect(g.ok, `action ${action.type} devrait être légale : ${JSON.stringify(g)}`).toBe(true);
  return reduceUndercover(state, action, ctx(seed));
}

function expectDenied(state: UndercoverState, action: UndercoverAction): void {
  const g = guardUndercover(state, action);
  expect(g.ok, `action ${action.type} aurait dû être refusée`).toBe(false);
}

// ─── Paramètres et validation de lancement ──────────────────────────────────

describe('resolveUndercoverParams — tableau de répartition de la fiche', () => {
  it.each([
    [4, 1, false],
    [5, 1, true],
    [6, 1, true],
    [7, 2, true],
    [8, 2, true],
    [9, 2, true],
    [10, 3, true],
  ])('%i joueurs → %i undercover, Mr. White %s', (n, uc, white) => {
    const p = resolveUndercoverParams(n, {}, DEFAULTS);
    expect(p.undercoverCount).toBe(uc);
    expect(p.mrWhite).toBe(white);
  });

  it('respecte les surcharges du host', () => {
    const p = resolveUndercoverParams(6, { undercoverCount: 2, mrWhite: false, discussSeconds: 90 }, DEFAULTS);
    expect(p).toMatchObject({ undercoverCount: 2, mrWhite: false, discussSeconds: 90 });
  });
});

describe('validateUndercoverSetup', () => {
  it('refuse hors bornes 4–10', () => {
    expect(validateUndercoverSetup(3, params()).ok).toBe(false);
    expect(validateUndercoverSetup(11, params()).ok).toBe(false);
  });

  it('cas limite fiche : 4 joueurs et Mr. White activé manuellement → interdit', () => {
    const result = validateUndercoverSetup(4, params({ mrWhite: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MRWHITE_MIN_PLAYERS');
  });

  it('impose une majorité stricte de civils', () => {
    expect(validateUndercoverSetup(4, params({ undercoverCount: 2 })).ok).toBe(false);
    expect(validateUndercoverSetup(6, params({ undercoverCount: 2, mrWhite: true })).ok).toBe(false);
    expect(validateUndercoverSetup(7, params({ undercoverCount: 2, mrWhite: true })).ok).toBe(true);
  });
});

// ─── Initialisation ─────────────────────────────────────────────────────────

describe('initUndercover', () => {
  it('distribue les rôles selon les paramètres', () => {
    const { state } = initUndercover(ids(7), { a: 'A', b: 'B' }, params({ undercoverCount: 2, mrWhite: true }), ctx(3));
    const roles = Object.values(state.roles);
    expect(roles.filter((r) => r === 'undercover')).toHaveLength(2);
    expect(roles.filter((r) => r === 'mrwhite')).toHaveLength(1);
    expect(roles.filter((r) => r === 'civilian')).toHaveLength(4);
    expect(state.phase).toBe('distribute');
    expect(state.alive).toHaveLength(7);
    expect(state.round).toBe(1);
  });

  it('le serveur choisit aléatoirement le mot des civils (a ou b selon la seed)', () => {
    const words = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const { state } = initUndercover(ids(4), { a: 'A', b: 'B' }, params(), ctx(seed));
      words.add(state.civilianWord);
    }
    expect(words).toEqual(new Set(['a', 'b']));
  });

  it('cas limite fiche : Mr. White ne parle JAMAIS en premier au tour 1', () => {
    for (let seed = 0; seed < 300; seed++) {
      const { state } = initUndercover(ids(5), { a: 'A', b: 'B' }, params({ mrWhite: true }), ctx(seed));
      expect(state.roles[state.speakingOrder[0]]).not.toBe('mrwhite');
    }
  });

  it('wordFor : chacun voit seulement son mot, Mr. White aucun', () => {
    const s = state5();
    expect(wordFor(s, 'p1')).toBe('MOTCIVIL');
    expect(wordFor(s, 'p4')).toBe('MOTUNDER');
    expect(wordFor(s, 'p5')).toBeUndefined();
  });
});

// ─── Distribution et tour de description ────────────────────────────────────

describe('distribution et description', () => {
  it('SEEN_WORD coche une seule fois (re-consultation sans effet)', () => {
    const s0 = state4({ phase: 'distribute' });
    const { state: s1 } = dispatch(s0, { type: 'SEEN_WORD', playerId: 'p1' });
    const { state: s2 } = dispatch(s1, { type: 'SEEN_WORD', playerId: 'p1' });
    expect(s2.seenWord).toEqual(['p1']);
  });

  it('HOST_NEXT : distribute → describe, puis avance l’ordre de parole, puis discuss + timer', () => {
    let s = state4({ phase: 'distribute' });
    s = dispatch(s, { type: 'HOST_NEXT' }).state;
    expect(s.phase).toBe('describe');
    expect(s.turnIndex).toBe(0);

    s = dispatch(s, { type: 'HOST_NEXT' }).state;
    expect(s.turnIndex).toBe(1);
    s = dispatch(s, { type: 'HOST_NEXT' }).state;
    s = dispatch(s, { type: 'HOST_NEXT' }).state;
    expect(s.turnIndex).toBe(3);

    const { state: s2, effects } = dispatch(s, { type: 'HOST_NEXT' });
    expect(s2.phase).toBe('discuss');
    expect(effects).toContainEqual({ type: 'timer:start', id: 'discuss', seconds: 60 });
  });

  it('discuss → vote (par host ou timeout), timer de vote démarré', () => {
    const viaHost = dispatch(state4({ phase: 'discuss' }), { type: 'HOST_NEXT' });
    expect(viaHost.state.phase).toBe('vote');
    expect(viaHost.effects).toContainEqual({ type: 'timer:cancel', id: 'discuss' });
    expect(viaHost.effects).toContainEqual({ type: 'timer:start', id: 'vote', seconds: 45 });

    const viaTimeout = dispatch(state4({ phase: 'discuss' }), { type: 'TIMEOUT', timerId: 'discuss' });
    expect(viaTimeout.state.phase).toBe('vote');
    expect(viaTimeout.effects).toContainEqual({ type: 'timer:start', id: 'vote', seconds: 45 });
  });

  it('un timer périmé est ignoré sans effet (phase déjà passée)', () => {
    const s = state4({ phase: 'vote' });
    const { state: after, effects } = dispatch(s, { type: 'TIMEOUT', timerId: 'discuss' });
    expect(after).toEqual(s);
    expect(effects).toEqual([]);
  });
});

// ─── Vote : légalité, clôture, élimination ──────────────────────────────────

describe('vote', () => {
  it('légalité : pas hors phase, pas les morts, pas soi-même, pas une cible morte', () => {
    expectDenied(state4({ phase: 'describe' }), { type: 'CAST_VOTE', playerId: 'p1', target: 'p2' });
    expectDenied(state4({ alive: ['p1', 'p2', 'p3'] }), { type: 'CAST_VOTE', playerId: 'p4', target: 'p1' });
    expectDenied(state4(), { type: 'CAST_VOTE', playerId: 'p1', target: 'p1' });
    expectDenied(state4({ alive: ['p1', 'p2', 'p3'] }), { type: 'CAST_VOTE', playerId: 'p1', target: 'p4' });
    expectDenied(state4(), { type: 'HOST_NEXT' }); // le vote se clôt tout seul
  });

  it('le vote est confirmé mais modifiable jusqu’à la clôture', () => {
    let s = state4();
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p4' }).state;
    expect(s.votes.p1).toBe('p4');
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p2' }).state;
    expect(s.votes.p1).toBe('p2');
    expect(s.phase).toBe('vote');
  });

  it('clôture anticipée quand tous les vivants ont voté ; le plus voté est éliminé, rôle révélé', () => {
    let s = state4();
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p4' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'p4' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p3', target: 'p4' }).state;
    const { state: after, effects } = dispatch(s, { type: 'CAST_VOTE', playerId: 'p4', target: 'p1' });

    expect(after.phase).toBe('reveal');
    expect(effects).toContainEqual({ type: 'timer:cancel', id: 'vote' });
    expect(after.alive).toEqual(['p1', 'p2', 'p3']);
    expect(after.lastReveal?.kind).toBe('eliminated');
    expect(after.lastReveal?.eliminated).toMatchObject({ playerId: 'p4', role: 'undercover', byAdmin: false });
    expect(after.lastReveal?.tally).toContainEqual({ playerId: 'p4', count: 3 });
    // dernier infiltré éliminé → victoire des civils, actée au prochain « continuer »
    expect(after.winner).toBe('civilians');
  });

  it('cas limite fiche (déconnexion) : timeout → vote blanc pour les retardataires', () => {
    let s = state4();
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p4' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'p4' }).state;
    const { state: after } = dispatch(s, { type: 'TIMEOUT', timerId: 'vote' });
    expect(after.phase).toBe('reveal');
    expect(after.lastReveal?.blankCount).toBe(2); // p3 et p4 n'avaient pas voté
    expect(after.lastReveal?.eliminated?.playerId).toBe('p4');
  });

  it('votes publics off par défaut : pas de détail votant → cible ; on : détail présent', () => {
    let s = state4();
    for (const [voter, target] of [
      ['p1', 'p4'],
      ['p2', 'p4'],
      ['p3', 'p4'],
      ['p4', 'p1'],
    ] as const) {
      s = dispatch(s, { type: 'CAST_VOTE', playerId: voter, target }).state;
    }
    expect(s.lastReveal?.votesByVoter).toBeUndefined();

    let sp = state4({ params: params({ publicVotes: true }) });
    for (const [voter, target] of [
      ['p1', 'p4'],
      ['p2', 'p4'],
      ['p3', 'p4'],
      ['p4', 'p1'],
    ] as const) {
      sp = dispatch(sp, { type: 'CAST_VOTE', playerId: voter, target }).state;
    }
    expect(sp.lastReveal?.votesByVoter).toContainEqual({ voterId: 'p1', target: 'p4' });
  });
});

// ─── Égalités et re-vote (fiche 5.1 étape 6) ────────────────────────────────

describe('égalité au vote', () => {
  function tieState(): UndercoverState {
    let s = state4();
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p3' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'p3' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p3', target: 'p1' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p4', target: 'p1' }).state;
    return s;
  }

  it('égalité → re-vote immédiat entre les ex æquo uniquement', () => {
    const s = tieState();
    expect(s.phase).toBe('vote');
    expect(new Set(s.revoteCandidates)).toEqual(new Set(['p1', 'p3']));
    expect(s.votes).toEqual({});
    // jamais d'élimination aléatoire
    expect(s.alive).toHaveLength(4);
    // les cibles sont restreintes aux ex æquo (soi-même exclu)
    expect(voteOptionsFor(s, 'p2')).toEqual(expect.arrayContaining(['p1', 'p3']));
    expect(voteOptionsFor(s, 'p1')).toEqual(['p3']);
    expectDenied(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'p4' });
  });

  it('re-vote décisif → élimination normale', () => {
    let s = tieState();
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p3' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'p3' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p3', target: 'p1' }).state;
    const { state: after } = dispatch(s, { type: 'CAST_VOTE', playerId: 'p4', target: 'p3' });
    expect(after.phase).toBe('reveal');
    expect(after.lastReveal?.eliminated?.playerId).toBe('p3');
  });

  it('nouvelle égalité → personne n’est éliminé, on enchaîne un nouveau tour', () => {
    let s = tieState();
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p3' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'p3' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p3', target: 'p1' }).state;
    const { state: after } = dispatch(s, { type: 'CAST_VOTE', playerId: 'p4', target: 'p1' });
    expect(after.phase).toBe('reveal');
    expect(after.lastReveal?.kind).toBe('tie-noelim');
    expect(after.alive).toHaveLength(4);

    const { state: nextRound } = dispatch(after, { type: 'HOST_NEXT' });
    expect(nextRound.phase).toBe('describe');
    expect(nextRound.round).toBe(2);
    expect(nextRound.votes).toEqual({});
    expect(nextRound.revoteCandidates).toBeUndefined();
  });
});

// ─── Votes blancs en série (cas limite fiche) ───────────────────────────────

describe('votes blancs en série', () => {
  it('tous blancs → personne d’éliminé ; au 2e tour blanc consécutif, suggestion d’abandon', () => {
    let s = state4();
    const r1 = dispatch(s, { type: 'TIMEOUT', timerId: 'vote' });
    expect(r1.state.lastReveal?.kind).toBe('blank-noelim');
    expect(r1.state.blankStreak).toBe(1);
    expect(r1.state.suggestAbort).toBe(false);
    expect(r1.state.alive).toHaveLength(4);

    let s2 = dispatch(r1.state, { type: 'HOST_NEXT' }).state; // nouveau tour
    expect(s2.round).toBe(2);
    s2 = dispatch(s2, { type: 'HOST_NEXT' }).state; // fin de l'ordre ? non : avance
    // on force l'arrivée au vote du tour 2
    while (s2.phase !== 'vote') {
      s2 = dispatch(s2, { type: 'HOST_NEXT' }).state;
    }
    const r2 = dispatch(s2, { type: 'TIMEOUT', timerId: 'vote' });
    expect(r2.state.blankStreak).toBe(2);
    expect(r2.state.suggestAbort).toBe(true);
  });

  it('une élimination réinitialise la série de tours blancs', () => {
    let s = state4({ blankStreak: 1 });
    for (const [voter, target] of [
      ['p1', 'p4'],
      ['p2', 'p4'],
      ['p3', 'p4'],
      ['p4', 'p1'],
    ] as const) {
      s = dispatch(s, { type: 'CAST_VOTE', playerId: voter, target }).state;
    }
    expect(s.blankStreak).toBe(0);
    expect(s.suggestAbort).toBe(false);
  });
});

// ─── Mr. White : guess automatique (fiche 5.1 étape 7) ──────────────────────

describe('guess de Mr. White', () => {
  /** p5 (White) vient d'être éliminé par vote — phase reveal, guess en attente. */
  function whiteEliminated(): UndercoverState {
    let s = state5();
    for (const [voter, target] of [
      ['p1', 'p5'],
      ['p2', 'p5'],
      ['p3', 'p5'],
      ['p4', 'p5'],
      ['p5', 'p1'],
    ] as const) {
      s = dispatch(s, { type: 'CAST_VOTE', playerId: voter, target }).state;
    }
    expect(s.phase).toBe('reveal');
    expect(s.pendingWhiteGuessFor).toBe('p5');
    expect(s.winner).toBeUndefined(); // l'évaluation attend le guess
    return s;
  }

  it('White éliminé par vote → phase whiteGuess avec timer 30 s', () => {
    const s = whiteEliminated();
    const { state: guess, effects } = dispatch(s, { type: 'HOST_NEXT' });
    expect(guess.phase).toBe('whiteGuess');
    expect(guess.whiteGuess).toMatchObject({ playerId: 'p5', resolved: false });
    expect(effects).toContainEqual({ type: 'timer:start', id: 'whiteGuess', seconds: 30 });
  });

  it('seul Mr. White éliminé peut deviner, une seule fois', () => {
    const s = dispatch(whiteEliminated(), { type: 'HOST_NEXT' }).state;
    expectDenied(s, { type: 'SUBMIT_GUESS', playerId: 'p1', guess: 'MOTCIVIL' });
    const resolved = dispatch(s, { type: 'SUBMIT_GUESS', playerId: 'p5', guess: 'raté' }).state;
    expectDenied(resolved, { type: 'SUBMIT_GUESS', playerId: 'p5', guess: 'MOTCIVIL' });
  });

  it('mot exact → Mr. White gagne seul, partie terminée', () => {
    const s = dispatch(whiteEliminated(), { type: 'HOST_NEXT' }).state;
    const { state: resolved, effects } = dispatch(s, { type: 'SUBMIT_GUESS', playerId: 'p5', guess: 'motcivil' });
    expect(resolved.whiteGuess?.correct).toBe(true);
    expect(resolved.winner).toBe('mrwhite');
    expect(effects).toContainEqual({ type: 'timer:cancel', id: 'whiteGuess' });

    const { state: end, effects: endEffects } = dispatch(resolved, { type: 'HOST_NEXT' });
    expect(end.phase).toBe('end');
    expect(endEffects).toContainEqual({ type: 'game:ended', winner: 'mrwhite' });
  });

  it('cas limite fiche : fautes de frappe pardonnées (Levenshtein ≤ 1 si ≤ 5 lettres, ≤ 2 sinon)', () => {
    // Mot civil court : « Café » (normalisé « cafe », 4 lettres → tolérance 1)
    let short = state5({ pair: { a: 'Café', b: 'Thé' }, civilianWord: 'a' });
    short = { ...short, phase: 'whiteGuess', whiteGuess: { playerId: 'p5', resolved: false }, alive: ['p1', 'p2', 'p3', 'p4'] };
    expect(dispatch(short, { type: 'SUBMIT_GUESS', playerId: 'p5', guess: 'kafé' }).state.whiteGuess?.correct).toBe(true);
    expect(dispatch(short, { type: 'SUBMIT_GUESS', playerId: 'p5', guess: 'kaf' }).state.whiteGuess?.correct).toBe(false);

    // Mot civil long : « Croissant » (9 lettres → tolérance 2)
    let long = state5({ pair: { a: 'Croissant', b: 'Brioche' }, civilianWord: 'a' });
    long = { ...long, phase: 'whiteGuess', whiteGuess: { playerId: 'p5', resolved: false }, alive: ['p1', 'p2', 'p3', 'p4'] };
    expect(dispatch(long, { type: 'SUBMIT_GUESS', playerId: 'p5', guess: 'croizant' }).state.whiteGuess?.correct).toBe(true);
    expect(dispatch(long, { type: 'SUBMIT_GUESS', playerId: 'p5', guess: 'krouazan' }).state.whiteGuess?.correct).toBe(false);
    // les synonymes ne pardonnent pas
    expect(dispatch(long, { type: 'SUBMIT_GUESS', playerId: 'p5', guess: 'viennoiserie' }).state.whiteGuess?.correct).toBe(false);
  });

  it('guess raté → la partie continue (nouveau tour parmi les vivants)', () => {
    const s = dispatch(whiteEliminated(), { type: 'HOST_NEXT' }).state;
    const resolved = dispatch(s, { type: 'SUBMIT_GUESS', playerId: 'p5', guess: 'perdu' }).state;
    expect(resolved.winner).toBeUndefined(); // 4 vivants dont 1 undercover : rien n'est acté
    const next = dispatch(resolved, { type: 'HOST_NEXT' }).state;
    expect(next.phase).toBe('describe');
    expect(next.round).toBe(2);
    expect(next.speakingOrder).toHaveLength(4);
  });

  it('timeout du guess = raté (déconnexion de White pendant sa saisie)', () => {
    const s = dispatch(whiteEliminated(), { type: 'HOST_NEXT' }).state;
    const { state: resolved } = dispatch(s, { type: 'TIMEOUT', timerId: 'whiteGuess' });
    expect(resolved.whiteGuess?.resolved).toBe(true);
    expect(resolved.whiteGuess?.correct).toBe(false);
  });

  it('White était le dernier infiltré et rate → victoire des civils', () => {
    // p4 (undercover) déjà éliminé ; White éliminé par vote, guess raté.
    let s = state5({
      alive: ['p1', 'p2', 'p3', 'p5'],
      eliminations: [{ playerId: 'p4', role: 'undercover', round: 1, byAdmin: false }],
      phase: 'whiteGuess',
      whiteGuess: { playerId: 'p5', resolved: false },
    });
    s = { ...s, alive: ['p1', 'p2', 'p3'] }; // White déjà retiré des vivants
    const resolved = dispatch(s, { type: 'SUBMIT_GUESS', playerId: 'p5', guess: 'perdu' }).state;
    expect(resolved.winner).toBe('civilians');
    const end = dispatch(resolved, { type: 'HOST_NEXT' }).state;
    expect(end.phase).toBe('end');
  });

  it('dès le tour 2, Mr. White peut parler en premier', () => {
    // tour 2 avec White vivant : il existe des seeds où il ouvre le tour.
    const base = state5({ phase: 'reveal', alive: ['p2', 'p3', 'p4', 'p5'], lastReveal: { kind: 'eliminated', eliminated: { playerId: 'p1', role: 'civilian', round: 1, byAdmin: false }, tally: [], blankCount: 0 } });
    let whiteFirstSeen = false;
    for (let seed = 0; seed < 60 && !whiteFirstSeen; seed++) {
      const { state } = reduceUndercover(base, { type: 'HOST_NEXT' }, ctx(seed));
      if (state.roles[state.speakingOrder[0]] === 'mrwhite') whiteFirstSeen = true;
    }
    expect(whiteFirstSeen).toBe(true);
  });
});

// ─── Retrait administratif (cas limite fiche : déco > 60 s) ─────────────────

describe('retrait administratif', () => {
  it('rôle révélé mais SANS droit de guess pour Mr. White', () => {
    const s = state5({ phase: 'discuss' });
    const { state: after, effects } = dispatch(s, { type: 'HOST_REMOVE_PLAYER', playerId: 'p5' });
    expect(after.phase).toBe('reveal');
    expect(after.lastReveal?.kind).toBe('admin-removal');
    expect(after.lastReveal?.eliminated).toMatchObject({ playerId: 'p5', role: 'mrwhite', byAdmin: true });
    expect(after.pendingWhiteGuessFor).toBeUndefined();
    expect(effects).toContainEqual({ type: 'timer:cancel', id: 'discuss' });

    // pas de phase whiteGuess : le prochain « continuer » enchaîne le tour suivant
    const next = dispatch(after, { type: 'HOST_NEXT' }).state;
    expect(next.phase).toBe('describe');
    expect(next.round).toBe(2);
  });

  it('retirer le dernier infiltré donne la victoire aux civils', () => {
    const s = state4({ phase: 'describe' });
    const { state: after } = dispatch(s, { type: 'HOST_REMOVE_PLAYER', playerId: 'p4' });
    expect(after.winner).toBe('civilians');
    const end = dispatch(after, { type: 'HOST_NEXT' }).state;
    expect(end.phase).toBe('end');
  });

  it('un vote en cours est abandonné (timer annulé, votes remis à zéro au tour suivant)', () => {
    let s = state4();
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p2' }).state;
    const { state: after, effects } = dispatch(s, { type: 'HOST_REMOVE_PLAYER', playerId: 'p2' });
    expect(effects).toContainEqual({ type: 'timer:cancel', id: 'vote' });
    expect(after.phase).toBe('reveal');
    expect(after.winner).toBeUndefined(); // p4 undercover toujours vivant, 3 vivants
  });

  it('interdit pendant reveal et whiteGuess', () => {
    expectDenied(state5({ phase: 'whiteGuess', whiteGuess: { playerId: 'p5', resolved: false } }), {
      type: 'HOST_REMOVE_PLAYER',
      playerId: 'p1',
    });
  });
});

// ─── Conditions de fin et points ────────────────────────────────────────────

describe('conditions de fin et points', () => {
  it('2 vivants dont au moins un infiltré → victoire des infiltrés', () => {
    // 5 joueurs, il reste p1 (civil), p4 (undercover), p5 (White) → on élimine p1 ? non :
    // on élimine un civil pour passer à 2 vivants avec infiltré.
    let s = state5({ alive: ['p1', 'p2', 'p4'], phase: 'vote' });
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p2' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'p1' }).state;
    const { state: after } = dispatch(s, { type: 'CAST_VOTE', playerId: 'p4', target: 'p2' });
    expect(after.lastReveal?.eliminated?.playerId).toBe('p2');
    expect(after.alive).toEqual(['p1', 'p4']);
    expect(after.winner).toBe('infiltrators');

    const end = dispatch(after, { type: 'HOST_NEXT' }).state;
    expect(end.phase).toBe('end');
    // barème révisé : undercover vainqueur 3 pts (vivant) ; civils et White éliminés 0
    const points = Object.fromEntries(undercoverManchePoints(end).map((p) => [p.playerId, p.points]));
    expect(points.p4).toBe(3);
    expect(points.p1).toBe(0);
  });

  it('civils vainqueurs : 2 pts chacun + 1 pt bonus pour ceux qui ont visé un infiltré', () => {
    let s = state4();
    for (const [voter, target] of [
      ['p1', 'p4'],
      ['p2', 'p4'],
      ['p3', 'blank'], // p3 n'a pas voté (timeout) → pas de bonus
      ['p4', 'p1'],
    ] as const) {
      s = dispatch(s, { type: 'CAST_VOTE', playerId: voter, target }).state;
    }
    const end = dispatch(s, { type: 'HOST_NEXT' }).state;
    expect(end.phase).toBe('end');
    const rows = undercoverManchePoints(end);
    const byId = Object.fromEntries(rows.map((p) => [p.playerId, p]));
    expect(byId.p1).toMatchObject({ points: 3, goodVote: true });
    expect(byId.p2).toMatchObject({ points: 3, goodVote: true });
    expect(byId.p3).toMatchObject({ points: 2, goodVote: false });
    // l'undercover ne touche jamais le bonus des civils, même s'il a « bien » voté
    expect(byId.p4).toMatchObject({ points: 0, goodVote: false });
  });

  it('Mr. White vainqueur : 4 pts, personne d’autre', () => {
    const s = state5({ phase: 'whiteGuess', whiteGuess: { playerId: 'p5', resolved: false }, alive: ['p1', 'p2', 'p3', 'p4'] });
    const resolved = dispatch(s, { type: 'SUBMIT_GUESS', playerId: 'p5', guess: 'MOTCIVIL' }).state;
    const end = dispatch(resolved, { type: 'HOST_NEXT' }).state;
    const points = Object.fromEntries(undercoverManchePoints(end).map((p) => [p.playerId, p.points]));
    expect(points).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0, p5: 4 });
  });

  it('buildUndercoverResult produit le récap avec noms et résumé', () => {
    let s = state4();
    for (const [voter, target] of [
      ['p1', 'p4'],
      ['p2', 'p4'],
      ['p3', 'p4'],
      ['p4', 'p1'],
    ] as const) {
      s = dispatch(s, { type: 'CAST_VOTE', playerId: voter, target }).state;
    }
    const end = dispatch(s, { type: 'HOST_NEXT' }).state;
    const players = ids(4).map((id, i) => ({ id, name: `Joueur${i + 1}`, avatar: '🦊', connected: true, joinedAt: 0 }));
    const result = buildUndercoverResult(end, players, 123);
    expect(result.summary).toBe('Victoire des civils');
    // vote unanime contre p4 → pas de bonus : 2 pts secs
    expect(result.points.find((p) => p.playerId === 'p1')).toMatchObject({ name: 'Joueur1', points: 2 });
  });
});

// ─── Bonus de « bon vote » : suivi équitable des dépouillements ─────────────

describe('suivi des bons votes', () => {
  it('viser un infiltré compte quand les civils divergent — le bulletin de White, jamais', () => {
    let s = state5();
    for (const [voter, target] of [
      ['p1', 'p3'],
      ['p2', 'p4'], // seul civil à viser l'undercover
      ['p3', 'p1'],
      ['p4', 'p1'],
      ['p5', 'p4'], // Mr. White vise aussi l'undercover : pas un civil → jamais marqué
    ] as const) {
      s = dispatch(s, { type: 'CAST_VOTE', playerId: voter, target }).state;
    }
    expect(s.goodVoterIds).toEqual(['p2']);
  });

  it('le dépouillement qui déclenche un re-vote compte ; un re-vote unanime ne marque personne', () => {
    let s = state4();
    // égalité p1/p4 : p1 et p2 avaient visé p4 (undercover), p3 a visé p1 → divergence
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p4' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'p4' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p3', target: 'p1' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p4', target: 'p1' }).state;
    expect(s.revoteCandidates).toBeDefined();
    expect(new Set(s.goodVoterIds)).toEqual(new Set(['p1', 'p2']));

    // au re-vote, tous les civils convergent sur p4 : unanimité → aucun nouveau marquage
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p4' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'p4' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p3', target: 'p4' }).state;
    const { state: after } = dispatch(s, { type: 'CAST_VOTE', playerId: 'p4', target: 'p1' });
    expect(after.lastReveal?.eliminated?.playerId).toBe('p4');
    expect(new Set(after.goodVoterIds)).toEqual(new Set(['p1', 'p2']));
  });

  it('cas utilisateur : tout le monde vote l’undercover dès le premier tour → aucun bonus', () => {
    let s = state4();
    for (const [voter, target] of [
      ['p1', 'p4'],
      ['p2', 'p4'],
      ['p3', 'p4'],
      ['p4', 'p1'],
    ] as const) {
      s = dispatch(s, { type: 'CAST_VOTE', playerId: voter, target }).state;
    }
    expect(s.goodVoterIds).toEqual([]);
    const end = dispatch(s, { type: 'HOST_NEXT' }).state;
    const rows = undercoverManchePoints(end);
    expect(rows.every((r) => !r.goodVote)).toBe(true);
    expect(rows.find((r) => r.playerId === 'p1')?.points).toBe(2); // 2 pts secs, pas de bonus
  });

  it('cas utilisateur : dernier tour à 2 civils contre 1 undercover, même vote → pas de nouveau bonus (l’acquis reste)', () => {
    // p1 avait été marqué plus tôt dans la manche ; p3 et p5 sont déjà éliminés.
    let s = state5({
      alive: ['p1', 'p2', 'p4'],
      goodVoterIds: ['p1'],
      eliminations: [
        { playerId: 'p3', role: 'civilian', round: 1, byAdmin: false },
        { playerId: 'p5', role: 'mrwhite', round: 2, byAdmin: false },
      ],
    });
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p4' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'p4' }).state;
    const { state: after } = dispatch(s, { type: 'CAST_VOTE', playerId: 'p4', target: 'p1' });
    expect(after.winner).toBe('civilians');
    expect(after.goodVoterIds).toEqual(['p1']); // p2 n'est pas marqué par ce vote unanime
    const end = dispatch(after, { type: 'HOST_NEXT' }).state;
    const byId = Object.fromEntries(undercoverManchePoints(end).map((r) => [r.playerId, r]));
    expect(byId.p1).toMatchObject({ points: 3, goodVote: true });
    expect(byId.p2).toMatchObject({ points: 2, goodVote: false });
  });

  it('même logique pour Mr. White : plébiscite unanime contre lui → aucun bonus', () => {
    let s = state5();
    for (const [voter, target] of [
      ['p1', 'p5'],
      ['p2', 'p5'],
      ['p3', 'p5'],
      ['p4', 'p5'],
      ['p5', 'p1'],
    ] as const) {
      s = dispatch(s, { type: 'CAST_VOTE', playerId: voter, target }).state;
    }
    expect(s.lastReveal?.eliminated?.playerId).toBe('p5');
    expect(s.goodVoterIds).toEqual([]);
  });

  it('votes blancs et votes contre un civil ne comptent pas', () => {
    let s = state4();
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p2' }).state;
    s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'blank' }).state;
    const { state: after } = dispatch(s, { type: 'TIMEOUT', timerId: 'vote' });
    expect(after.goodVoterIds).toEqual([]);
  });
});

// ─── Passes de description multiples (1 par défaut, jusqu'à 3) ──────────────

describe('tours de parole multiples', () => {
  it('avec describePasses=2, l’ordre est parcouru deux fois avant la discussion', () => {
    let s = state4({ phase: 'distribute', params: params({ describePasses: 2 }) });
    s = dispatch(s, { type: 'HOST_NEXT' }).state; // → describe, passe 1
    expect(s.describePass).toBe(1);
    for (let i = 0; i < 3; i++) s = dispatch(s, { type: 'HOST_NEXT' }).state;
    expect(s.turnIndex).toBe(3);

    s = dispatch(s, { type: 'HOST_NEXT' }).state; // fin de passe 1 → passe 2
    expect(s.phase).toBe('describe');
    expect(s.describePass).toBe(2);
    expect(s.turnIndex).toBe(0);
    expect(s.speakingOrder).toEqual(ids(4)); // même ordre, White jamais premier reste garanti

    for (let i = 0; i < 3; i++) s = dispatch(s, { type: 'HOST_NEXT' }).state;
    const { state: after, effects } = dispatch(s, { type: 'HOST_NEXT' });
    expect(after.phase).toBe('discuss');
    expect(effects).toContainEqual({ type: 'timer:start', id: 'discuss', seconds: 60 });
  });

  it('un nouveau tour repart en passe 1', () => {
    let s = state4({ phase: 'reveal', params: params({ describePasses: 3 }), describePass: 3, lastReveal: { kind: 'tie-noelim', tally: [], blankCount: 0 } });
    const next = dispatch(s, { type: 'HOST_NEXT' }).state;
    expect(next.phase).toBe('describe');
    expect(next.describePass).toBe(1);
  });
});

// ─── Manches enchaînées avec cumul ──────────────────────────────────────────

describe('manches multiples', () => {
  function finishManche(s: UndercoverState): { state: UndercoverState; effects: ReduceResult<UndercoverState>['effects'] } {
    let cur = s;
    for (const [voter, target] of [
      ['p1', 'p4'],
      ['p2', 'p4'],
      ['p3', 'p4'],
      ['p4', 'p1'],
    ] as const) {
      cur = dispatch(cur, { type: 'CAST_VOTE', playerId: voter, target }).state;
    }
    return dispatch(cur, { type: 'HOST_NEXT' });
  }

  it('fin de manche non finale → événement mancheEnded, PAS game:ended', () => {
    const { state, effects } = finishManche(state4({ params: params({ manchesCount: 3 }) }));
    expect(state.phase).toBe('end');
    expect(effects.some((e) => e.type === 'game:ended')).toBe(false);
    expect(effects).toContainEqual({
      type: 'game:event',
      name: 'mancheEnded',
      payload: { winner: 'civilians', mancheIndex: 1 },
    });
  });

  it('fin de la dernière manche → game:ended (fin de série)', () => {
    const { effects } = finishManche(state4({ params: params({ manchesCount: 2 }), mancheIndex: 2 }));
    expect(effects).toContainEqual({ type: 'game:ended', winner: 'civilians' });
  });

  it('le cumul additionne les manches précédentes et trie décroissant', () => {
    const { state } = finishManche(
      state4({ params: params({ manchesCount: 2 }), mancheIndex: 2, carriedPoints: { p4: 3, p1: 1 } }),
    );
    // manche 2 : civils gagnent à l'unanimité (pas de bonus) → 2 pts par civil
    const cumul = undercoverCumulativePoints(state);
    expect(cumul[0].points).toBe(3); // p1 (1+2) et p4 (3+0) à égalité en tête
    expect(cumul.find((c) => c.playerId === 'p1')).toEqual({ playerId: 'p1', points: 3 });
    expect(cumul.find((c) => c.playerId === 'p4')).toEqual({ playerId: 'p4', points: 3 });
    expect(cumul.find((c) => c.playerId === 'p2')).toEqual({ playerId: 'p2', points: 2 });
  });

  it('initUndercover repart propre en manche suivante (cumul transmis, bons votes remis à zéro)', () => {
    const { state } = initUndercover(
      ids(4),
      { a: 'X', b: 'Y' },
      params({ manchesCount: 3 }),
      ctx(9),
      { mancheIndex: 2, carriedPoints: { p1: 3 } },
    );
    expect(state.mancheIndex).toBe(2);
    expect(state.carriedPoints).toEqual({ p1: 3 });
    expect(state.goodVoterIds).toEqual([]);
    expect(state.round).toBe(1);
    expect(state.describePass).toBe(1);
  });

  it('résumé de série : « en tête » avec le cumul', () => {
    const { state } = finishManche(
      state4({ params: params({ manchesCount: 2 }), mancheIndex: 2, carriedPoints: { p1: 2 } }),
    );
    const players = ids(4).map((id, i) => ({ id, name: `Joueur${i + 1}`, avatar: '🦊', connected: true, joinedAt: 0 }));
    const result = buildUndercoverResult(state, players, 0);
    expect(result.summary).toContain('2 manches');
    expect(result.summary).toContain('Joueur1');
    expect(result.points.find((p) => p.playerId === 'p1')?.points).toBe(4); // 2 (report) + 2 (manche unanime)
  });
});
