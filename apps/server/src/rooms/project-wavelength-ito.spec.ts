/**
 * Tests de NON-FUITE Wavelength + Ito (PRD §6.3, obligatoires et bloquants).
 *
 * Wavelength : la cible n'existe que chez le télépathe avant la révélation ;
 * les curseurs individuels sont invisibles des autres pendant le placement.
 * Ito : le nombre d'un joueur ne sort que vers lui, jusqu'à sa révélation
 * dans la frise (pose, défausse, libération).
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../shared';
import type { ItoState, Player, PlayerId, Viewer, WavelengthState } from '../shared';
import { initWavelength, reduceWavelength, resolveWavelengthParams } from '../games/wavelength/wavelength.engine';
import { initIto, resolveItoParams } from '../games/ito/ito.engine';
import { projectFor } from './project';
import type { GameState, ProjectionCtx, Room } from './room.types';

const IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];

function makePlayers(): Player[] {
  return IDS.map((id, i) => ({ id, name: `Joueur${i + 1}`, avatar: '🦊', connected: true, joinedAt: i }));
}

function makeRoom(game: GameState, selectionGame: 'wavelength' | 'ito', status: Room['status'] = 'inGame'): Room {
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

const ALL_VIEWERS: Viewer[] = [
  { kind: 'host' },
  { kind: 'mirror' },
  ...IDS.map((id): Viewer => ({ kind: 'player', playerId: id })),
];

function serialize(view: unknown): string {
  return JSON.stringify(view);
}

// ─── Wavelength ─────────────────────────────────────────────────────────────

// Cible sentinelle 87 et curseur sentinelle 93 : aucun autre champ de la
// projection ne porte ces valeurs (timers vides, totaux à 0, zones 5/45…).
const TARGET = 87;
const CURSOR = 93;

function wavelengthAtClue(): WavelengthState {
  const { state } = initWavelength(IDS, { left: 'Chaud', right: 'Froid' }, resolveWavelengthParams(4, {}), {
    rng: mulberry32(1),
  });
  return { ...state, target: TARGET };
}

function wavelengthAtPlace(): WavelengthState {
  const s = wavelengthAtClue();
  const placed = reduceWavelength(
    { ...s, phase: 'place', clue: 'un bain tiède' },
    { type: 'PLACE', playerId: 'p2', value: CURSOR },
    { rng: mulberry32(1) },
  ).state;
  return placed;
}

function wavelengthAtReveal(): WavelengthState {
  let s = wavelengthAtPlace();
  const ctx = { rng: mulberry32(1) };
  s = reduceWavelength(s, { type: 'PLACE', playerId: 'p3', value: 10 }, ctx).state;
  s = reduceWavelength(s, { type: 'PLACE', playerId: 'p4', value: 20 }, ctx).state;
  return s;
}

describe('non-fuite Wavelength', () => {
  it('la cible ne sort jamais avant la révélation (sauf chez le télépathe)', () => {
    for (const [label, state] of [
      ['clue', wavelengthAtClue()],
      ['place', wavelengthAtPlace()],
    ] as const) {
      const room = makeRoom(state, 'wavelength');
      for (const viewer of ALL_VIEWERS) {
        const view = projectFor(room, viewer, PCTX);
        const text = serialize(view);
        const isTelepath = viewer.kind === 'player' && viewer.playerId === 'p1';
        if (isTelepath) {
          expect(view.me?.game?.wavelength?.target).toBe(TARGET);
        } else {
          expect(text, `${JSON.stringify(viewer)}/${label} : cible fuitée`).not.toContain(String(TARGET));
        }
      }
    }
  });

  it('pendant le placement, un curseur n’est visible que de son auteur (la TV ne montre que le compte)', () => {
    const room = makeRoom(wavelengthAtPlace(), 'wavelength');
    const p2view = projectFor(room, { kind: 'player', playerId: 'p2' }, PCTX);
    expect(p2view.me?.game?.wavelength?.myPlacement).toBe(CURSOR);

    for (const viewer of ALL_VIEWERS.filter((v) => !(v.kind === 'player' && v.playerId === 'p2'))) {
      const view = projectFor(room, viewer, PCTX);
      const text = serialize(view);
      expect(text, `${JSON.stringify(viewer)} : curseur de p2 fuité`).not.toContain(String(CURSOR));
      if (view.room.game?.kind === 'wavelength') {
        expect(view.room.game.placedCount).toBe(1);
      }
    }
  });

  it('à la révélation, cible + curseurs nominatifs + points deviennent publics d’un coup', () => {
    const view = projectFor(makeRoom(wavelengthAtReveal(), 'wavelength'), { kind: 'mirror' }, PCTX);
    if (view.room.game?.kind !== 'wavelength') throw new Error('vue wavelength attendue');
    expect(view.room.game.lastResult?.target).toBe(TARGET);
    expect(view.room.game.lastResult?.results).toContainEqual({ playerId: 'p2', value: CURSOR, points: 3 });
  });

  it('l’indice est public dès sa saisie ; le récap des indices attend la fin', () => {
    const place = projectFor(makeRoom(wavelengthAtPlace(), 'wavelength'), { kind: 'host' }, PCTX);
    if (place.room.game?.kind !== 'wavelength') throw new Error('vue wavelength attendue');
    expect(place.room.game.clue).toBe('un bain tiède');
    expect(place.room.game.history).toBeUndefined();
  });
});

// ─── Ito ────────────────────────────────────────────────────────────────────

// Nombres sentinelles à 2 chiffres, distincts de tout autre champ projeté.
const NUMBERS: Record<PlayerId, number> = { p1: 41, p2: 57, p3: 73, p4: 89 };

function itoAtPlay(): ItoState {
  const { state } = initIto(IDS, 'Aliments délicieux', resolveItoParams({}), { rng: mulberry32(1) });
  return { ...state, numbers: { ...NUMBERS }, holders: [...IDS], frise: [] };
}

function itoAfterError(): ItoState {
  // p2 pose 57 à tort : −1 vie, le 41 de p1 est défaussé — 57 et 41 deviennent publics.
  const s = itoAtPlay();
  return {
    ...s,
    lives: 2,
    holders: ['p3', 'p4'],
    frise: [
      { playerId: 'p2', number: 57, kind: 'error' },
      { playerId: 'p1', number: 41, kind: 'discarded' },
    ],
    themeLocked: true,
  };
}

describe('non-fuite Ito', () => {
  it('un nombre en main n’est visible que de son détenteur', () => {
    const room = makeRoom(itoAtPlay(), 'ito');
    for (const id of IDS) {
      const view = projectFor(room, { kind: 'player', playerId: id }, PCTX);
      expect(view.me?.game?.ito?.myNumber).toBe(NUMBERS[id]);
      const text = serialize(view);
      for (const other of IDS.filter((x) => x !== id)) {
        expect(text, `${id} voit le nombre de ${other}`).not.toContain(String(NUMBERS[other]));
      }
    }
    for (const viewer of [{ kind: 'host' }, { kind: 'mirror' }] as Viewer[]) {
      const text = serialize(projectFor(room, viewer, PCTX));
      for (const id of IDS) {
        expect(text, `${viewer.kind} voit le nombre de ${id}`).not.toContain(String(NUMBERS[id]));
      }
      expect(text).not.toContain('ZZTOKENHOSTZZ');
    }
  });

  it('après une erreur, seuls les nombres révélés (frise) sont publics — pas ceux en main', () => {
    const room = makeRoom(itoAfterError(), 'ito');
    const view = projectFor(room, { kind: 'host' }, PCTX);
    if (view.room.game?.kind !== 'ito') throw new Error('vue ito attendue');
    expect(view.room.game.frise.map((c) => c.number)).toEqual([57, 41]);
    expect(view.room.game.lives).toBe(2);
    const text = serialize(view);
    expect(text).not.toContain(String(NUMBERS.p3)); // 73 encore en main
    expect(text).not.toContain(String(NUMBERS.p4)); // 89 encore en main

    // p3 voit son 73, pas le 89 de p4
    const p3text = serialize(projectFor(room, { kind: 'player', playerId: 'p3' }, PCTX));
    expect(p3text).toContain('73');
    expect(p3text).not.toContain('89');
  });
});
