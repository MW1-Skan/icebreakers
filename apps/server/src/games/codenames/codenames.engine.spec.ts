/**
 * Tests du réducteur Codenames — la fiche validée en session est la loi :
 * validation d'indice, budget de touches (nombre + 1), fin de tour sur
 * neutre/adverse, défaite immédiate sur l'assassin, rotation des maîtres-
 * espions entre manches, barème 3 / 1 / 0-si-assassin.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../shared';
import type {
  CodenamesCard,
  CodenamesCardKind,
  CodenamesParams,
  CodenamesState,
  PlayerId,
} from '../../shared';
import type { EngineCtx } from '../engine';
import {
  buildCodenamesResult,
  codenamesCumulative,
  codenamesManchePoints,
  codenamesRemaining,
  composeCodenamesTeams,
  guardCodenames,
  initCodenames,
  reduceCodenames,
  resolveCodenamesParams,
  startNextCodenamesManche,
  validateCodenamesSetup,
} from './codenames.engine';

const IDS: PlayerId[] = ['r1', 'r2', 'b1', 'b2'];

function params(overrides: Partial<CodenamesParams> = {}): CodenamesParams {
  return resolveCodenamesParams(overrides);
}

function ctx(seed = 1): EngineCtx {
  return { rng: mulberry32(seed), connectedIds: [...IDS] };
}

function words(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `mot${i}`);
}

function card(word: string, kind: CodenamesCardKind, revealed = false): CodenamesCard {
  return { word, kind, revealed };
}

/**
 * État forgé, lisible : Rouges r1 (maître-espion) + r2, Bleus b1 (m-e) + b2 ;
 * grille minimale 2 rouges / 2 bleus / 1 neutre / 1 assassin, Rouges actifs.
 */
function rigged(overrides: Partial<CodenamesState> = {}): CodenamesState {
  const { state } = initCodenames(IDS, words(25), params(), ctx());
  return {
    ...state,
    teams: [
      ['r1', 'r2'],
      ['b1', 'b2'],
    ],
    spymasters: ['r1', 'b1'],
    startingTeam: 0,
    activeTeam: 0,
    cards: [
      card('rouge-a', 'red'),
      card('rouge-b', 'red'),
      card('bleu-a', 'blue'),
      card('bleu-b', 'blue'),
      card('neutre', 'neutral'),
      card('boom', 'assassin'),
    ],
    ...overrides,
  };
}

/** État forgé en phase devinettes, indice « soleil — 1 » (2 touches). */
function guessing(overrides: Partial<CodenamesState> = {}): CodenamesState {
  return rigged({
    phase: 'guess',
    clues: [{ team: 0, spymasterId: 'r1', word: 'soleil', count: 1, guesses: [], stopped: false }],
    currentClue: { spymasterId: 'r1', word: 'soleil', count: 1, guessesLeft: 2 },
    ...overrides,
  });
}

describe('paramètres et setup', () => {
  it('résout les défauts validés : grille 25, 1 manche, chronos 90/120', () => {
    expect(params()).toMatchObject({ gridSize: 25, manchesCount: 1, clueSeconds: 90, guessSeconds: 120 });
  });

  it('refuse moins de 4 ou plus de 10 joueurs', () => {
    expect(validateCodenamesSetup(3).ok).toBe(false);
    expect(validateCodenamesSetup(11).ok).toBe(false);
    expect(validateCodenamesSetup(4).ok).toBe(true);
    expect(validateCodenamesSetup(10).ok).toBe(true);
  });
});

describe('équipes et maîtres-espions', () => {
  it('répartit aléatoirement en deux camps équilibrés (écart ≤ 1)', () => {
    const five = ['a', 'b', 'c', 'd', 'e'];
    const { teams } = composeCodenamesTeams(five, undefined, undefined, mulberry32(7));
    expect(teams[0].length + teams[1].length).toBe(5);
    expect(Math.abs(teams[0].length - teams[1].length)).toBe(1);
    expect(new Set([...teams[0], ...teams[1]]).size).toBe(5);
  });

  it('respecte les équipes et maîtres-espions imposés valides', () => {
    const { teams, spymasters } = composeCodenamesTeams(
      IDS,
      [
        ['r1', 'r2'],
        ['b1', 'b2'],
      ],
      ['r2', 'b2'],
      mulberry32(1),
    );
    expect(teams).toEqual([
      ['r1', 'r2'],
      ['b1', 'b2'],
    ]);
    expect(spymasters).toEqual(['r2', 'b2']);
  });

  it('ignore une composition invalide (camp de 1) → répartition aléatoire', () => {
    const { teams } = composeCodenamesTeams(IDS, [['r1'], ['r2', 'b1', 'b2']], undefined, mulberry32(1));
    expect(teams[0].length).toBe(2);
    expect(teams[1].length).toBe(2);
  });

  it('ignore un maître-espion hors de son équipe → tirage dans l’équipe', () => {
    const { spymasters, teams } = composeCodenamesTeams(
      IDS,
      [
        ['r1', 'r2'],
        ['b1', 'b2'],
      ],
      ['b1', 'b1'],
      mulberry32(1),
    );
    expect(teams[0].includes(spymasters[0])).toBe(true);
    expect(teams[1].includes(spymasters[1])).toBe(true);
  });
});

describe('initialisation', () => {
  it('grille 25 : 9 mots pour le camp qui commence, 8, 7 neutres, 1 assassin', () => {
    const { state } = initCodenames(IDS, words(25), params(), ctx());
    const startKind = state.startingTeam === 0 ? 'red' : 'blue';
    const counts = state.cards.reduce<Record<string, number>>((acc, c) => {
      acc[c.kind] = (acc[c.kind] ?? 0) + 1;
      return acc;
    }, {});
    expect(state.cards).toHaveLength(25);
    expect(counts[startKind]).toBe(9);
    expect(counts[startKind === 'red' ? 'blue' : 'red']).toBe(8);
    expect(counts['neutral']).toBe(7);
    expect(counts['assassin']).toBe(1);
    expect(state.phase).toBe('brief');
    expect(state.activeTeam).toBe(state.startingTeam);
  });

  it('grille 16 : répartition 6/5/4/1', () => {
    const { state } = initCodenames(IDS, words(16), params({ gridSize: 16 }), ctx());
    expect(state.cards).toHaveLength(16);
    expect(state.cards.filter((c) => c.kind === 'assassin')).toHaveLength(1);
    expect(state.cards.filter((c) => c.kind === 'neutral')).toHaveLength(4);
  });
});

describe('brief : clé et lancement', () => {
  it('seuls les maîtres-espions consultent la clé ; les ✓ s’accumulent', () => {
    const state = rigged();
    expect(guardCodenames(state, { type: 'SEEN_KEY', playerId: 'r2' }, ctx()).ok).toBe(false);
    expect(guardCodenames(state, { type: 'SEEN_KEY', playerId: 'r1' }, ctx()).ok).toBe(true);
    const { state: s2 } = reduceCodenames(state, { type: 'SEEN_KEY', playerId: 'r1' }, ctx());
    expect(s2.seenKeyIds).toEqual(['r1']);
  });

  it('HOST_NEXT lance la phase indice avec le chrono', () => {
    const { state, effects } = reduceCodenames(rigged(), { type: 'HOST_NEXT' }, ctx());
    expect(state.phase).toBe('clue');
    expect(effects).toContainEqual({ type: 'timer:start', id: 'clue', seconds: 90 });
  });

  it('chrono indice désactivé (0) → aucun timer démarré', () => {
    const base = rigged({ params: params({ clueSeconds: 0 }) });
    const { effects } = reduceCodenames(base, { type: 'HOST_NEXT' }, ctx());
    expect(effects.some((e) => e.type === 'timer:start')).toBe(false);
  });
});

describe('indice : validation automatique', () => {
  const clueState = rigged({ phase: 'clue' });

  it('seul le maître-espion de l’équipe active donne l’indice', () => {
    expect(guardCodenames(clueState, { type: 'GIVE_CLUE', playerId: 'b1', word: 'x', count: 1 }, ctx()).ok).toBe(false);
    expect(guardCodenames(clueState, { type: 'GIVE_CLUE', playerId: 'r2', word: 'x', count: 1 }, ctx()).ok).toBe(false);
  });

  it('rejette un indice de plusieurs mots', () => {
    const guard = guardCodenames(clueState, { type: 'GIVE_CLUE', playerId: 'r1', word: 'deux mots', count: 1 }, ctx());
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.message).toContain('UN seul mot');
  });

  it('rejette un mot de la grille non révélé (normalisé), accepte un mot révélé', () => {
    const withRevealed = rigged({
      phase: 'clue',
      cards: [card('Rouge-A', 'red'), card('bleu-a', 'blue', true), card('boom', 'assassin')],
    });
    expect(
      guardCodenames(withRevealed, { type: 'GIVE_CLUE', playerId: 'r1', word: 'ROUGE-À', count: 1 }, ctx()).ok,
    ).toBe(false);
    expect(
      guardCodenames(withRevealed, { type: 'GIVE_CLUE', playerId: 'r1', word: 'bleu-a', count: 1 }, ctx()).ok,
    ).toBe(true);
  });

  it('un indice valide ouvre les devinettes avec nombre + 1 touches', () => {
    const { state, effects } = reduceCodenames(
      clueState,
      { type: 'GIVE_CLUE', playerId: 'r1', word: 'soleil', count: 2 },
      ctx(),
    );
    expect(state.phase).toBe('guess');
    expect(state.currentClue).toMatchObject({ word: 'soleil', count: 2, guessesLeft: 3 });
    expect(state.clues).toHaveLength(1);
    expect(effects).toContainEqual({ type: 'timer:start', id: 'guess', seconds: 120 });
  });
});

describe('devinettes : touches et fins de tour', () => {
  it('seuls les devineurs de l’équipe active touchent (jamais les maîtres-espions)', () => {
    const state = guessing();
    expect(guardCodenames(state, { type: 'REVEAL', playerId: 'r1', cardIndex: 0 }, ctx()).ok).toBe(false);
    expect(guardCodenames(state, { type: 'REVEAL', playerId: 'b2', cardIndex: 0 }, ctx()).ok).toBe(false);
    expect(guardCodenames(state, { type: 'REVEAL', playerId: 'r2', cardIndex: 0 }, ctx()).ok).toBe(true);
  });

  it('une carte déjà révélée est refusée (sérialisation des touches)', () => {
    const state = guessing({ cards: [card('rouge-a', 'red', true), card('boom', 'assassin')] });
    expect(guardCodenames(state, { type: 'REVEAL', playerId: 'r2', cardIndex: 0 }, ctx()).ok).toBe(false);
  });

  it('sa couleur → la carte se révèle et l’équipe continue', () => {
    const { state } = reduceCodenames(guessing(), { type: 'REVEAL', playerId: 'r2', cardIndex: 0 }, ctx());
    expect(state.cards[0].revealed).toBe(true);
    expect(state.phase).toBe('guess');
    expect(state.currentClue?.guessesLeft).toBe(1);
    expect(state.clues[0].guesses).toHaveLength(1);
  });

  it('budget épuisé après une bonne touche → fin de tour', () => {
    const start = guessing({ currentClue: { spymasterId: 'r1', word: 'soleil', count: 1, guessesLeft: 1 } });
    const { state } = reduceCodenames(start, { type: 'REVEAL', playerId: 'r2', cardIndex: 0 }, ctx());
    expect(state.phase).toBe('clue');
    expect(state.activeTeam).toBe(1);
  });

  it('neutre → fin de tour immédiate', () => {
    const { state } = reduceCodenames(guessing(), { type: 'REVEAL', playerId: 'r2', cardIndex: 4 }, ctx());
    expect(state.cards[4].revealed).toBe(true);
    expect(state.phase).toBe('clue');
    expect(state.activeTeam).toBe(1);
  });

  it('carte adverse → elle compte pour l’adversaire et le tour s’arrête', () => {
    const { state } = reduceCodenames(guessing(), { type: 'REVEAL', playerId: 'r2', cardIndex: 2 }, ctx());
    expect(state.cards[2].revealed).toBe(true);
    expect(state.phase).toBe('clue');
    expect(state.activeTeam).toBe(1);
    expect(codenamesRemaining(state)).toEqual([2, 1]);
  });

  it('carte adverse qui complète leur série → victoire adverse immédiate', () => {
    const gift = guessing({
      cards: [card('rouge-a', 'red'), card('bleu-a', 'blue'), card('bleu-b', 'blue', true), card('boom', 'assassin')],
    });
    const { state, effects } = reduceCodenames(gift, { type: 'REVEAL', playerId: 'r2', cardIndex: 1 }, ctx());
    expect(state.phase).toBe('end');
    expect(state.winner).toBe(1);
    expect(state.endedByAssassin).toBe(false);
    expect(effects).toContainEqual(expect.objectContaining({ type: 'game:ended' }));
  });

  it('dernier mot de sa couleur → victoire', () => {
    const closing = guessing({
      cards: [card('rouge-a', 'red'), card('rouge-b', 'red', true), card('bleu-a', 'blue'), card('boom', 'assassin')],
    });
    const { state } = reduceCodenames(closing, { type: 'REVEAL', playerId: 'r2', cardIndex: 0 }, ctx());
    expect(state.phase).toBe('end');
    expect(state.winner).toBe(0);
  });

  it('assassin ☠️ → défaite immédiate de l’équipe active', () => {
    const { state, effects } = reduceCodenames(guessing(), { type: 'REVEAL', playerId: 'r2', cardIndex: 5 }, ctx());
    expect(state.phase).toBe('end');
    expect(state.winner).toBe(1);
    expect(state.endedByAssassin).toBe(true);
    expect(state.assassinTeam).toBe(0);
    expect(effects).toContainEqual(expect.objectContaining({ name: 'assassin' }));
  });
});

describe('s’arrêter, invalider, chronos', () => {
  it('« On s’arrête là » exige au moins une touche, puis passe la main', () => {
    expect(guardCodenames(guessing(), { type: 'STOP_GUESSING', playerId: 'r2' }, ctx()).ok).toBe(false);
    const after = guessing({ currentClue: { spymasterId: 'r1', word: 'soleil', count: 1, guessesLeft: 1 } });
    expect(guardCodenames(after, { type: 'STOP_GUESSING', playerId: 'r2' }, ctx()).ok).toBe(true);
    const { state } = reduceCodenames(after, { type: 'STOP_GUESSING', playerId: 'r2' }, ctx());
    expect(state.phase).toBe('clue');
    expect(state.activeTeam).toBe(1);
    expect(state.clues[0].stopped).toBe(true);
  });

  it('invalidation possible avant la première touche seulement, l’indice est retiré', () => {
    const fresh = guessing();
    expect(guardCodenames(fresh, { type: 'HOST_INVALIDATE_CLUE' }, ctx()).ok).toBe(true);
    const { state } = reduceCodenames(fresh, { type: 'HOST_INVALIDATE_CLUE' }, ctx());
    expect(state.phase).toBe('clue');
    expect(state.activeTeam).toBe(0);
    expect(state.clues).toHaveLength(0);

    const touched = guessing({ currentClue: { spymasterId: 'r1', word: 'soleil', count: 1, guessesLeft: 1 } });
    expect(guardCodenames(touched, { type: 'HOST_INVALIDATE_CLUE' }, ctx()).ok).toBe(false);
  });

  it('timeout indice → le tour passe sans indice', () => {
    const { state } = reduceCodenames(rigged({ phase: 'clue' }), { type: 'TIMEOUT', timerId: 'clue' }, ctx());
    expect(state.phase).toBe('clue');
    expect(state.activeTeam).toBe(1);
  });

  it('timeout devinettes → fin de tour', () => {
    const { state } = reduceCodenames(guessing(), { type: 'TIMEOUT', timerId: 'guess' }, ctx());
    expect(state.phase).toBe('clue');
    expect(state.activeTeam).toBe(1);
  });
});

describe('déconnexions et transfert', () => {
  it('gel : chrono en pause, actions refusées, dégel au retour', () => {
    const { state: frozen } = reduceCodenames(guessing(), { type: 'PLAYER_GONE' }, ctx());
    expect(frozen.frozen).toBe(true);
    expect(guardCodenames(frozen, { type: 'REVEAL', playerId: 'r2', cardIndex: 0 }, ctx()).ok).toBe(false);
    const { state: back } = reduceCodenames(frozen, { type: 'PLAYER_BACK' }, ctx());
    expect(back.frozen).toBe(false);
  });

  it('transfert de maître-espion : le rôle change, le gel indice se lève', () => {
    const clueFrozen = rigged({ phase: 'clue', frozen: true });
    const { state, effects } = reduceCodenames(
      clueFrozen,
      { type: 'HOST_TRANSFER_SPYMASTER', playerId: 'r2' },
      ctx(),
    );
    expect(state.spymasters[0]).toBe('r2');
    expect(state.frozen).toBe(false);
    expect(effects).toContainEqual({ type: 'timer:resume', id: 'clue' });
  });
});

describe('manches, points, récap', () => {
  const ended = (byAssassin: boolean): CodenamesState =>
    rigged({
      phase: 'end',
      winner: 1,
      endedByAssassin: byAssassin,
      assassinTeam: byAssassin ? 0 : undefined,
      params: params({ manchesCount: 2 }),
    });

  it('barème : gagnants 3, perdants 1 — ou 0 sur défaite assassin', () => {
    const std = Object.fromEntries(codenamesManchePoints(ended(false)).map((p) => [p.playerId, p.points]));
    expect(std).toEqual({ r1: 1, r2: 1, b1: 3, b2: 3 });
    const boom = Object.fromEntries(codenamesManchePoints(ended(true)).map((p) => [p.playerId, p.points]));
    expect(boom).toEqual({ r1: 0, r2: 0, b1: 3, b2: 3 });
  });

  it('manche suivante : maîtres-espions tournants, camp de départ alterné, cumul transmis', () => {
    const next = startNextCodenamesManche(ended(false), words(25), ctx());
    expect(next).toBeDefined();
    expect(next!.state.mancheIndex).toBe(2);
    expect(next!.state.spymasters).toEqual(['r2', 'b2']);
    expect(next!.state.startingTeam).toBe(1);
    expect(next!.state.teams).toEqual(ended(false).teams);
    expect(next!.state.history).toHaveLength(1);
    expect(next!.state.carriedPoints['b1']).toBe(3);
    const cumulative = codenamesCumulative(next!.state);
    expect(cumulative[0].points).toBe(3);
  });

  it('pas de manche suivante après la dernière', () => {
    const last = rigged({ phase: 'end', winner: 0, params: params({ manchesCount: 1 }) });
    expect(startNextCodenamesManche(last, words(25), ctx())).toBeUndefined();
  });

  it('récap : score en mots, mention assassin, série multi-manches', () => {
    const players = IDS.map((id) => ({ id, name: id, avatar: '🙂', connected: true, joinedAt: 0 }));
    const solo = rigged({
      phase: 'end',
      winner: 0,
      cards: [card('a', 'red', true), card('b', 'blue'), card('boom', 'assassin')],
    });
    expect(buildCodenamesResult(solo, players, 0).summary).toBe('Les Rouges gagnent 1–0');

    const boom = ended(true);
    const boomResult = buildCodenamesResult({ ...boom, params: params({ manchesCount: 1 }) }, players, 0);
    expect(boomResult.summary).toContain('assassin');

    const serie = rigged({
      phase: 'end',
      winner: 1,
      params: params({ manchesCount: 2 }),
      history: [
        {
          winner: 0,
          byAssassin: false,
          startingTeam: 0,
          revealedWords: [9, 4],
          cluesCount: 5,
        },
      ],
    });
    expect(buildCodenamesResult(serie, players, 0).summary).toContain('Série');
  });
});
