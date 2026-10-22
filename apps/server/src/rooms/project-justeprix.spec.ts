/**
 * Tests de NON-FUITE Juste Prix (PRD §6.3, obligatoires et bloquants).
 *
 * Pendant l'estimation, aucune projection ne porte le prix ni la source de
 * l'article courant ; les mises ne sortent que vers leur auteur ; les articles
 * suivants ne sont jamais projetés (ni nom, ni photo, ni prix).
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../shared';
import type { JustePrixItem, JustePrixState, Player, PlayerId, Viewer } from '../shared';
import { initJustePrix, reduceJustePrix, resolveJustePrixParams } from '../games/justeprix/justeprix.engine';
import { projectFor } from './project';
import type { ProjectionCtx, Room } from './room.types';

const IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];

// Valeurs sentinelles : aucun autre champ des projections ne les porte.
const SECRET_PRICE = 1234.56;
const SECRET_SOURCE = 'https://boutique-secrete.example/produit-zq7';
const BID = 4321.09;
const FUTURE_NAME = 'Article futur ZZQX';
const FUTURE_IMAGE = 'https://cdn.example/futur-zzqx.jpg';
const FUTURE_PRICE = 98765.43;

const CURRENT: JustePrixItem = {
  elementId: 'pack-test#0',
  name: 'Gamelle mystère',
  details: '22 × 11 × 22 cm',
  price: SECRET_PRICE,
  image: 'https://cdn.example/gamelle.jpg',
  source: SECRET_SOURCE,
  seenAt: '2026-10',
};
const FUTURE: JustePrixItem = {
  elementId: 'pack-test#1',
  name: FUTURE_NAME,
  price: FUTURE_PRICE,
  image: FUTURE_IMAGE,
  source: 'https://boutique-secrete.example/futur',
};

function makePlayers(): Player[] {
  return IDS.map((id, i) => ({ id, name: `Joueur${i + 1}`, avatar: '🦊', connected: true, joinedAt: i }));
}

function makeRoom(game: JustePrixState): Room {
  return {
    code: 'TEST',
    host: { token: 'ZZTOKENHOSTZZ', connected: true },
    players: makePlayers(),
    playerTokens: new Map(),
    mirrorConnected: false,
    status: 'inGame',
    selection: { game: 'justeprix', paramOverrides: {} },
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
  availablePacks: [{ id: 'pack-test', name: 'Pack de test', mode: 'normal', entriesCount: 2 }],
  selectedPackIds: ['pack-test'],
  justePrixDistinctItems: 2,
  config: { siteName: 'Icebreakers', internalModeLabel: 'Interne' },
  timerDefaults: { discussSeconds: 60, voteSeconds: 45, whiteGuessSeconds: 30 },
};

const ALL_VIEWERS: Viewer[] = [
  { kind: 'host' },
  { kind: 'mirror' },
  ...IDS.map((id): Viewer => ({ kind: 'player', playerId: id })),
];

const engineCtx = { rng: mulberry32(1) };

function atGuessWithBid(): JustePrixState {
  const { state } = initJustePrix(IDS, [CURRENT, FUTURE], resolveJustePrixParams({ manchesCount: 2 }), engineCtx);
  return reduceJustePrix(state, { type: 'ESTIMATE', playerId: 'p2', amount: BID }, engineCtx).state;
}

function priceForms(price: number): string[] {
  return [String(price), price.toFixed(2).replace('.', ','), String(Math.round(price * 100))];
}

describe('Juste Prix — non-fuite pendant l’estimation', () => {
  it('aucune audience ne voit le prix, la source ni l’id d’élément de l’article courant', () => {
    const room = makeRoom(atGuessWithBid());
    for (const viewer of ALL_VIEWERS) {
      const json = JSON.stringify(projectFor(room, viewer, PCTX));
      for (const form of priceForms(SECRET_PRICE)) {
        expect(json, `${JSON.stringify(viewer)} voit le prix (${form})`).not.toContain(form);
      }
      expect(json).not.toContain(SECRET_SOURCE);
      expect(json).not.toContain('boutique-secrete');
      expect(json).not.toContain('pack-test#');
      // L'article courant est bien affiché (nom, détails, photo).
      expect(json).toContain('Gamelle mystère');
      expect(json).toContain('https://cdn.example/gamelle.jpg');
    }
  });

  it('les articles suivants ne sont jamais projetés', () => {
    const room = makeRoom(atGuessWithBid());
    for (const viewer of ALL_VIEWERS) {
      const json = JSON.stringify(projectFor(room, viewer, PCTX));
      expect(json).not.toContain(FUTURE_NAME);
      expect(json).not.toContain(FUTURE_IMAGE);
      for (const form of priceForms(FUTURE_PRICE)) expect(json).not.toContain(form);
    }
  });

  it('une mise ne sort que vers son auteur ; les autres voient seulement QUI a misé', () => {
    const room = makeRoom(atGuessWithBid());
    for (const viewer of ALL_VIEWERS) {
      const view = projectFor(room, viewer, PCTX);
      const json = JSON.stringify(view);
      const isAuthor = viewer.kind === 'player' && viewer.playerId === 'p2';
      for (const form of priceForms(BID)) {
        if (isAuthor) continue;
        expect(json, `${JSON.stringify(viewer)} voit la mise de p2`).not.toContain(form);
      }
      const game = view.room.game;
      expect(game?.kind === 'justeprix' && game.bidderIds).toEqual(['p2']);
    }
    const author = projectFor(room, { kind: 'player', playerId: 'p2' }, PCTX);
    expect(author.me?.game?.justeprix?.myBid).toBe(BID);
    const other = projectFor(room, { kind: 'player', playerId: 'p3' }, PCTX);
    expect(other.me?.game?.justeprix?.myBid).toBeUndefined();
  });
});

describe('Juste Prix — révélation', () => {
  it('à la révélation, prix, source et mises deviennent publics — jamais l’article suivant', () => {
    const revealed = reduceJustePrix(atGuessWithBid(), { type: 'TIMEOUT', timerId: 'guess' }, engineCtx).state;
    const room = makeRoom(revealed);
    for (const viewer of ALL_VIEWERS) {
      const json = JSON.stringify(projectFor(room, viewer, PCTX));
      expect(json).toContain(String(SECRET_PRICE));
      expect(json).toContain(SECRET_SOURCE);
      expect(json).toContain(String(BID));
      expect(json).not.toContain(FUTURE_NAME);
      expect(json).not.toContain('pack-test#');
    }
  });

  it('pendant l’estimation de l’article suivant, son prix reste secret (seul le précédent est public)', () => {
    let s = reduceJustePrix(atGuessWithBid(), { type: 'TIMEOUT', timerId: 'guess' }, engineCtx).state;
    s = reduceJustePrix(s, { type: 'HOST_NEXT' }, engineCtx).state;
    const room = makeRoom(s);
    for (const viewer of ALL_VIEWERS) {
      const json = JSON.stringify(projectFor(room, viewer, PCTX));
      expect(json).toContain(FUTURE_NAME);
      for (const form of priceForms(FUTURE_PRICE)) expect(json).not.toContain(form);
      expect(json).not.toContain('boutique-secrete.example/futur');
    }
  });
});
