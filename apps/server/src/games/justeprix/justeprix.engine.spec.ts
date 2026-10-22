/**
 * Tests du réducteur Juste Prix — la fiche docs/fiches/juste-prix.md est la
 * loi : chaque règle et chaque cas limite de la fiche a son test ici.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../shared';
import type {
  JustePrixAction,
  JustePrixItem,
  JustePrixParams,
  JustePrixState,
  Player,
  PlayerId,
} from '../../shared';
import type { EngineCtx, ReduceResult } from '../engine';
import {
  applyItemChange,
  buildJustePrixResult,
  canChangeItem,
  guardJustePrix,
  initJustePrix,
  rankBids,
  reduceJustePrix,
  resolveJustePrixParams,
  roundBid,
  sortedTotals,
  validateJustePrixSetup,
} from './justeprix.engine';

const IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];

function item(n: number, price: number): JustePrixItem {
  return {
    elementId: `pack#${n}`,
    name: `Article ${n}`,
    details: `Détail ${n}`,
    price,
    image: `https://cdn.exemple.fr/${n}.jpg`,
    source: `https://boutique.exemple.fr/${n}`,
    seenAt: '2026-10',
  };
}

const ITEMS = [item(1, 200), item(2, 49.9), item(3, 18840)];

function params(overrides: Partial<JustePrixParams> = {}): JustePrixParams {
  return resolveJustePrixParams({ manchesCount: ITEMS.length, ...overrides });
}

function ctx(connectedIds?: PlayerId[]): EngineCtx {
  return { rng: mulberry32(1), connectedIds };
}

function freshState(overrides: Partial<JustePrixParams> = {}): JustePrixState {
  return initJustePrix(IDS, ITEMS, params(overrides), ctx()).state;
}

function dispatch(
  state: JustePrixState,
  action: JustePrixAction,
  context: EngineCtx = ctx(),
): ReduceResult<JustePrixState> {
  const g = guardJustePrix(state, action, context);
  expect(g.ok, `action ${action.type} devrait être légale : ${JSON.stringify(g)}`).toBe(true);
  return reduceJustePrix(state, action, context);
}

function expectDenied(state: JustePrixState, action: JustePrixAction, context: EngineCtx = ctx()): void {
  expect(guardJustePrix(state, action, context).ok, `action ${action.type} aurait dû être refusée`).toBe(false);
}

/** Fait miser chaque joueur (dans l'ordre) ; renvoie le dernier résultat. */
function bidAll(state: JustePrixState, amounts: Record<PlayerId, number>, context: EngineCtx = ctx()) {
  let result: ReduceResult<JustePrixState> = { state, effects: [] };
  for (const [playerId, amount] of Object.entries(amounts)) {
    result = dispatch(result.state, { type: 'ESTIMATE', playerId, amount }, context);
  }
  return result;
}

function pointsOf(state: JustePrixState): Record<PlayerId, number> {
  return Object.fromEntries(state.lastResult!.results.map((r) => [r.playerId, r.points]));
}

// ─── Paramétrage et lancement ───────────────────────────────────────────────

describe('paramétrage et lancement', () => {
  it('défauts de la fiche : 6 articles, 45 s, « sans dépasser » désactivé', () => {
    expect(resolveJustePrixParams({})).toEqual({ manchesCount: 6, guessSeconds: 45, noOverbid: false });
    expect(resolveJustePrixParams({ manchesCount: 10, noOverbid: true }).manchesCount).toBe(10);
  });

  it('valide l’effectif 3–10', () => {
    expect(validateJustePrixSetup(2).ok).toBe(false);
    expect(validateJustePrixSetup(3).ok).toBe(true);
    expect(validateJustePrixSetup(10).ok).toBe(true);
    expect(validateJustePrixSetup(11).ok).toBe(false);
  });

  it('démarre directement en estimation, chrono lancé, cumul à zéro', () => {
    const { state, effects } = initJustePrix(IDS, ITEMS, params({ guessSeconds: 30 }), ctx());
    expect(state.phase).toBe('guess');
    expect(state.itemIndex).toBe(0);
    expect(state.items).toHaveLength(3);
    expect(state.totals).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(effects).toContainEqual({ type: 'timer:start', id: 'guess', seconds: 30 });
  });
});

// ─── Estimations ────────────────────────────────────────────────────────────

describe('estimations', () => {
  it('une mise est arrondie au centime et modifiable jusqu’à la clôture', () => {
    let s = dispatch(freshState(), { type: 'ESTIMATE', playerId: 'p1', amount: 150.456 }).state;
    expect(s.bids.p1).toBe(150.46);
    s = dispatch(s, { type: 'ESTIMATE', playerId: 'p1', amount: 180 }).state;
    expect(s.bids.p1).toBe(180);
    expect(s.phase).toBe('guess');
    expect(roundBid(12.346)).toBe(12.35);
  });

  it('refuse les mises hors partie, hors phase ou absurdes', () => {
    const s = freshState();
    expectDenied(s, { type: 'ESTIMATE', playerId: 'intrus', amount: 10 });
    expectDenied(s, { type: 'ESTIMATE', playerId: 'p1', amount: -1 });
    expectDenied(s, { type: 'ESTIMATE', playerId: 'p1', amount: Number.NaN });
    expectDenied(s, { type: 'ESTIMATE', playerId: 'p1', amount: 1_000_000_001 });
    const revealed = bidAll(s, { p1: 1, p2: 2, p3: 3, p4: 4 }).state;
    expectDenied(revealed, { type: 'ESTIMATE', playerId: 'p1', amount: 10 });
  });

  it('0 € est accepté', () => {
    const s = dispatch(freshState(), { type: 'ESTIMATE', playerId: 'p1', amount: 0 }).state;
    expect(s.bids.p1).toBe(0);
  });

  it('clôture anticipée : tous les joueurs CONNECTÉS ont misé → révélation, chrono annulé', () => {
    const partial = bidAll(freshState(), { p1: 100, p2: 150, p3: 250 });
    expect(partial.state.phase).toBe('guess');
    const done = dispatch(partial.state, { type: 'ESTIMATE', playerId: 'p4', amount: 300 });
    expect(done.state.phase).toBe('reveal');
    expect(done.effects).toContainEqual({ type: 'timer:cancel', id: 'guess' });
  });

  it('un déconnecté ne bloque pas la clôture anticipée', () => {
    const connected = ctx(['p1', 'p2', 'p3']);
    const done = bidAll(freshState(), { p1: 100, p2: 150, p3: 250 }, connected);
    expect(done.state.phase).toBe('reveal');
    const p4 = done.state.lastResult!.results.find((r) => r.playerId === 'p4');
    expect(p4).toBeUndefined();
    expect(done.state.totals.p4).toBe(0);
  });

  it('PLAYER_GONE : le dernier attendu part → révélation ; sinon rien', () => {
    const partial = bidAll(freshState(), { p1: 100, p2: 150 });
    const still = dispatch(partial.state, { type: 'PLAYER_GONE' }, ctx(['p1', 'p2', 'p3']));
    expect(still.state.phase).toBe('guess');
    const gone = dispatch(partial.state, { type: 'PLAYER_GONE' }, ctx(['p1', 'p2']));
    expect(gone.state.phase).toBe('reveal');
    expect(gone.effects).toContainEqual({ type: 'timer:cancel', id: 'guess' });
    // Plus personne de connecté : on attend le chrono plutôt que de révéler un article vide.
    expect(dispatch(freshState(), { type: 'PLAYER_GONE' }, ctx([])).state.phase).toBe('guess');
  });

  it('timeout : révélation avec les mises reçues, les absents sont non classés', () => {
    const partial = bidAll(freshState(), { p1: 190, p3: 120 });
    const out = dispatch(partial.state, { type: 'TIMEOUT', timerId: 'guess' });
    expect(out.state.phase).toBe('reveal');
    expect(out.state.lastResult!.results.map((r) => r.playerId)).toEqual(['p1', 'p3']);
    expect(pointsOf(out.state)).toEqual({ p1: 3, p3: 2 });
  });

  it('timeout sans aucune mise : article révélé, personne ne marque', () => {
    const out = dispatch(freshState(), { type: 'TIMEOUT', timerId: 'guess' });
    expect(out.state.phase).toBe('reveal');
    expect(out.state.lastResult!.results).toEqual([]);
  });
});

// ─── Barème : classement 3/2/1 ──────────────────────────────────────────────

describe('barème au classement', () => {
  it('exemple de la fiche (prix 200 €) : 3 / 2 / 1 / 0', () => {
    const out = bidAll(freshState(), { p1: 190, p2: 260, p3: 120, p4: 500 });
    const results = out.state.lastResult!.results;
    expect(results.map((r) => [r.playerId, r.rank, r.points])).toEqual([
      ['p1', 1, 3],
      ['p2', 2, 2],
      ['p3', 3, 1],
      ['p4', 4, 0],
    ]);
    expect(results.find((r) => r.playerId === 'p3')!.delta).toBeCloseTo(-0.4);
    expect(out.state.totals).toEqual({ p1: 3, p2: 2, p3: 1, p4: 0 });
  });

  it('ex æquo : même rang, mêmes points, rang suivant sauté (« 1, 1, 3 »)', () => {
    const results = rankBids({ p1: 190, p2: 210, p3: 150, p4: 120 }, IDS, 200, false);
    expect(results.map((r) => [r.playerId, r.rank, r.points])).toEqual([
      ['p1', 1, 3],
      ['p2', 1, 3],
      ['p3', 3, 1],
      ['p4', 4, 0],
    ]);
  });

  it('ex æquo exacts même avec des centimes (pas de piège des flottants)', () => {
    const results = rankBids({ p1: 199.99, p2: 200.01 }, IDS, 200, false);
    expect(results.map((r) => r.rank)).toEqual([1, 1]);
  });

  it('quatre à égalité en tête : tous 1ers, 3 pts chacun', () => {
    const results = rankBids({ p1: 100, p2: 100, p3: 100, p4: 100 }, IDS, 200, false);
    expect(results.every((r) => r.rank === 1 && r.points === 3)).toBe(true);
  });

  it('🎯 « le juste prix » à 1 % près (bornes incluses), sans point en plus', () => {
    const results = rankBids({ p1: 198, p2: 197.99, p3: 202 }, IDS, 200, false);
    const byId = Object.fromEntries(results.map((r) => [r.playerId, r]));
    expect(byId.p1.bullseye).toBe(true);
    expect(byId.p3.bullseye).toBe(true);
    expect(byId.p2.bullseye).toBe(false);
    expect(byId.p1.points).toBe(3);
  });

  it('« sans dépasser » : une mise au-dessus du prix vaut 0 et sort du classement', () => {
    const out = bidAll(freshState({ noOverbid: true }), { p1: 190, p2: 260, p3: 120, p4: 500 });
    const results = out.state.lastResult!.results;
    expect(results.map((r) => [r.playerId, r.rank, r.points, r.overbid])).toEqual([
      ['p1', 1, 3, false],
      ['p3', 2, 2, false],
      ['p2', undefined, 0, true],
      ['p4', undefined, 0, true],
    ]);
  });

  it('« sans dépasser » : le prix exact n’est pas un dépassement', () => {
    const results = rankBids({ p1: 200 }, IDS, 200, true);
    expect(results[0]).toMatchObject({ rank: 1, points: 3, overbid: false });
  });

  it('« sans dépasser » : si tout le monde dépasse, personne ne marque', () => {
    const results = rankBids({ p1: 201, p2: 300, p3: 1000 }, IDS, 200, true);
    expect(results.every((r) => r.points === 0 && r.rank === undefined)).toBe(true);
  });
});

// ─── Enchaînement, changement d'article, fin ────────────────────────────────

describe('enchaînement des articles', () => {
  it('host:next → article suivant : mises effacées, chrono relancé ; refusé pendant l’estimation', () => {
    expectDenied(freshState(), { type: 'HOST_NEXT' });
    const revealed = bidAll(freshState(), { p1: 190, p2: 260, p3: 120, p4: 500 }).state;
    const next = dispatch(revealed, { type: 'HOST_NEXT' });
    expect(next.state.phase).toBe('guess');
    expect(next.state.itemIndex).toBe(1);
    expect(next.state.bids).toEqual({});
    expect(next.effects).toContainEqual({ type: 'timer:start', id: 'guess', seconds: 45 });
  });

  it('le cumul s’additionne d’un article à l’autre et le récap garde chaque article', () => {
    let s = bidAll(freshState(), { p1: 190, p2: 260, p3: 120, p4: 500 }).state; // 200 €
    s = dispatch(s, { type: 'HOST_NEXT' }).state;
    s = bidAll(s, { p1: 10, p2: 45, p3: 60, p4: 49 }).state; // 49,90 €
    expect(pointsOf(s)).toEqual({ p4: 3, p2: 2, p3: 1, p1: 0 });
    expect(s.totals).toEqual({ p1: 3, p2: 4, p3: 2, p4: 3 });
    expect(s.history.map((h) => h.itemNumber)).toEqual([1, 2]);
    expect(sortedTotals(s)[0]).toEqual({ playerId: 'p2', points: 4 });
  });

  it('après le dernier article : fin de partie (game:ended)', () => {
    let s = freshState();
    for (let i = 0; i < ITEMS.length; i++) {
      s = dispatch(s, { type: 'TIMEOUT', timerId: 'guess' }).state;
      const out = dispatch(s, { type: 'HOST_NEXT' });
      s = out.state;
      if (i === ITEMS.length - 1) expect(out.effects).toContainEqual({ type: 'game:ended' });
    }
    expect(s.phase).toBe('end');
    expect(s.history).toHaveLength(ITEMS.length);
  });

  it('changer d’article : remplace l’article courant, efface les mises, relance le chrono', () => {
    const partial = bidAll(freshState(), { p1: 100, p2: 150 }).state;
    expect(canChangeItem(partial).ok).toBe(true);
    const replacement = item(9, 999);
    const out = applyItemChange(partial, replacement);
    expect(out.state.items[0]).toEqual(replacement);
    expect(out.state.items[1]).toEqual(ITEMS[1]);
    expect(out.state.bids).toEqual({});
    expect(out.effects).toContainEqual({ type: 'timer:start', id: 'guess', seconds: 45 });
  });

  it('changer d’article est refusé hors estimation', () => {
    const revealed = dispatch(freshState(), { type: 'TIMEOUT', timerId: 'guess' }).state;
    expect(canChangeItem(revealed).ok).toBe(false);
  });

  it('le TIMEOUT tardif (après clôture) est sans effet', () => {
    const revealed = bidAll(freshState(), { p1: 1, p2: 2, p3: 3, p4: 4 }).state;
    const out = reduceJustePrix(revealed, { type: 'TIMEOUT', timerId: 'guess' }, ctx());
    expect(out.state).toBe(revealed);
  });
});

// ─── Récap de soirée ────────────────────────────────────────────────────────

describe('récap de soirée', () => {
  const players: Player[] = IDS.map((id, i) => ({
    id,
    name: `Joueur${i + 1}`,
    avatar: '🦊',
    connected: true,
    joinedAt: i,
  }));

  it('annonce le ou les premiers (égalité = victoire partagée)', () => {
    const s = bidAll(freshState(), { p1: 190, p2: 210, p3: 120, p4: 500 }).state;
    const result = buildJustePrixResult(s, players, 1);
    expect(result.game).toBe('justeprix');
    expect(result.summary).toBe('En tête : Joueur1 & Joueur2 (3 pts)');
    expect(result.points.map((p) => p.points)).toEqual([3, 3, 1, 0]);
  });

  it('personne n’a marqué', () => {
    const s = dispatch(freshState(), { type: 'TIMEOUT', timerId: 'guess' }).state;
    expect(buildJustePrixResult(s, players, 1).summary).toBe('Personne n’a marqué');
  });
});
