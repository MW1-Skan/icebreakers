/**
 * Tests du réducteur Spyfall — la fiche 5.4 est la loi :
 * chaque cas limite de la fiche a son test ici.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../shared';
import type { PlayerId, SpyfallAction, SpyfallState } from '../../shared';
import type { EngineCtx, ReduceResult } from '../engine';
import {
  buildSpyfallResult,
  guardSpyfall,
  initSpyfall,
  reduceSpyfall,
  resolveSpyfallParams,
  startNextSpyfallManche,
  validateSpyfallSetup,
} from './spyfall.engine';

const IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5'];
const THEME = { category: 'Lieux', grid: ['La plage', 'Le casino', 'La station spatiale', 'Le sous-marin', 'Le supermarché', 'L’école', 'Le théâtre', 'L’avion'] };

function ctx(connectedIds?: PlayerId[], seed = 1): EngineCtx {
  return { rng: mulberry32(seed), connectedIds };
}

/** État contrôlé : espion p5, carte « La plage », en interrogatoire. */
function atInterrogate(overrides: Partial<SpyfallState> = {}): SpyfallState {
  const { state } = initSpyfall(IDS, THEME, resolveSpyfallParams({}), ctx());
  return {
    ...state,
    phase: 'interrogate',
    spyId: 'p5',
    card: 'La plage',
    firstQuestionerId: 'p1',
    ...overrides,
  };
}

function dispatch(
  state: SpyfallState,
  action: SpyfallAction,
  context: EngineCtx = ctx(),
): ReduceResult<SpyfallState> {
  const g = guardSpyfall(state, action, context);
  expect(g.ok, `action ${action.type} devrait être légale : ${JSON.stringify(g)}`).toBe(true);
  return reduceSpyfall(state, action, context);
}

function expectDenied(state: SpyfallState, action: SpyfallAction, context: EngineCtx = ctx()): void {
  expect(guardSpyfall(state, action, context).ok, `action ${action.type} aurait dû être refusée`).toBe(false);
}

// ─── Setup ──────────────────────────────────────────────────────────────────

describe('setup', () => {
  it('valide l’effectif 4–10 ; défauts : manche 6 min, 1 manche', () => {
    expect(validateSpyfallSetup(3).ok).toBe(false);
    expect(validateSpyfallSetup(4).ok).toBe(true);
    expect(validateSpyfallSetup(11).ok).toBe(false);
    expect(resolveSpyfallParams({})).toMatchObject({ mancheSeconds: 360, manchesCount: 1 });
  });

  it('init : espion parmi les joueurs actifs, carte dans la grille, premier questionneur tiré', () => {
    const { state } = initSpyfall(IDS, THEME, resolveSpyfallParams({}), ctx());
    expect(state.phase).toBe('brief');
    expect(IDS).toContain(state.spyId);
    expect(THEME.grid).toContain(state.card);
    expect(IDS).toContain(state.firstQuestionerId);
    expect(state.grid).toEqual(THEME.grid);
  });

  it('brief → interrogatoire au clic host, timer de manche lancé', () => {
    const { state: brief } = initSpyfall(IDS, THEME, resolveSpyfallParams({}), ctx());
    const seen = dispatch(brief, { type: 'SEEN_CARD', playerId: 'p2' }).state;
    expect(seen.seenCardIds).toEqual(['p2']);
    const { state, effects } = dispatch(seen, { type: 'HOST_NEXT' });
    expect(state.phase).toBe('interrogate');
    expect(effects).toContainEqual({ type: 'timer:start', id: 'manche', seconds: 360 });
  });
});

// ─── Accusations ────────────────────────────────────────────────────────────

describe('accusations', () => {
  it('une accusation par joueur et par manche, jamais soi-même', () => {
    const s = atInterrogate({ accusationsUsed: ['p1'] });
    expectDenied(s, { type: 'ACCUSE', accuserId: 'p1', accusedId: 'p5' }); // déjà utilisée
    expectDenied(s, { type: 'ACCUSE', accuserId: 'p2', accusedId: 'p2' }); // soi-même
    const { state, effects } = dispatch(s, { type: 'ACCUSE', accuserId: 'p2', accusedId: 'p5' });
    expect(state.phase).toBe('accusationVote');
    expect(state.accusationsUsed).toContain('p2');
    expect(effects).toContainEqual({ type: 'timer:pause', id: 'manche' });
    expect(effects).toContainEqual({ type: 'timer:start', id: 'accusationVote', seconds: 30 });
  });

  it('cas fiche : deux accusations « simultanées » — la 2e est rejetée SANS être consommée', () => {
    const s = atInterrogate();
    const first = dispatch(s, { type: 'ACCUSE', accuserId: 'p2', accusedId: 'p5' }).state;
    expectDenied(first, { type: 'ACCUSE', accuserId: 'p3', accusedId: 'p4' });
    expect(first.accusationsUsed).not.toContain('p3'); // il pourra accuser plus tard
  });

  it('l’accusé ne vote pas ; unanimité de Oui sur l’espion → l’équipe gagne, accusateur décisif +2', () => {
    let s = dispatch(atInterrogate(), { type: 'ACCUSE', accuserId: 'p2', accusedId: 'p5' }).state;
    expectDenied(s, { type: 'VOTE_ACCUSATION', playerId: 'p5', yes: true });
    s = dispatch(s, { type: 'VOTE_ACCUSATION', playerId: 'p1', yes: true }).state;
    s = dispatch(s, { type: 'VOTE_ACCUSATION', playerId: 'p2', yes: true }).state;
    s = dispatch(s, { type: 'VOTE_ACCUSATION', playerId: 'p3', yes: true }).state;
    const { state: resolved, effects } = dispatch(s, { type: 'VOTE_ACCUSATION', playerId: 'p4', yes: true });
    expect(resolved.phase).toBe('reveal');
    expect(resolved.lastOutcome).toMatchObject({
      winner: 'team',
      reason: 'accusationRight',
      decisiveAccuserId: 'p2',
    });
    // barème : équipe 1 pt chacun + 2 pts pour l'accusateur décisif ; espion 0
    expect(resolved.totals).toEqual({ p1: 1, p2: 3, p3: 1, p4: 1, p5: 0 });
    expect(effects).toContainEqual({ type: 'timer:cancel', id: 'manche' });
  });

  it('accusation unanime… sur un civil → l’espion gagne (4 pts) et se révèle', () => {
    let s = dispatch(atInterrogate(), { type: 'ACCUSE', accuserId: 'p2', accusedId: 'p3' }).state;
    for (const voter of ['p1', 'p2', 'p4'] as const) {
      s = dispatch(s, { type: 'VOTE_ACCUSATION', playerId: voter, yes: true }).state;
    }
    const { state: resolved } = dispatch(s, { type: 'VOTE_ACCUSATION', playerId: 'p5', yes: true });
    expect(resolved.lastOutcome).toMatchObject({ winner: 'spy', reason: 'accusationWrong' });
    expect(resolved.totals.p5).toBe(4);
  });

  it('un seul Non (ou un timeout avec votes manquants) → le timer reprend, accusation consommée', () => {
    let s = dispatch(atInterrogate(), { type: 'ACCUSE', accuserId: 'p2', accusedId: 'p5' }).state;
    s = dispatch(s, { type: 'VOTE_ACCUSATION', playerId: 'p1', yes: true }).state;
    s = dispatch(s, { type: 'VOTE_ACCUSATION', playerId: 'p2', yes: true }).state;
    s = dispatch(s, { type: 'VOTE_ACCUSATION', playerId: 'p3', yes: false }).state;
    const { state: failed, effects } = dispatch(s, { type: 'VOTE_ACCUSATION', playerId: 'p4', yes: true });
    expect(failed.phase).toBe('interrogate');
    expect(failed.accusation).toBeUndefined();
    expect(failed.accusationsUsed).toContain('p2');
    expect(effects).toContainEqual({ type: 'timer:resume', id: 'manche' });

    const viaTimeout = dispatch(
      dispatch(failed, { type: 'ACCUSE', accuserId: 'p3', accusedId: 'p5' }).state,
      { type: 'TIMEOUT', timerId: 'accusationVote' },
    );
    expect(viaTimeout.state.phase).toBe('interrogate'); // votes manquants ≠ unanimité
  });

  it('cas fiche : non-espion déconnecté → exclu du vote en cours (unanimité sur les connectés)', () => {
    const context = ctx(['p1', 'p2', 'p3', 'p5']); // p4 déconnecté
    let s = dispatch(atInterrogate(), { type: 'ACCUSE', accuserId: 'p2', accusedId: 'p5' }, context).state;
    s = reduceSpyfall(s, { type: 'VOTE_ACCUSATION', playerId: 'p1', yes: true }, context).state;
    s = reduceSpyfall(s, { type: 'VOTE_ACCUSATION', playerId: 'p2', yes: true }, context).state;
    const { state: resolved } = reduceSpyfall(s, { type: 'VOTE_ACCUSATION', playerId: 'p3', yes: true }, context);
    expect(resolved.phase).toBe('reveal'); // p4 absent n'a pas bloqué l'unanimité
    expect(resolved.lastOutcome?.winner).toBe('team');
  });
});

// ─── Coup de l'espion ───────────────────────────────────────────────────────

describe('coup de l’espion', () => {
  it('seul l’espion se révèle, hors accusation ; le jeu se fige', () => {
    expectDenied(atInterrogate(), { type: 'SPY_REVEAL', playerId: 'p2' });
    const { state, effects } = dispatch(atInterrogate(), { type: 'SPY_REVEAL', playerId: 'p5' });
    expect(state.phase).toBe('spyGuess');
    expect(effects).toContainEqual({ type: 'timer:pause', id: 'manche' });

    // sérialisation : accusation pendant le guess → refusée
    expectDenied(state, { type: 'ACCUSE', accuserId: 'p2', accusedId: 'p5' });
    // et réciproquement : se révéler pendant un vote d'accusation → refusé
    const accusing = dispatch(atInterrogate(), { type: 'ACCUSE', accuserId: 'p2', accusedId: 'p3' }).state;
    expectDenied(accusing, { type: 'SPY_REVEAL', playerId: 'p5' });
  });

  it('carte correcte → l’espion gagne ; incorrecte (ou timeout) → l’équipe gagne', () => {
    const guessing = dispatch(atInterrogate(), { type: 'SPY_REVEAL', playerId: 'p5' }).state;
    expectDenied(guessing, { type: 'SPY_GUESS', playerId: 'p5', card: 'Le volcan' }); // hors grille

    const right = dispatch(guessing, { type: 'SPY_GUESS', playerId: 'p5', card: 'la plage' });
    expect(right.state.lastOutcome).toMatchObject({ winner: 'spy', reason: 'spyGuessRight' });
    expect(right.state.totals.p5).toBe(4);

    const wrong = dispatch(guessing, { type: 'SPY_GUESS', playerId: 'p5', card: 'Le casino' });
    expect(wrong.state.lastOutcome).toMatchObject({ winner: 'team', reason: 'spyGuessWrong' });
    expect(wrong.state.totals).toMatchObject({ p1: 1, p2: 1, p3: 1, p4: 1, p5: 0 });

    const timedOut = dispatch(guessing, { type: 'TIMEOUT', timerId: 'spyGuess' });
    expect(timedOut.state.lastOutcome?.winner).toBe('team');
  });
});

// ─── Vote final ─────────────────────────────────────────────────────────────

describe('vote final', () => {
  function atFinalVote(): SpyfallState {
    return dispatch(atInterrogate(), { type: 'TIMEOUT', timerId: 'manche' }).state;
  }

  it('fin du timer → vote final obligatoire (45 s), pas d’auto-désignation', () => {
    const s = atFinalVote();
    expect(s.phase).toBe('finalVote');
    expectDenied(s, { type: 'VOTE_FINAL', playerId: 'p1', target: 'p1' });
  });

  it('le plus voté est l’espion → l’équipe gagne', () => {
    let s = atFinalVote();
    for (const voter of ['p1', 'p2', 'p3', 'p4'] as const) {
      s = dispatch(s, { type: 'VOTE_FINAL', playerId: voter, target: 'p5' }).state;
    }
    const { state: resolved } = dispatch(s, { type: 'VOTE_FINAL', playerId: 'p5', target: 'p1' });
    expect(resolved.lastOutcome).toMatchObject({ winner: 'team', reason: 'finalVoteRight', topVotedId: 'p5' });
  });

  it('cas fiche : égalité au vote final → l’espion gagne (il a semé le doute)', () => {
    let s = atFinalVote();
    s = dispatch(s, { type: 'VOTE_FINAL', playerId: 'p1', target: 'p5' }).state;
    s = dispatch(s, { type: 'VOTE_FINAL', playerId: 'p2', target: 'p5' }).state;
    s = dispatch(s, { type: 'VOTE_FINAL', playerId: 'p3', target: 'p1' }).state;
    s = dispatch(s, { type: 'VOTE_FINAL', playerId: 'p4', target: 'p1' }).state;
    const { state: resolved } = dispatch(s, { type: 'VOTE_FINAL', playerId: 'p5', target: 'p2' });
    expect(resolved.lastOutcome).toMatchObject({ winner: 'spy', reason: 'finalVoteMiss' });
    expect(resolved.totals.p5).toBe(4);
  });

  it('le plus voté est un civil → l’espion gagne ; timeout avec votes partiels résout aussi', () => {
    let s = atFinalVote();
    s = dispatch(s, { type: 'VOTE_FINAL', playerId: 'p1', target: 'p3' }).state;
    s = dispatch(s, { type: 'VOTE_FINAL', playerId: 'p2', target: 'p3' }).state;
    const { state: resolved } = dispatch(s, { type: 'TIMEOUT', timerId: 'finalVote' });
    expect(resolved.lastOutcome).toMatchObject({ winner: 'spy', topVotedId: 'p3' });
  });
});

// ─── Espion déconnecté (cas limite fiche) ───────────────────────────────────

describe('espion déconnecté', () => {
  it('gel de la manche, reprise à son retour', () => {
    const { state: frozen, effects } = dispatch(atInterrogate(), { type: 'SPY_DISCONNECTED' });
    expect(frozen.frozen).toBe(true);
    expect(effects).toContainEqual({ type: 'timer:pause', id: 'manche' });
    expect(effects).toContainEqual({ type: 'timer:start', id: 'spyGone', seconds: 60 });

    const { state: back, effects: backEffects } = dispatch(frozen, { type: 'SPY_RECONNECTED' });
    expect(back.frozen).toBe(false);
    expect(backEffects).toContainEqual({ type: 'timer:resume', id: 'manche' });
  });

  it('absent > 60 s → manche annulée : révélation, aucune valeur (0 point partout)', () => {
    const frozen = dispatch(atInterrogate(), { type: 'SPY_DISCONNECTED' }).state;
    const { state: aborted } = dispatch(frozen, { type: 'TIMEOUT', timerId: 'spyGone' });
    expect(aborted.phase).toBe('reveal');
    expect(aborted.lastOutcome).toMatchObject({ reason: 'aborted', spyId: 'p5' });
    expect(aborted.lastOutcome?.winner).toBeUndefined();
    expect(Object.values(aborted.totals).every((p) => p === 0)).toBe(true);
  });
});

// ─── Manches multiples et fin ───────────────────────────────────────────────

describe('manches et fin', () => {
  it('manche suivante : nouveau tirage, accusations remises à zéro, cumul conservé', () => {
    const s = atInterrogate({
      phase: 'reveal',
      params: resolveSpyfallParams({ manchesCount: 2 }),
      totals: { p1: 1, p2: 3, p3: 1, p4: 1, p5: 0 },
      accusationsUsed: ['p2'],
      lastOutcome: { winner: 'team', reason: 'accusationRight', spyId: 'p5', card: 'La plage' },
    });
    const next = startNextSpyfallManche(s, { category: 'Métiers', grid: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }, ctx(undefined, 7));
    expect(next).not.toBeNull();
    expect(next!.state.mancheIndex).toBe(2);
    expect(next!.state.category).toBe('Métiers');
    expect(next!.state.accusationsUsed).toEqual([]);
    expect(next!.state.totals.p2).toBe(3);
    expect(next!.state.phase).toBe('brief');
  });

  it('après la dernière manche : HOST_NEXT → fin + récap', () => {
    const s = atInterrogate({
      phase: 'reveal',
      totals: { p1: 1, p2: 3, p3: 1, p4: 1, p5: 0 },
      history: [
        {
          category: 'Lieux',
          card: 'La plage',
          spyId: 'p5',
          outcome: { winner: 'team', reason: 'accusationRight', spyId: 'p5', card: 'La plage', decisiveAccuserId: 'p2' },
        },
      ],
    });
    const { state: end, effects } = dispatch(s, { type: 'HOST_NEXT' });
    expect(end.phase).toBe('end');
    expect(effects).toContainEqual({ type: 'game:ended' });

    const players = IDS.map((id, i) => ({ id, name: `Joueur${i + 1}`, avatar: '🦊', connected: true, joinedAt: i }));
    const result = buildSpyfallResult(end, players, 0);
    expect(result.summary).toBe('L’équipe démasque l’espion');
    expect(result.points[0]).toMatchObject({ name: 'Joueur2', points: 3 });
  });
});
