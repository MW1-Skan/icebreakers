/**
 * Tests de NON-FUITE Spyfall + Taboo (PRD §6.3, obligatoires et bloquants).
 *
 * Spyfall : la carte est cachée à l'espion — donc à la TV (qu'il regarde) — et
 * l'identité de l'espion ne sort qu'à sa révélation ou à l'issue.
 * Taboo : la carte en cours est cachée au devineur et à la TV ; le deck
 * (cartes à venir) ne sort jamais ; la carte buzzée devient publique.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../shared';
import type { Player, PlayerId, SpyfallState, TabooState, Viewer } from '../shared';
import { initSpyfall, resolveSpyfallParams } from '../games/spyfall/spyfall.engine';
import { initTaboo, resolveTabooParams } from '../games/taboo/taboo.engine';
import { projectFor } from './project';
import type { GameState, ProjectionCtx, Room } from './room.types';

const IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];

function makePlayers(): Player[] {
  return IDS.map((id, i) => ({ id, name: `Joueur${i + 1}`, avatar: '🦊', connected: true, joinedAt: i }));
}

function makeRoom(game: GameState, selectionGame: 'spyfall' | 'taboo', status: Room['status'] = 'inGame'): Room {
  return {
    code: 'TEST',
    host: { token: 'ZZTOKENHOSTZZ', connected: true },
    players: makePlayers(),
    playerTokens: new Map(),
    mirrorConnected: false,
    status,
    selection: { game: selectionGame, contentMode: 'normal', paramOverrides: {} },
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

function serialize(view: unknown): string {
  return JSON.stringify(view);
}

// ─── Spyfall ────────────────────────────────────────────────────────────────

const GRID = ['ZZCARTEUNZZ', 'ZZCARTEDEUXZZ', 'ZZCARTETROISZZ', 'ZZCARTEQUATREZZ', 'c5', 'c6', 'c7', 'c8'];

/** Espion p4, carte ZZCARTEUNZZ, en interrogatoire. */
function spyfallState(overrides: Partial<SpyfallState> = {}): SpyfallState {
  const { state } = initSpyfall(IDS, { category: 'Lieux', grid: GRID }, resolveSpyfallParams({}), {
    rng: mulberry32(1),
  });
  return { ...state, phase: 'interrogate', spyId: 'p4', card: 'ZZCARTEUNZZ', ...overrides };
}

describe('non-fuite Spyfall', () => {
  it('la carte n’atteint jamais l’espion, la TV ni le miroir avant la résolution', () => {
    const room = makeRoom(spyfallState(), 'spyfall');
    for (const viewer of [{ kind: 'host' }, { kind: 'mirror' }, { kind: 'player', playerId: 'p4' }] as Viewer[]) {
      const view = projectFor(room, viewer, PCTX);
      const text = serialize(view);
      // la carte précise est secrète… mais elle figure dans la grille publique !
      // On vérifie donc le CHAMP, pas la sous-chaîne.
      if (viewer.kind === 'player') {
        expect(view.me?.game?.spyfall?.card).toBeUndefined();
        expect(view.me?.game?.spyfall?.isSpy).toBe(true);
      } else {
        expect(text).not.toContain('"card"');
      }
      expect(text).not.toContain('ZZTOKENHOSTZZ');
    }
  });

  it('un civil voit la carte ; l’identité de l’espion reste introuvable pour tous', () => {
    const room = makeRoom(spyfallState(), 'spyfall');
    const civil = projectFor(room, { kind: 'player', playerId: 'p2' }, PCTX);
    expect(civil.me?.game?.spyfall?.card).toBe('ZZCARTEUNZZ');
    expect(civil.me?.game?.spyfall?.isSpy).toBeUndefined();

    for (const viewer of [{ kind: 'host' }, { kind: 'player', playerId: 'p2' }] as Viewer[]) {
      const view = projectFor(room, viewer, PCTX);
      const text = serialize(view);
      expect(text, 'spyId ne doit pas sortir avant révélation').not.toContain('spyId');
      expect(text).not.toContain('revealedSpyId":"p4"');
    }
  });

  it('pendant un vote d’accusation : qui accuse qui est public, le détail des votes non', () => {
    const state = spyfallState({
      phase: 'accusationVote',
      accusationsUsed: ['p1'],
      accusation: { accuserId: 'p1', accusedId: 'p4', votes: { p2: true, p3: false } },
    });
    const view = projectFor(makeRoom(state, 'spyfall'), { kind: 'host' }, PCTX);
    if (view.room.game?.kind !== 'spyfall') throw new Error('vue spyfall attendue');
    expect(view.room.game.accusation).toMatchObject({ accuserId: 'p1', accusedId: 'p4', votesCast: 2 });
    const text = serialize(view);
    expect(text).not.toContain('"votes"');
    // le vote Oui/Non individuel ne sort que vers son auteur
    const p2 = projectFor(makeRoom(state, 'spyfall'), { kind: 'player', playerId: 'p2' }, PCTX);
    expect(p2.me?.game?.spyfall?.myAccusationVote).toBe(true);
    const p3text = serialize(projectFor(makeRoom(state, 'spyfall'), { kind: 'player', playerId: 'p3' }, PCTX));
    expect(p3text).not.toContain('"p2":true');
  });

  it('l’espion révélé (coup tenté) et l’issue sont publics ; l’espion voit alors la carte', () => {
    const guessing = projectFor(makeRoom(spyfallState({ phase: 'spyGuess' }), 'spyfall'), { kind: 'mirror' }, PCTX);
    if (guessing.room.game?.kind !== 'spyfall') throw new Error('vue spyfall attendue');
    expect(guessing.room.game.revealedSpyId).toBe('p4');

    const revealed = spyfallState({
      phase: 'reveal',
      lastOutcome: { winner: 'team', reason: 'spyGuessWrong', spyId: 'p4', card: 'ZZCARTEUNZZ' },
    });
    const view = projectFor(makeRoom(revealed, 'spyfall'), { kind: 'host' }, PCTX);
    if (view.room.game?.kind !== 'spyfall') throw new Error('vue spyfall attendue');
    expect(view.room.game.lastOutcome?.spyId).toBe('p4');
    const spyView = projectFor(makeRoom(revealed, 'spyfall'), { kind: 'player', playerId: 'p4' }, PCTX);
    expect(spyView.me?.game?.spyfall?.card).toBe('ZZCARTEUNZZ');
  });
});

// ─── Taboo ──────────────────────────────────────────────────────────────────

/** Binômes [p1,p2] / [p3,p4], passage 1 : orateur p1, devineur p2 — en live. */
function tabooState(overrides: Partial<TabooState> = {}): TabooState {
  const cards = [
    { word: 'ZZMOTCOURANTZZ', forbidden: ['ZZINTERDITAZZ', 'ZZINTERDITBZZ', 'ZZINTERDITCZZ'] },
    { word: 'ZZMOTSUIVANTZZ', forbidden: ['x1', 'x2', 'x3'] },
    { word: 'ZZMOTTROISZZ', forbidden: ['y1', 'y2', 'y3'] },
  ];
  const { state } = initTaboo(IDS, cards, resolveTabooParams({ teams: [['p1', 'p2'], ['p3', 'p4']] }), {
    rng: mulberry32(1),
  });
  // on force l'ordre du deck pour des sentinelles stables
  return { ...state, phase: 'live', deck: cards, cardSeq: 1, ...overrides };
}

describe('non-fuite Taboo', () => {
  it('la carte en cours : orateur et arbitres OUI, devineur/TV/miroir JAMAIS', () => {
    const room = makeRoom(tabooState(), 'taboo');

    const orator = projectFor(room, { kind: 'player', playerId: 'p1' }, PCTX);
    expect(orator.me?.game?.taboo?.currentCard?.word).toBe('ZZMOTCOURANTZZ');
    const arbiter = projectFor(room, { kind: 'player', playerId: 'p3' }, PCTX);
    expect(arbiter.me?.game?.taboo?.currentCard?.forbidden).toContain('ZZINTERDITAZZ');
    expect(arbiter.me?.game?.taboo?.canBuzz).toBe(true);

    for (const viewer of [{ kind: 'host' }, { kind: 'mirror' }, { kind: 'player', playerId: 'p2' }] as Viewer[]) {
      const text = serialize(projectFor(room, viewer, PCTX));
      expect(text, `${JSON.stringify(viewer)} : carte courante fuitée`).not.toContain('ZZMOTCOURANTZZ');
      expect(text).not.toContain('ZZINTERDITAZZ');
    }
  });

  it('le deck (cartes à venir) ne sort jamais, pour personne', () => {
    const room = makeRoom(tabooState(), 'taboo');
    for (const viewer of [{ kind: 'host' }, ...IDS.map((id): Viewer => ({ kind: 'player', playerId: id }))] as Viewer[]) {
      const text = serialize(projectFor(room, viewer, PCTX));
      expect(text, `${JSON.stringify(viewer)} : deck fuité`).not.toContain('ZZMOTSUIVANTZZ');
      expect(text).not.toContain('ZZMOTTROISZZ');
    }
  });

  it('une carte buzzée est défaussée et devient publique (affichée 3 s, annulable)', () => {
    const state = tabooState({
      lastBuzz: { card: { word: 'ZZMOTBUZZEZZ', forbidden: ['z1', 'z2', 'z3'] }, cardSeq: 1 },
    });
    const view = projectFor(makeRoom(state, 'taboo'), { kind: 'host' }, PCTX);
    if (view.room.game?.kind !== 'taboo') throw new Error('vue taboo attendue');
    expect(view.room.game.lastBuzz?.card.word).toBe('ZZMOTBUZZEZZ');
    // le devineur aussi peut la voir : elle est hors jeu
    const guesser = serialize(projectFor(makeRoom(state, 'taboo'), { kind: 'player', playerId: 'p2' }, PCTX));
    expect(guesser).toContain('ZZMOTBUZZEZZ');
  });

  it('au récap, les cartes du passage deviennent publiques — le devineur découvre', () => {
    const base = tabooState();
    const state: TabooState = {
      ...base,
      phase: 'recap',
      current: {
        ...base.current!,
        played: [
          { card: { word: 'ZZMOTCOURANTZZ', forbidden: ['ZZINTERDITAZZ', 'b', 'c'] }, outcome: 'found' },
        ],
        score: 1,
      },
    };
    const guesser = serialize(projectFor(makeRoom(state, 'taboo'), { kind: 'player', playerId: 'p2' }, PCTX));
    expect(guesser).toContain('ZZMOTCOURANTZZ');
  });
});
