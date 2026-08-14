/**
 * Tests de NON-FUITE (PRD §6.3, obligatoires et bloquants).
 *
 * Pour chaque phase d'Undercover et chaque audience, on sérialise la projection
 * réellement envoyée (`projectFor`) et on vérifie l'absence des valeurs
 * secrètes : mots de la paire, rôles des vivants, votes en cours, jetons.
 * L'écran de l'animateur étant PROJETÉ SUR LA TV, host et mirror sont traités
 * avec la même sévérité que n'importe quel joueur non autorisé.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../shared';
import type { Player, PlayerId, UndercoverAction, UndercoverState, Viewer } from '../shared';
import {
  initUndercover,
  reduceUndercover,
} from '../games/undercover/undercover.engine';
import { projectFor } from './project';
import type { ProjectionCtx, Room } from './room.types';

// ─── Sentinelles : des valeurs impossibles à croiser par hasard ─────────────

const CIVIL_WORD = 'ZZSECRETCIVILZZ';
const UNDER_WORD = 'ZZSECRETUNDERZZ';
const HOST_TOKEN = 'ZZTOKENHOSTZZ';
const PLAYER_TOKEN_PREFIX = 'ZZTOKENPLAYERZZ';

const IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5'];

function makePlayers(): Player[] {
  return IDS.map((id, i) => ({
    id,
    name: `Joueur${i + 1}`,
    avatar: '🦊',
    connected: true,
    joinedAt: 0,
  }));
}

function makeRoom(game: UndercoverState | undefined, status: Room['status'] = 'inGame'): Room {
  const playerTokens = new Map<string, PlayerId>();
  for (const id of IDS) playerTokens.set(`${PLAYER_TOKEN_PREFIX}${id}`, id);
  return {
    code: 'TEST',
    host: { token: HOST_TOKEN, connected: true },
    players: makePlayers(),
    playerTokens,
    mirrorConnected: false,
    status,
    selection: { game: 'undercover', contentMode: 'normal', paramOverrides: {} },
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

// ─── Fabrique d'états par phase (via le vrai moteur : états atteignables) ───

function dispatch(state: UndercoverState, action: UndercoverAction, seed = 7): UndercoverState {
  return reduceUndercover(state, action, { rng: mulberry32(seed) }).state;
}

/**
 * Partie 5 joueurs à rôles forcés pour des audiences stables :
 * p1..p3 civils, p4 undercover, p5 Mr. White.
 */
function baseState(): UndercoverState {
  const { state } = initUndercover(
    IDS,
    { a: CIVIL_WORD, b: UNDER_WORD },
    {
      undercoverCount: 1,
      mrWhite: true,
      discussSeconds: 60,
      voteSeconds: 45,
      whiteGuessSeconds: 30,
      publicVotes: false,
      manchesCount: 1,
      describePasses: 1,
    },
    { rng: mulberry32(1) },
  );
  return {
    ...state,
    civilianWord: 'a',
    roles: { p1: 'civilian', p2: 'civilian', p3: 'civilian', p4: 'undercover', p5: 'mrwhite' },
    speakingOrder: ['p1', 'p2', 'p3', 'p4', 'p5'],
  };
}

function atDescribe(): UndercoverState {
  return dispatch(baseState(), { type: 'HOST_NEXT' });
}

function atDiscuss(): UndercoverState {
  let s = atDescribe();
  for (let i = 0; i < 5; i++) s = dispatch(s, { type: 'HOST_NEXT' });
  return s;
}

function atVote(): UndercoverState {
  return dispatch(atDiscuss(), { type: 'HOST_NEXT' });
}

/** Vote en cours avec des votes déjà posés — le cas le plus sensible. */
function atVoteWithBallots(): UndercoverState {
  let s = atVote();
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p4' });
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'p5' });
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p3', target: 'blank' });
  return s;
}

/** Égalité → re-vote en cours (candidats publics, bulletins remis à zéro). */
function atRevote(): UndercoverState {
  let s = atVote();
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p4' });
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'p4' });
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p3', target: 'p5' });
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p4', target: 'p5' });
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p5', target: 'blank' });
  return s;
}

/** p1 (civil) éliminé — phase reveal, la partie continue. */
function atReveal(): UndercoverState {
  let s = atVote();
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p2', target: 'p1' });
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p3', target: 'p1' });
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p4', target: 'p1' });
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p5', target: 'p1' });
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p1', target: 'p4' });
  return s;
}

/** p5 (Mr. White) éliminé par vote → phase whiteGuess ouverte. */
function atWhiteGuess(): UndercoverState {
  let s = atVote();
  for (const voter of ['p1', 'p2', 'p3', 'p4'] as const) {
    s = dispatch(s, { type: 'CAST_VOTE', playerId: voter, target: 'p5' });
  }
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p5', target: 'p1' });
  return dispatch(s, { type: 'HOST_NEXT' });
}

function atWhiteGuessResolved(): UndercoverState {
  return dispatch(atWhiteGuess(), { type: 'SUBMIT_GUESS', playerId: 'p5', guess: 'tentative ratée' });
}

function atEnd(): UndercoverState {
  // White rate → il restait p4 : on termine par l'élimination de p4 (civils gagnent).
  let s = dispatch(atWhiteGuessResolved(), { type: 'HOST_NEXT' }); // nouveau tour à 4
  while (s.phase !== 'vote') s = dispatch(s, { type: 'HOST_NEXT' });
  for (const voter of ['p1', 'p2', 'p3'] as const) {
    s = dispatch(s, { type: 'CAST_VOTE', playerId: voter, target: 'p4' });
  }
  s = dispatch(s, { type: 'CAST_VOTE', playerId: 'p4', target: 'p1' });
  return dispatch(s, { type: 'HOST_NEXT' }); // reveal → end
}

const PHASES: Array<[string, () => UndercoverState]> = [
  ['distribute', baseState],
  ['describe', atDescribe],
  ['discuss', atDiscuss],
  ['vote', atVote],
  ['vote (bulletins posés)', atVoteWithBallots],
  ['vote (re-vote après égalité)', atRevote],
  ['reveal', atReveal],
  ['whiteGuess', atWhiteGuess],
  ['whiteGuess (résolu)', atWhiteGuessResolved],
  ['end', atEnd],
];

// ─── Outils d'analyse structurelle des projections ──────────────────────────

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function* walk(value: Json, path: string[] = []): Generator<{ path: string; value: Json; key: string }> {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* walk(value[i], [...path, String(i)]);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      yield { path: [...path, k].join('.'), value: v, key: k };
      yield* walk(v, [...path, k]);
    }
  }
}

function serialize(view: unknown): { text: string; json: Json } {
  const text = JSON.stringify(view);
  return { text, json: JSON.parse(text) as Json };
}

/** Chemins où une valeur de rôle a le DROIT d'apparaître (rôles déjà révélés). */
const ALLOWED_ROLE_PATHS = [
  /(^|\.)kind$/, // kind: 'undercover' (nom du jeu, pas un rôle)
  /(^|\.)game$/, // selection.game / recap[i].game
  /^room\.game\.eliminations\.\d+\.role$/,
  /^room\.game\.lastReveal\.eliminated\.role$/,
  /^room\.game\.end\.roles\.\d+\.role$/,
];

const ROLE_VALUES = new Set(['civilian', 'undercover', 'mrwhite']);

function roleLeaks(json: Json, aliveIds: PlayerId[], roles: Record<PlayerId, string>): string[] {
  const leaks: string[] = [];
  for (const { path, value } of walk(json)) {
    if (typeof value === 'string' && ROLE_VALUES.has(value)) {
      if (!ALLOWED_ROLE_PATHS.some((re) => re.test(path))) {
        leaks.push(`${path} = ${value}`);
      }
    }
  }
  // Aucun chemin autorisé ne doit exposer le rôle d'un joueur ENCORE VIVANT.
  for (const { path, value } of walk(json)) {
    if (/^room\.game\.(eliminations\.\d+|lastReveal\.eliminated)$/.test(path) && value && typeof value === 'object' && !Array.isArray(value)) {
      const rec = value as { playerId?: Json; role?: Json };
      if (typeof rec.playerId === 'string' && aliveIds.includes(rec.playerId) && typeof rec.role === 'string') {
        leaks.push(`${path} révèle le rôle du vivant ${rec.playerId}`);
      }
    }
  }
  return leaks;
}

/** Clés structurellement interdites dans toute projection (état brut). */
const BANNED_KEYS = [
  'pair',
  'civilianWord',
  'roles',
  'votes',
  'token',
  'playerTokens',
  'usedEntryIds',
  // suivi du bonus et cumul bruts : seuls goodVote/cumulative dérivés sortent, en phase end
  'goodVoterIds',
  'carriedPoints',
];
// En phase end, la révélation complète est publique par spec (fiche 5.1 étape 10).
const ALLOWED_BANNED_KEY_PATHS = [/^room\.game\.end\.roles$/, /^room\.game\.end\.words\.civilianWord$/];

function bannedKeyLeaks(json: Json): string[] {
  const leaks: string[] = [];
  for (const { path, key } of walk(json)) {
    if (BANNED_KEYS.includes(key) && !ALLOWED_BANNED_KEY_PATHS.some((re) => re.test(path))) {
      leaks.push(path);
    }
  }
  return leaks;
}

function expectNoSecretWords(text: string, phase: string, context: string): void {
  if (!phase.startsWith('end')) {
    expect(text, `${context} : mot des civils fuité`).not.toContain(CIVIL_WORD);
    expect(text, `${context} : mot des undercover fuité`).not.toContain(UNDER_WORD);
  }
}

function expectCommonInvariants(view: unknown, state: UndercoverState, context: string): void {
  const { text, json } = serialize(view);
  expect(text, `${context} : jeton host fuité`).not.toContain(HOST_TOKEN);
  expect(text, `${context} : jeton joueur fuité`).not.toContain(PLAYER_TOKEN_PREFIX);
  expect(bannedKeyLeaks(json), `${context} : clé d'état brut présente`).toEqual([]);
  expect(roleLeaks(json, state.alive, state.roles), `${context} : fuite de rôle`).toEqual([]);
}

// ─── Les tests : chaque phase × chaque audience ─────────────────────────────

describe('non-fuite — host et miroir (écran projeté : strictement public)', () => {
  for (const [label, make] of PHASES) {
    it(`phase ${label}`, () => {
      const state = make();
      const room = makeRoom(state, state.phase === 'end' ? 'recap' : 'inGame');
      for (const viewer of [{ kind: 'host' }, { kind: 'mirror' }] as Viewer[]) {
        const view = projectFor(room, viewer, PCTX);
        const { text } = serialize(view);
        expectNoSecretWords(text, label, `${viewer.kind}/${label}`);
        expectCommonInvariants(view, state, `${viewer.kind}/${label}`);
      }
    });
  }
});

describe('non-fuite — joueurs non autorisés', () => {
  for (const [label, make] of PHASES) {
    it(`phase ${label}`, () => {
      const state = make();
      const room = makeRoom(state, state.phase === 'end' ? 'recap' : 'inGame');
      const isEnd = label.startsWith('end');

      for (const id of IDS) {
        const view = projectFor(room, { kind: 'player', playerId: id }, PCTX);
        const { text } = serialize(view);
        expectCommonInvariants(view, state, `joueur ${id}/${label}`);
        if (isEnd) continue; // en fin de partie, la révélation complète est publique

        const role = state.roles[id];
        if (role === 'civilian') {
          // Un civil voit son mot, jamais celui des undercover.
          expect(text, `civil ${id}/${label} : mot adverse fuité`).not.toContain(UNDER_WORD);
        } else if (role === 'undercover') {
          // Un undercover voit son mot, jamais celui des civils.
          expect(text, `undercover ${id}/${label} : mot des civils fuité`).not.toContain(CIVIL_WORD);
        } else {
          // Mr. White ne voit AUCUN des deux mots.
          expect(text, `White/${label} : mot des civils fuité`).not.toContain(CIVIL_WORD);
          expect(text, `White/${label} : mot des undercover fuité`).not.toContain(UNDER_WORD);
        }
      }
    });
  }
});

describe('non-fuite — cas particuliers', () => {
  it('un civil ne connaît pas son propre rôle (il pourrait être undercover)', () => {
    const room = makeRoom(atDescribe());
    const view = projectFor(room, { kind: 'player', playerId: 'p1' }, PCTX);
    const me = view.me?.game?.undercover;
    expect(me?.word).toBe(CIVIL_WORD); // son mot, oui
    expect(me?.isMrWhite).toBeUndefined(); // son rôle, jamais
    const { json } = serialize(view);
    // le mot apparaît UNIQUEMENT sous me.game.undercover.word
    for (const { path, value } of walk(json)) {
      if (value === CIVIL_WORD) expect(path).toBe('me.game.undercover.word');
    }
  });

  it('Mr. White sait seulement qu’il est Mr. White', () => {
    const view = projectFor(makeRoom(atDescribe()), { kind: 'player', playerId: 'p5' }, PCTX);
    const me = view.me?.game?.undercover;
    expect(me?.isMrWhite).toBe(true);
    expect(me?.word).toBeUndefined();
  });

  it('pendant le vote, personne ne voit les bulletins — seulement le compte', () => {
    const state = atVoteWithBallots();
    const room = makeRoom(state);
    for (const viewer of [{ kind: 'host' }, { kind: 'player', playerId: 'p2' }] as Viewer[]) {
      const view = projectFor(room, viewer, PCTX);
      expect(view.room.game?.votesCast).toBe(3);
      expect(view.room.game?.votesExpected).toBe(5);
      const { text } = serialize(view);
      expect(text).not.toContain('votesByVoter');
    }
    // … sauf son propre bulletin, modifiable jusqu'à la clôture.
    const p1 = projectFor(room, { kind: 'player', playerId: 'p1' }, PCTX);
    expect(p1.me?.game?.undercover?.myVote).toBe('p4');
    const p2 = projectFor(room, { kind: 'player', playerId: 'p2' }, PCTX);
    expect(p2.me?.game?.undercover?.myVote).toBe('p5');
  });

  it('votes publics OFF : le détail par votant n’apparaît jamais, même au reveal', () => {
    const room = makeRoom(atReveal());
    for (const viewer of [{ kind: 'host' }, { kind: 'mirror' }, { kind: 'player', playerId: 'p1' }] as Viewer[]) {
      const { text } = serialize(projectFor(room, viewer, PCTX));
      expect(text).not.toContain('votesByVoter');
    }
  });

  it('le rôle d’un éliminé est public, celui des vivants jamais (phase reveal)', () => {
    const state = atReveal(); // p1 (civil) éliminé
    const view = projectFor(makeRoom(state), { kind: 'host' }, PCTX);
    expect(view.room.game?.lastReveal?.eliminated).toMatchObject({ playerId: 'p1', role: 'civilian' });
    // les rôles de p2..p5 (vivants) sont introuvables — déjà garanti par roleLeaks,
    // on vérifie ici le cas précis :
    const { json } = serialize(view);
    for (const { path, value } of walk(json)) {
      if (typeof value === 'string' && ROLE_VALUES.has(value) && !/(^|\.)(kind|game)$/.test(path)) {
        expect(path).toMatch(/^room\.game\.(eliminations\.0|lastReveal\.eliminated)\.role$/);
      }
    }
  });

  it('le guess de Mr. White est public (proposition + verdict), le mot civil reste caché', () => {
    const state = atWhiteGuessResolved();
    const view = projectFor(makeRoom(state), { kind: 'mirror' }, PCTX);
    expect(view.room.game?.whiteGuess).toMatchObject({ playerId: 'p5', guess: 'tentative ratée', correct: false });
    const { text } = serialize(view);
    expect(text).not.toContain(CIVIL_WORD);
  });

  it('en phase end, la révélation complète est bien publique (mots + rôles + points)', () => {
    const state = atEnd();
    const view = projectFor(makeRoom(state, 'recap'), { kind: 'host' }, PCTX);
    expect(view.room.game?.end?.words).toEqual({ a: CIVIL_WORD, b: UNDER_WORD, civilianWord: 'a' });
    expect(view.room.game?.end?.roles).toHaveLength(5);
    expect(view.room.game?.end?.winner).toBe('civilians');
  });

  it('le suivi des « bons votes » ne fuit jamais avant la fin de manche', () => {
    // p1 a visé p4 (undercover) au premier dépouillement : marqué côté état…
    const state = atReveal();
    expect(state.goodVoterIds).toContain('p1');
    const room = makeRoom(state);
    for (const viewer of [{ kind: 'host' }, { kind: 'mirror' }, { kind: 'player', playerId: 'p1' }, { kind: 'player', playerId: 'p2' }] as Viewer[]) {
      const { text } = serialize(projectFor(room, viewer, PCTX));
      // …mais aucune projection ne porte ni la clé brute ni un flag dérivé.
      expect(text).not.toContain('goodVote');
    }
  });

  it('en phase end, les points portent le flag « bon vote » et le cumul est public', () => {
    const state = atEnd();
    const view = projectFor(makeRoom(state, 'recap'), { kind: 'mirror' }, PCTX);
    const end = view.room.game?.end;
    expect(end?.isFinalManche).toBe(true);
    expect(end?.cumulative?.length).toBe(5);
    const p1 = end?.points.find((p) => p.playerId === 'p1');
    expect(p1?.goodVote).toBe(true); // p1 a visé White puis l'undercover
    expect(p1?.points).toBe(3);
  });

  it('un spectateur arrivé en cours de partie (hors partie) ne reçoit aucun secret', () => {
    const state = atDescribe();
    const room = makeRoom(state);
    room.players.push({ id: 'p9', name: 'Tardif', avatar: '🐢', connected: true, joinedAt: 5 });
    const view = projectFor(room, { kind: 'player', playerId: 'p9' }, PCTX);
    const { text } = serialize(view);
    expect(text).not.toContain(CIVIL_WORD);
    expect(text).not.toContain(UNDER_WORD);
    expect(view.me?.game?.undercover?.inGame).toBe(false);
    expect(view.me?.game?.undercover?.word).toBeUndefined();
  });
});
