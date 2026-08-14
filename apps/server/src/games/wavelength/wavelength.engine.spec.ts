/**
 * Tests du réducteur Wavelength — la fiche 5.2 (v3) est la loi :
 * chaque cas limite de la fiche a son test ici.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../shared';
import type { PlayerId, WavelengthAction, WavelengthParams, WavelengthState } from '../../shared';
import type { EngineCtx, ReduceResult } from '../engine';
import {
  buildWavelengthResult,
  clueViolation,
  guardWavelength,
  initWavelength,
  pointsForPlacement,
  resolveWavelengthParams,
  reduceWavelength,
  sortedTotals,
  startNextWavelengthTurn,
  validateWavelengthSetup,
} from './wavelength.engine';

const IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];
const AXIS = { left: 'Chaud', right: 'Froid' };

function params(overrides: Partial<WavelengthParams> = {}): WavelengthParams {
  return resolveWavelengthParams(IDS.length, overrides);
}

function ctx(connectedIds?: PlayerId[], seed = 1): EngineCtx {
  return { rng: mulberry32(seed), connectedIds };
}

function freshState(overrides: Partial<WavelengthState> = {}): WavelengthState {
  const { state } = initWavelength(IDS, AXIS, params(), ctx());
  return { ...state, ...overrides };
}

function dispatch(
  state: WavelengthState,
  action: WavelengthAction,
  context: EngineCtx = ctx(),
): ReduceResult<WavelengthState> {
  const g = guardWavelength(state, action, context);
  expect(g.ok, `action ${action.type} devrait être légale : ${JSON.stringify(g)}`).toBe(true);
  return reduceWavelength(state, action, context);
}

function expectDenied(state: WavelengthState, action: WavelengthAction, context: EngineCtx = ctx()): void {
  expect(guardWavelength(state, action, context).ok, `action ${action.type} aurait dû être refusée`).toBe(false);
}

/** État en phase placement, cible fixée à 50 pour des scores prévisibles. */
function atPlace(target = 50): WavelengthState {
  const s = freshState({ target });
  return dispatch(s, { type: 'SUBMIT_CLUE', playerId: 'p1', clue: 'tiède mais pas trop' }).state;
}

// ─── Paramétrage, setup, rotation ───────────────────────────────────────────

describe('setup et rotation', () => {
  it('manches par défaut = nb de joueurs actifs, plafonné à 7', () => {
    expect(resolveWavelengthParams(4, {}).manchesCount).toBe(4);
    expect(resolveWavelengthParams(9, {}).manchesCount).toBe(7);
    expect(resolveWavelengthParams(9, { manchesCount: 3 }).manchesCount).toBe(3);
  });

  it('valide l’effectif 3–10', () => {
    expect(validateWavelengthSetup(2).ok).toBe(false);
    expect(validateWavelengthSetup(3).ok).toBe(true);
    expect(validateWavelengthSetup(10).ok).toBe(true);
    expect(validateWavelengthSetup(11).ok).toBe(false);
  });

  it('le télépathe tourne dans l’ordre d’arrivée ; la cible est un entier 0–100', () => {
    const s = freshState();
    expect(s.currentTelepathId).toBe('p1');
    expect(s.telepathQueue).toEqual(['p2', 'p3', 'p4']);
    expect(s.phase).toBe('clue');
    expect(Number.isInteger(s.target)).toBe(true);
    expect(s.target).toBeGreaterThanOrEqual(0);
    expect(s.target).toBeLessThanOrEqual(100);
  });

  it('plus de manches que de joueurs → la rotation boucle', () => {
    const { state } = initWavelength(IDS, AXIS, params({ manchesCount: 6 }), ctx());
    expect(state.telepathQueue).toEqual(['p2', 'p3', 'p4', 'p1', 'p2']);
  });

  it('le tour suivant réinitialise indice, placements et tire une nouvelle cible', () => {
    let s = atPlace();
    s = dispatch(s, { type: 'PLACE', playerId: 'p2', value: 50 }).state;
    s = dispatch(s, { type: 'PLACE', playerId: 'p3', value: 50 }).state;
    s = dispatch(s, { type: 'PLACE', playerId: 'p4', value: 50 }).state;
    expect(s.phase).toBe('reveal');
    const next = startNextWavelengthTurn(s, { left: 'A', right: 'B' }, ctx(undefined, 9));
    expect(next).not.toBeNull();
    expect(next!.state.currentTelepathId).toBe('p2');
    expect(next!.state.mancheNumber).toBe(2);
    expect(next!.state.clue).toBeUndefined();
    expect(next!.state.placements).toEqual({});
    expect(next!.state.axis).toEqual({ left: 'A', right: 'B' });
  });
});

// ─── Indice : règles et invalidation ────────────────────────────────────────

describe('indice', () => {
  it('règles affichées ET vérifiées : pas de nombre, pas les mots des pôles', () => {
    expect(clueViolation('vers 70', AXIS)).toBeTruthy();
    expect(clueViolation('chaud', AXIS)).toBeTruthy(); // pôle, insensible casse/accents
    expect(clueViolation('Froid', AXIS)).toBeTruthy();
    expect(clueViolation('un café oublié sur la table', AXIS)).toBeUndefined();

    expectDenied(freshState(), { type: 'SUBMIT_CLUE', playerId: 'p1', clue: 'environ 30' });
    expectDenied(freshState(), { type: 'SUBMIT_CLUE', playerId: 'p1', clue: 'p2 triche' }, ctx());
  });

  it('seul le télépathe donne l’indice ; une expression est admise', () => {
    expectDenied(freshState(), { type: 'SUBMIT_CLUE', playerId: 'p2', clue: 'tiède' });
    const { state, effects } = dispatch(freshState(), {
      type: 'SUBMIT_CLUE',
      playerId: 'p1',
      clue: 'un bain qui a attendu',
    });
    expect(state.phase).toBe('place');
    expect(state.clue).toBe('un bain qui a attendu');
    expect(effects).toContainEqual({ type: 'timer:start', id: 'place', seconds: 45 });
  });

  it('cas limite fiche : indice illégal invalidé par le host → re-saisie, cible inchangée', () => {
    let s = atPlace(42);
    s = dispatch(s, { type: 'PLACE', playerId: 'p2', value: 10 }).state;
    const { state: back, effects } = dispatch(s, { type: 'HOST_INVALIDATE_CLUE' });
    expect(back.phase).toBe('clue');
    expect(back.clue).toBeUndefined();
    expect(back.placements).toEqual({}); // les curseurs posés sur un indice invalide sautent
    expect(back.target).toBe(42);
    expect(effects).toContainEqual({ type: 'timer:cancel', id: 'place' });
  });
});

// ─── Placement secret et révélation ─────────────────────────────────────────

describe('placement et révélation', () => {
  it('le télépathe ne place pas ; un curseur est modifiable jusqu’à la clôture', () => {
    const s = atPlace();
    expectDenied(s, { type: 'PLACE', playerId: 'p1', value: 50 });
    let cur = dispatch(s, { type: 'PLACE', playerId: 'p2', value: 10 }).state;
    cur = dispatch(cur, { type: 'PLACE', playerId: 'p2', value: 90 }).state;
    expect(cur.placements.p2).toBe(90);
    expect(cur.phase).toBe('place');
  });

  it('barème par zones : ±5 → 4 pts, ±10 → 3, ±15 → 2, sinon 0 (largeur paramétrable)', () => {
    expect(pointsForPlacement(50, 50, 5)).toBe(4);
    expect(pointsForPlacement(55, 50, 5)).toBe(4);
    expect(pointsForPlacement(56, 50, 5)).toBe(3);
    expect(pointsForPlacement(60, 50, 5)).toBe(3);
    expect(pointsForPlacement(65, 50, 5)).toBe(2);
    expect(pointsForPlacement(66, 50, 5)).toBe(0);
    expect(pointsForPlacement(70, 50, 8)).toBe(2); // zones élargies : ±24 → 2 pts
  });

  it('révélation d’un coup quand tous ont placé : curseurs nominatifs + points + cumul', () => {
    let s = atPlace(50);
    s = dispatch(s, { type: 'PLACE', playerId: 'p2', value: 52 }).state; // 4 pts
    s = dispatch(s, { type: 'PLACE', playerId: 'p3', value: 60 }).state; // 3 pts
    const { state: revealed, effects } = dispatch(s, { type: 'PLACE', playerId: 'p4', value: 90 }); // 0 pt
    expect(revealed.phase).toBe('reveal');
    expect(effects).toContainEqual({ type: 'timer:cancel', id: 'place' });
    expect(revealed.lastResult?.results).toEqual([
      { playerId: 'p2', value: 52, points: 4 },
      { playerId: 'p3', value: 60, points: 3 },
      { playerId: 'p4', value: 90, points: 0 },
    ]);
    // télépathe : moyenne arrondie (4+3+0)/3 = 2.33 → 2
    expect(revealed.lastResult?.telepathPoints).toBe(2);
    expect(revealed.totals).toEqual({ p1: 2, p2: 4, p3: 3, p4: 0 });
  });

  it('cas limite fiche : joueur déconnecté pendant le placement → 0 point, cumul intact', () => {
    // p4 est déconnecté : la clôture anticipée n'attend que p2 et p3.
    const context = ctx(['p1', 'p2', 'p3']);
    let s = atPlace(50);
    s = reduceWavelength(s, { type: 'PLACE', playerId: 'p2', value: 50 }, context).state;
    const { state: revealed } = reduceWavelength(s, { type: 'PLACE', playerId: 'p3', value: 50 }, context);
    expect(revealed.phase).toBe('reveal');
    expect(revealed.lastResult?.results.map((r) => r.playerId)).toEqual(['p2', 'p3']);
    expect(revealed.totals.p4).toBe(0);
    // la moyenne du télépathe ignore l'absent : (4+4)/2 = 4
    expect(revealed.lastResult?.telepathPoints).toBe(4);
  });

  it('timeout de placement → révélation avec les curseurs posés', () => {
    let s = atPlace(50);
    s = dispatch(s, { type: 'PLACE', playerId: 'p2', value: 48 }).state;
    const { state: revealed } = dispatch(s, { type: 'TIMEOUT', timerId: 'place' });
    expect(revealed.phase).toBe('reveal');
    expect(revealed.lastResult?.results).toHaveLength(1);
  });
});

// ─── Télépathe déconnecté (cas limites fiche) ───────────────────────────────

describe('télépathe déconnecté', () => {
  it('avant l’indice : manche annulée, rejouée en fin de partie (un seul repêchage)', () => {
    const s = freshState();
    const { state: aborted } = dispatch(s, { type: 'TELEPATH_LEFT' });
    expect(aborted.phase).toBe('aborted');
    expect(aborted.telepathQueue).toEqual(['p2', 'p3', 'p4', 'p1']); // repêché en fin
    expect(aborted.manchesPlanned).toBe(5);
    expect(aborted.history[0]).toMatchObject({ telepathId: 'p1', aborted: true });

    // deuxième abandon du même télépathe → pas de nouveau repêchage
    let cur = aborted;
    while (cur.telepathQueue.length > 0) {
      const next = startNextWavelengthTurn(cur, AXIS, ctx())!;
      cur = next.state;
      if (cur.currentTelepathId === 'p1') break;
      cur = { ...cur, phase: 'reveal' };
    }
    expect(cur.currentTelepathId).toBe('p1');
    const again = dispatch(cur, { type: 'TELEPATH_LEFT' }).state;
    expect(again.telepathQueue).not.toContain('p1');
  });

  it('après l’indice : la manche continue normalement (rôle passif)', () => {
    const s = atPlace();
    expectDenied(s, { type: 'TELEPATH_LEFT' });
  });
});

// ─── Fin de partie ──────────────────────────────────────────────────────────

describe('fin de partie', () => {
  it('file épuisée → HOST_NEXT termine ; égalité = victoire partagée', () => {
    const s = freshState({
      phase: 'reveal',
      telepathQueue: [],
      totals: { p1: 7, p2: 7, p3: 3, p4: 0 },
    });
    const { state: end, effects } = dispatch(s, { type: 'HOST_NEXT' });
    expect(end.phase).toBe('end');
    expect(effects).toContainEqual({ type: 'game:ended' });

    const players = IDS.map((id, i) => ({ id, name: `Joueur${i + 1}`, avatar: '🦊', connected: true, joinedAt: i }));
    const result = buildWavelengthResult(end, players, 0);
    expect(result.summary).toContain('Joueur1 & Joueur2');
    expect(result.summary).toContain('7 pts');
    expect(sortedTotals(end)[0].points).toBe(7);
  });
});
