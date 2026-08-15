/**
 * Tests de NON-FUITE Codenames (PRD §6.3, obligatoires et bloquants).
 *
 * La clé (couleur de chaque carte non révélée, assassin compris) n'existe que
 * dans la vue des deux maîtres-espions. La TV, le miroir et les devineurs ne
 * voient une couleur QU'après révélation. En phase de fin, la clé est publique.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../shared';
import type { CodenamesState, Player, PlayerId, Viewer } from '../shared';
import { initCodenames, resolveCodenamesParams } from '../games/codenames/codenames.engine';
import { projectFor } from './project';
import type { GameState, ProjectionCtx, Room } from './room.types';

const IDS: PlayerId[] = ['r1', 'r2', 'b1', 'b2'];

function makePlayers(): Player[] {
  return IDS.map((id, i) => ({ id, name: `Joueur${i + 1}`, avatar: '🦊', connected: true, joinedAt: i }));
}

function makeRoom(game: GameState): Room {
  return {
    code: 'TEST',
    host: { token: 'ZZTOKENHOSTZZ', connected: true },
    players: makePlayers(),
    playerTokens: new Map(),
    mirrorConnected: false,
    status: 'inGame',
    selection: { game: 'codenames', contentMode: 'normal', paramOverrides: {} },
    game,
    sessionRecap: [],
    usedEntryIds: new Set(),
    contentRecycled: false,
    rng: mulberry32(1),
    createdAt: 0,
    lastActivityAt: 0,
  };
}

const PCTX: ProjectionCtx = {
  timers: [],
  availableModes: ['normal'],
  config: { siteName: 'Icebreakers', internalModeLabel: 'Interne' },
  timerDefaults: { discussSeconds: 60, voteSeconds: 45, whiteGuessSeconds: 30 },
};

/**
 * Partie en devinettes : Rouges r1 (maître-espion) + r2 actifs, une carte
 * bleue déjà révélée — la SEULE couleur qui a le droit de sortir publiquement.
 */
function guessingState(overrides: Partial<CodenamesState> = {}): CodenamesState {
  const words = Array.from({ length: 25 }, (_, i) => `mot${i}`);
  const { state } = initCodenames(IDS, words, resolveCodenamesParams({}), { rng: mulberry32(1) });
  const revealedIndex = state.cards.findIndex((c) => c.kind === 'blue');
  return {
    ...state,
    teams: [
      ['r1', 'r2'],
      ['b1', 'b2'],
    ],
    spymasters: ['r1', 'b1'],
    startingTeam: 0,
    activeTeam: 0,
    phase: 'guess',
    cards: state.cards.map((c, i) => (i === revealedIndex ? { ...c, revealed: true } : c)),
    clues: [
      {
        team: 0,
        spymasterId: 'r1',
        word: 'soleil',
        count: 2,
        guesses: [{ cardIndex: revealedIndex, kind: 'blue', playerId: 'r2' }],
        stopped: false,
      },
    ],
    currentClue: { spymasterId: 'r1', word: 'soleil', count: 2, guessesLeft: 2 },
    ...overrides,
  };
}

const AUDIENCES: Viewer[] = [
  { kind: 'host' },
  { kind: 'mirror' },
  { kind: 'player', playerId: 'r2' }, // devineur actif
  { kind: 'player', playerId: 'b2' }, // devineur adverse
];

describe('non-fuite Codenames', () => {
  it('en jeu : la couleur ne sort QUE pour les cartes révélées (TV, miroir, devineurs)', () => {
    const room = makeRoom(guessingState());
    for (const viewer of AUDIENCES) {
      const view = projectFor(room, viewer, PCTX);
      const game = view.room.game;
      expect(game?.kind).toBe('codenames');
      if (game?.kind !== 'codenames') continue;
      // Chaque carte : `kind` présent si et seulement si révélée.
      for (const c of game.cards) {
        if (c.revealed) expect(c.kind).toBe('blue');
        else expect(c.kind).toBeUndefined();
      }
      // Pas de clé publique hors phase de fin.
      expect(game.keyReveal).toBeUndefined();
      // Aucune fuite structurelle : une seule couleur sérialisée (la révélée),
      // et l'assassin n'apparaît nulle part.
      const text = JSON.stringify(view.room);
      expect(text.match(/"kind":"(red|blue|neutral|assassin)"/g) ?? []).toHaveLength(
        game.clues[0].guesses.length + game.cards.filter((c) => c.revealed).length,
      );
      expect(text).not.toContain('assassin"');
      expect(text).not.toContain('ZZTOKENHOSTZZ');
    }
  });

  it('les devineurs (actifs ou non) n’ont jamais la clé dans leur vue `me`', () => {
    const room = makeRoom(guessingState());
    for (const playerId of ['r2', 'b2']) {
      const view = projectFor(room, { kind: 'player', playerId }, PCTX);
      expect(view.me?.game?.codenames?.isSpymaster).toBe(false);
      expect(view.me?.game?.codenames?.key).toBeUndefined();
    }
  });

  it('les DEUX maîtres-espions ont la clé complète (même hors de leur tour)', () => {
    const room = makeRoom(guessingState());
    for (const playerId of ['r1', 'b1']) {
      const view = projectFor(room, { kind: 'player', playerId }, PCTX);
      const me = view.me?.game?.codenames;
      expect(me?.isSpymaster).toBe(true);
      expect(me?.key).toHaveLength(25);
      expect(me?.key).toContain('assassin');
    }
  });

  it('l’assassin n’est pas identifiable avant révélation : la grille publique est anonyme', () => {
    const state = guessingState();
    const room = makeRoom(state);
    const view = projectFor(room, { kind: 'host' }, PCTX);
    const game = view.room.game;
    if (game?.kind !== 'codenames') throw new Error('unreachable');
    const assassinWord = state.cards.find((c) => c.kind === 'assassin')!.word;
    const publicCard = game.cards.find((c) => c.word === assassinWord)!;
    expect(publicCard.revealed).toBe(false);
    expect(publicCard.kind).toBeUndefined();
  });

  it('en phase de fin : la clé devient publique (révélation totale sur la TV)', () => {
    const room = makeRoom(guessingState({ phase: 'end', winner: 1, endedByAssassin: true, assassinTeam: 0 }));
    const view = projectFor(room, { kind: 'host' }, PCTX);
    const game = view.room.game;
    if (game?.kind !== 'codenames') throw new Error('unreachable');
    expect(game.keyReveal).toHaveLength(25);
    expect(game.keyReveal).toContain('assassin');
  });

  it('les contrôles host restent publics : pas de clé ni de mots secrets dans hostControls', () => {
    const room = makeRoom(guessingState());
    const view = projectFor(room, { kind: 'host' }, PCTX);
    expect(JSON.stringify(view.hostControls)).not.toContain('kind');
  });
});
