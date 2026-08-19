/**
 * Tests de NON-FUITE Just One (PRD §6.3, obligatoires et bloquants).
 *
 * Sensibilités propres à la fiche 5.3 :
 * - le mot mystère est caché au devineur ET aux écrans publics (la TV est
 *   regardée par le devineur !) jusqu'à la résolution ;
 * - les indices sont cachés de TOUS pendant l'écriture (même entre donneurs),
 *   restreints aux donneurs ensuite, et jamais sur la TV avant le récap final ;
 * - un indice annulé est masqué au devineur, pas révélé.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../shared';
import type { JustOneAction, JustOneState, Player, PlayerId, Viewer } from '../shared';
import {
  guardJustOne,
  initJustOne,
  reduceJustOne,
  resolveJustOneParams,
} from '../games/justone/justone.engine';
import { projectFor } from './project';
import type { ProjectionCtx, Room } from './room.types';

const WORD = 'ZZWORDZZ';
const CLUES: Record<string, string> = {
  p2: 'ZZCLUEDEUXZZ',
  p3: 'ZZCLUETROISZZ',
  p4: 'ZZCLUEQUATREZZ',
  p5: 'ZZCLUECINQZZ', // sera annulé à la main dans les fixtures dédiées
};

const IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5'];

function makePlayers(): Player[] {
  return IDS.map((id, i) => ({ id, name: `Joueur${i + 1}`, avatar: '🦊', connected: true, joinedAt: i }));
}

function makeRoom(game: JustOneState, status: Room['status'] = 'inGame'): Room {
  return {
    code: 'TEST',
    host: { token: 'ZZTOKENHOSTZZ', connected: true },
    players: makePlayers(),
    playerTokens: new Map(),
    mirrorConnected: false,
    status,
    selection: { game: 'justone', paramOverrides: {} },
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
  availablePacks: [{ id: 'test-pack', name: 'Pack de test', mode: 'normal', entriesCount: 10 }],
  selectedPackIds: ['test-pack'],
  config: { siteName: 'Icebreakers', internalModeLabel: 'Interne' },
  timerDefaults: { discussSeconds: 60, voteSeconds: 45, whiteGuessSeconds: 30 },
};

function dispatch(state: JustOneState, action: JustOneAction): JustOneState {
  const ctx = { rng: mulberry32(1) };
  const g = guardJustOne(state, action, ctx);
  if (!g.ok) throw new Error(`action illégale en fixture : ${JSON.stringify(g)}`);
  return reduceJustOne(state, action, ctx).state;
}

// ─── Fixtures par phase (via le vrai moteur) ────────────────────────────────

function atWrite(): JustOneState {
  let s = initJustOne(IDS, WORD, resolveJustOneParams({})).state;
  s = dispatch(s, { type: 'SUBMIT_CLUE', playerId: 'p2', text: CLUES.p2 });
  s = dispatch(s, { type: 'SUBMIT_CLUE', playerId: 'p3', text: CLUES.p3 });
  return s; // p4, p5 n'ont pas encore écrit
}

function atValidate(): JustOneState {
  let s = atWrite();
  s = dispatch(s, { type: 'SUBMIT_CLUE', playerId: 'p4', text: CLUES.p4 });
  s = dispatch(s, { type: 'SUBMIT_CLUE', playerId: 'p5', text: CLUES.p5 });
  // p3 annule l'indice de p5 à la main (synonyme flagrant, disons)
  return dispatch(s, { type: 'FLAG_CLUE', playerId: 'p3', giverId: 'p5', cancelled: true });
}

function atGuess(): JustOneState {
  return dispatch(atValidate(), { type: 'FORCE_CLOSE', playerId: 'p2' });
}

function atArbitrate(): JustOneState {
  // proposition proche du mot (1 faute) → l'arbitre doit trancher
  return dispatch(atGuess(), { type: 'SUBMIT_GUESS', playerId: 'p1', guess: 'ZZWORDZY' });
}

function atResolve(): JustOneState {
  return dispatch(atArbitrate(), { type: 'ARBITRATE', playerId: 'p2', decision: 'accept' });
}

function atEnd(): JustOneState {
  const resolved = atResolve();
  return dispatch({ ...resolved, mancheIndex: resolved.params.manchesCount }, { type: 'HOST_NEXT' });
}

const PHASES: Array<[string, () => JustOneState]> = [
  ['write', atWrite],
  ['validate', atValidate],
  ['guess', atGuess],
  ['arbitrate', atArbitrate],
  ['resolve', atResolve],
  ['end', atEnd],
];

function serialize(view: unknown): string {
  return JSON.stringify(view);
}

// ─── TV (host) et miroir : le devineur les regarde ──────────────────────────

describe('non-fuite Just One — host et miroir (la TV est sous les yeux du devineur)', () => {
  for (const [label, make] of PHASES) {
    it(`phase ${label}`, () => {
      const state = make();
      const room = makeRoom(state, label === 'end' ? 'recap' : 'inGame');
      for (const viewer of [{ kind: 'host' }, { kind: 'mirror' }] as Viewer[]) {
        const text = serialize(projectFor(room, viewer, PCTX));
        // le mot : jamais avant la résolution de la manche
        if (label !== 'resolve' && label !== 'end') {
          expect(text, `${viewer.kind}/${label} : mot fuité`).not.toContain(WORD);
        }
        // les indices : jamais sur l'écran projeté avant le récap final
        if (label !== 'end') {
          for (const clue of Object.values(CLUES)) {
            expect(text, `${viewer.kind}/${label} : indice fuité`).not.toContain(clue);
          }
        }
        expect(text).not.toContain('ZZTOKENHOSTZZ');
      }
    });
  }

  it('à la résolution, la TV révèle le mot et la proposition — pas les indices', () => {
    const view = projectFor(makeRoom(atResolve()), { kind: 'host' }, PCTX);
    expect(view.room.game?.kind).toBe('justone');
    if (view.room.game?.kind !== 'justone') return;
    expect(view.room.game.revealedWord).toBe(WORD);
    expect(view.room.game.guess).toBe('ZZWORDZY');
    const text = serialize(view);
    for (const clue of Object.values(CLUES)) expect(text).not.toContain(clue);
  });

  it('au récap final, mots et indices (y compris annulés) deviennent publics', () => {
    const view = projectFor(makeRoom(atEnd(), 'recap'), { kind: 'mirror' }, PCTX);
    if (view.room.game?.kind !== 'justone') throw new Error('vue justone attendue');
    const text = serialize(view.room.game.history);
    expect(text).toContain(WORD);
    expect(text).toContain(CLUES.p2);
    expect(text).toContain(CLUES.p5); // l'annulé est révélé au récap — le moment le plus drôle
  });
});

// ─── Devineur : ni le mot, ni les indices annulés ───────────────────────────

describe('non-fuite Just One — devineur', () => {
  it('ne voit jamais le mot avant la résolution, ni aucun indice avant la devinette', () => {
    for (const [label, make] of PHASES) {
      const state = make();
      const room = makeRoom(state, label === 'end' ? 'recap' : 'inGame');
      const text = serialize(projectFor(room, { kind: 'player', playerId: 'p1' }, PCTX));
      if (label !== 'resolve' && label !== 'end') {
        expect(text, `devineur/${label} : mot fuité`).not.toContain(WORD);
      }
      if (label === 'write' || label === 'validate') {
        for (const clue of Object.values(CLUES)) {
          expect(text, `devineur/${label} : indice fuité pendant ${label}`).not.toContain(clue);
        }
      }
    }
  });

  it('en devinette : les indices restants oui, les annulés masqués (jamais leur texte)', () => {
    const view = projectFor(makeRoom(atGuess()), { kind: 'player', playerId: 'p1' }, PCTX);
    const me = view.me?.game?.justone;
    expect(me?.canGuess).toBe(true);
    expect(me?.remainingCluesForGuesser?.map((c) => c.text)).toEqual(
      expect.arrayContaining([CLUES.p2, CLUES.p3, CLUES.p4]),
    );
    expect(me?.maskedCluesCount).toBe(1);
    const text = serialize(view);
    expect(text, 'l’indice annulé de p5 doit rester masqué').not.toContain(CLUES.p5);
  });

  it('le devineur ne reçoit pas la liste de validation des donneurs', () => {
    const view = projectFor(makeRoom(atValidate()), { kind: 'player', playerId: 'p1' }, PCTX);
    expect(view.me?.game?.justone?.clues).toBeUndefined();
    expect(view.me?.game?.justone?.canReady).toBe(false);
  });
});

// ─── Donneurs : leurs indices restent secrets entre eux pendant l'écriture ──

describe('non-fuite Just One — donneurs', () => {
  it('pendant l’écriture, un donneur ne voit que SON indice', () => {
    const state = atWrite(); // p2 et p3 ont écrit
    const room = makeRoom(state);
    const p2view = projectFor(room, { kind: 'player', playerId: 'p2' }, PCTX);
    expect(p2view.me?.game?.justone?.myClue).toBe(CLUES.p2);
    const p2text = serialize(p2view);
    expect(p2text).not.toContain(CLUES.p3);

    // p4 n'a rien écrit : il voit le mot, aucun indice des autres
    const p4text = serialize(projectFor(room, { kind: 'player', playerId: 'p4' }, PCTX));
    expect(p4text).toContain(WORD); // 🔒 le mot mystère, c'est son droit
    expect(p4text).not.toContain(CLUES.p2);
    expect(p4text).not.toContain(CLUES.p3);
  });

  it('en validation, les donneurs voient la liste complète (👥 restreint) avec les statuts', () => {
    const view = projectFor(makeRoom(atValidate()), { kind: 'player', playerId: 'p3' }, PCTX);
    const me = view.me?.game?.justone;
    expect(me?.clues?.map((c) => c.text)).toEqual(
      expect.arrayContaining([CLUES.p2, CLUES.p3, CLUES.p4, CLUES.p5]),
    );
    expect(me?.clues?.find((c) => c.giverId === 'p5')?.cancelledManual).toBe(true);
  });

  it('l’arbitre effectif reçoit ses capacités (forcer la clôture, trancher)', () => {
    const validate = projectFor(makeRoom(atValidate()), { kind: 'player', playerId: 'p2' }, PCTX);
    expect(validate.me?.game?.justone?.isArbiter).toBe(true);
    expect(validate.me?.game?.justone?.canForceClose).toBe(true);

    const arbitrate = projectFor(makeRoom(atArbitrate()), { kind: 'player', playerId: 'p2' }, PCTX);
    expect(arbitrate.me?.game?.justone?.canArbitrate).toBe(true);
    // l'arbitre voit la proposition (publique de toute façon)
    if (arbitrate.room.game?.kind === 'justone') {
      expect(arbitrate.room.game.guess).toBe('ZZWORDZY');
    }
  });

  it('un spectateur hors partie ne reçoit ni mot ni indices', () => {
    const state = atGuess();
    const room = makeRoom(state);
    room.players.push({ id: 'p9', name: 'Tardif', avatar: '🐢', connected: true, joinedAt: 99 });
    const text = serialize(projectFor(room, { kind: 'player', playerId: 'p9' }, PCTX));
    expect(text).not.toContain(WORD);
    for (const clue of Object.values(CLUES)) expect(text).not.toContain(clue);
  });
});
