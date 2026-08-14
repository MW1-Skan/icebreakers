/**
 * Tests du réducteur Ito — la fiche 5.5 est la loi :
 * chaque cas limite de la fiche a son test ici.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../shared';
import type { ItoAction, ItoParams, ItoState, PlayerId } from '../../shared';
import type { EngineCtx, ReduceResult } from '../engine';
import {
  applyThemeChange,
  buildItoResult,
  canChangeTheme,
  drawNumbers,
  feasibleGap,
  guardIto,
  initIto,
  itoVerdict,
  reduceIto,
  resolveItoParams,
  startNextItoManche,
  validateItoSetup,
} from './ito.engine';

const IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];

function params(overrides: Partial<ItoParams> = {}): ItoParams {
  return resolveItoParams(overrides);
}

function ctx(seed = 1): EngineCtx {
  return { rng: mulberry32(seed) };
}

/** État de jeu avec nombres FORCÉS pour des scénarios lisibles. */
function playState(numbers: Record<PlayerId, number>, overrides: Partial<ItoState> = {}): ItoState {
  const ids = Object.keys(numbers);
  const { state } = initIto(ids, 'Aliments délicieux', params(), ctx());
  return { ...state, numbers, holders: [...ids], frise: [], ...overrides };
}

function dispatch(state: ItoState, action: ItoAction): ReduceResult<ItoState> {
  const g = guardIto(state, action, ctx());
  expect(g.ok, `action ${action.type} devrait être légale : ${JSON.stringify(g)}`).toBe(true);
  return reduceIto(state, action, ctx());
}

function expectDenied(state: ItoState, action: ItoAction): void {
  expect(guardIto(state, action, ctx()).ok, `action ${action.type} aurait dû être refusée`).toBe(false);
}

// ─── Setup, tirage des nombres, écart garanti ───────────────────────────────

describe('setup et tirage', () => {
  it('paramètres par défaut : 3 manches, 3 vies, 1–100, écart 8', () => {
    expect(params()).toEqual({ manchesCount: 3, livesCount: 3, rangeMax: 100, minGap: 8 });
    expect(validateItoSetup(2).ok).toBe(false);
    expect(validateItoSetup(3).ok).toBe(true);
    expect(validateItoSetup(11).ok).toBe(false);
  });

  it('cas limite fiche : écart infaisable → réduit automatiquement au maximum', () => {
    expect(feasibleGap(4, 100, 8)).toBe(8); // largement faisable
    expect(feasibleGap(8, 50, 8)).toBe(7); // 8 joueurs sur 1–50 → écart ≈ 6-7
    expect(feasibleGap(10, 20, 8)).toBe(2); // très serré
    expect(feasibleGap(10, 12, 8)).toBe(1); // à peine la place des nombres distincts
  });

  it('les nombres sont uniques, dans la plage, avec l’écart garanti (propriété sur 60 seeds)', () => {
    for (let seed = 0; seed < 60; seed++) {
      const gap = feasibleGap(6, 100, 8);
      const numbers = Object.values(drawNumbers(['a', 'b', 'c', 'd', 'e', 'f'], 100, gap, mulberry32(seed)));
      const sorted = [...numbers].sort((x, y) => x - y);
      expect(new Set(sorted).size).toBe(6); // égalité impossible : nombres uniques
      expect(sorted[0]).toBeGreaterThanOrEqual(1);
      expect(sorted[5]).toBeLessThanOrEqual(100);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(gap);
      }
    }
  });

  it('init : tout le monde a sa carte en main, vies pleines', () => {
    const { state } = initIto(IDS, 'Gravité d’un bug', params(), ctx());
    expect(state.phase).toBe('play');
    expect(state.holders).toEqual(IDS);
    expect(state.lives).toBe(3);
    expect(state.effectiveGap).toBe(8);
    expect(Object.keys(state.numbers)).toHaveLength(4);
  });
});

// ─── Poses : correctes, fautives, sérialisées ───────────────────────────────

describe('poses', () => {
  it('pose correcte : le plus petit restant → ✅, la carte rejoint la frise', () => {
    const s = playState({ p1: 10, p2: 40, p3: 70, p4: 90 });
    const { state, effects } = dispatch(s, { type: 'PLAY_CARD', playerId: 'p1' });
    expect(state.frise).toEqual([{ playerId: 'p1', number: 10, kind: 'posed' }]);
    expect(state.holders).toEqual(['p2', 'p3', 'p4']);
    expect(state.lives).toBe(3);
    expect(state.themeLocked).toBe(true);
    expect(effects).toContainEqual({ type: 'game:event', name: 'cardPosed', payload: { playerId: 'p1', correct: true } });
  });

  it('cas fiche : erreur → −1 vie et les nombres strictement inférieurs sont défaussés', () => {
    const s = playState({ p1: 10, p2: 25, p3: 40, p4: 90 });
    const { state, effects } = dispatch(s, { type: 'PLAY_CARD', playerId: 'p3' }); // 40 ≠ min
    expect(state.lives).toBe(2);
    expect(state.frise).toEqual([
      { playerId: 'p3', number: 40, kind: 'error' },
      { playerId: 'p1', number: 10, kind: 'discarded' },
      { playerId: 'p2', number: 25, kind: 'discarded' },
    ]);
    expect(state.holders).toEqual(['p4']); // la manche continue avec ce qui reste
    expect(effects).toContainEqual({ type: 'game:event', name: 'lifeLost', payload: { playerId: 'p3' } });
  });

  it('cas fiche : deux poses « simultanées » sérialisées, chacune évaluée dans l’état résultant', () => {
    const s = playState({ p1: 10, p2: 30, p3: 60 });
    // p2 pose (à tort) juste avant p1 : erreur, le 10 de p1 est défaussé…
    const first = dispatch(s, { type: 'PLAY_CARD', playerId: 'p2' }).state;
    expect(first.lives).toBe(2);
    // …la pose de p1 arrive ensuite : sa carte n'est plus en main → refusée proprement.
    expectDenied(first, { type: 'PLAY_CARD', playerId: 'p1' });
    // p3 pose : c'est désormais le plus petit restant → correcte.
    const second = dispatch(first, { type: 'PLAY_CARD', playerId: 'p3' });
    expect(second.state.frise.at(-1)).toEqual({ playerId: 'p3', number: 60, kind: 'posed' });
    expect(second.state.phase).toBe('mancheEnd');
  });

  it('une pose n’est jamais annulable (guard : carte déjà posée)', () => {
    const s = playState({ p1: 10, p2: 40, p3: 70 });
    const posed = dispatch(s, { type: 'PLAY_CARD', playerId: 'p1' }).state;
    expectDenied(posed, { type: 'PLAY_CARD', playerId: 'p1' });
  });

  it('la partie continue même à 0 vie (plancher, résultat défaite)', () => {
    const s = playState({ p1: 10, p2: 30, p3: 60 }, { lives: 1 });
    const afterError = dispatch(s, { type: 'PLAY_CARD', playerId: 'p3' }).state; // -1 → 0
    expect(afterError.lives).toBe(0);
    expect(afterError.phase).toBe('mancheEnd'); // 10 et 30 défaussés → plus de cartes
    expect(itoVerdict(0, 3)).toEqual({ victory: false, label: 'Désaccordés' });
  });
});

// ─── Libération de carte et changement de thème ─────────────────────────────

describe('contrôles animateur', () => {
  it('cas fiche : « libérer » la carte d’un déconnecté → révélée, défaussée, SANS coût de vie', () => {
    const s = playState({ p1: 10, p2: 40, p3: 70 });
    const { state } = dispatch(s, { type: 'HOST_RELEASE_CARD', playerId: 'p1' });
    expect(state.lives).toBe(3);
    expect(state.frise).toEqual([{ playerId: 'p1', number: 10, kind: 'released' }]);
    expect(state.holders).toEqual(['p2', 'p3']);
    // et la manche continue normalement : p2 (40) est maintenant le plus petit
    const after = dispatch(state, { type: 'PLAY_CARD', playerId: 'p2' }).state;
    expect(after.frise.at(-1)?.kind).toBe('posed');
  });

  it('cas fiche : changer de thème uniquement avant la première pose (les nombres restent)', () => {
    const s = playState({ p1: 10, p2: 40, p3: 70 });
    expect(canChangeTheme(s).ok).toBe(true);
    const changed = applyThemeChange(s, 'Superpouvoirs utiles').state;
    expect(changed.theme).toBe('Superpouvoirs utiles');
    expect(changed.numbers).toEqual(s.numbers);

    const posed = dispatch(s, { type: 'PLAY_CARD', playerId: 'p1' }).state;
    expect(canChangeTheme(posed).ok).toBe(false);
  });
});

// ─── Manches et fin de partie ───────────────────────────────────────────────

describe('manches et fin', () => {
  function finishManche(s: ItoState): ItoState {
    let cur = s;
    while (cur.phase === 'play') {
      const nextId = [...cur.holders].sort((a, b) => cur.numbers[a] - cur.numbers[b])[0];
      cur = dispatch(cur, { type: 'PLAY_CARD', playerId: nextId }).state;
    }
    return cur;
  }

  it('toutes les cartes posées → fin de manche, l’historique garde la frise', () => {
    const end = finishManche(playState({ p1: 10, p2: 40, p3: 70, p4: 90 }));
    expect(end.phase).toBe('mancheEnd');
    expect(end.history).toHaveLength(1);
    expect(end.history[0].livesLost).toBe(0);
    expect(end.history[0].frise.map((c) => c.number)).toEqual([10, 40, 70, 90]);
  });

  it('les vies sont pour TOUTE la partie ; la manche suivante repart propre', () => {
    const m1 = finishManche(playState({ p1: 30, p2: 10, p3: 70, p4: 90 }, { lives: 2 }));
    const next = startNextItoManche(m1, 'Choses effrayantes', ctx(7));
    expect(next).not.toBeNull();
    expect(next!.state.mancheIndex).toBe(2);
    expect(next!.state.lives).toBe(2); // vies conservées
    expect(next!.state.theme).toBe('Choses effrayantes');
    expect(next!.state.frise).toEqual([]);
    expect(next!.state.holders).toHaveLength(4);
    expect(next!.state.themeLocked).toBe(false);
  });

  it('après la dernière manche : HOST_NEXT → fin + verdict par vies restantes', () => {
    const last = finishManche(playState({ p1: 10, p2: 40, p3: 70 }, { mancheIndex: 3, lives: 2 }));
    expect(startNextItoManche(last, 'x', ctx())).toBeNull();
    const { state: end, effects } = dispatch(last, { type: 'HOST_NEXT' });
    expect(end.phase).toBe('end');
    expect(effects).toContainEqual({ type: 'game:ended' });

    expect(itoVerdict(3, 3)).toEqual({ victory: true, label: 'Télépathes !' });
    expect(itoVerdict(2, 3)).toEqual({ victory: true, label: 'Accordés' });
    expect(itoVerdict(1, 3)).toEqual({ victory: true, label: 'Ric-rac' });
    const result = buildItoResult(end, [], 0);
    expect(result.summary).toBe('2/3 vies — Accordés');
    expect(result.points).toEqual([]);
  });
});
