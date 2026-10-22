/**
 * Le Juste Prix — machine à états pure (fiche docs/fiches/juste-prix.md).
 *
 * Aucune I/O : les articles sont tirés par le serveur au lancement et injectés
 * (comme le deck Taboo) ; « Changer d'article » injecte le remplaçant via
 * `applyItemChange`. Chaque règle de la fiche a son test dans
 * `justeprix.engine.spec.ts`.
 */
import type {
  GameEffect,
  GameResult,
  JustePrixAction,
  JustePrixBidResult,
  JustePrixItem,
  JustePrixParams,
  JustePrixRoundRecord,
  JustePrixState,
  Player,
  PlayerId,
} from '../../shared';
import {
  JUSTEPRIX_MAX_AMOUNT,
  JUSTEPRIX_MAX_PLAYERS,
  JUSTEPRIX_MIN_PLAYERS,
  JUSTEPRIX_RANK_POINTS,
} from '../../shared';
import type { EngineCtx, GuardResult, ReduceResult } from '../engine';

// ─── Paramétrage et validation ──────────────────────────────────────────────

export function resolveJustePrixParams(partial: Partial<JustePrixParams>): JustePrixParams {
  return {
    manchesCount: partial.manchesCount ?? 6,
    guessSeconds: partial.guessSeconds ?? 45,
    noOverbid: partial.noOverbid ?? false,
  };
}

export function validateJustePrixSetup(
  playerCount: number,
): { ok: true } | { ok: false; code: 'BAD_PLAYER_COUNT'; message: string } {
  if (playerCount < JUSTEPRIX_MIN_PLAYERS || playerCount > JUSTEPRIX_MAX_PLAYERS) {
    return {
      ok: false,
      code: 'BAD_PLAYER_COUNT',
      message: `Le Juste Prix se joue de ${JUSTEPRIX_MIN_PLAYERS} à ${JUSTEPRIX_MAX_PLAYERS} joueurs actifs (actuellement ${playerCount}).`,
    };
  }
  return { ok: true };
}

// ─── Classement ─────────────────────────────────────────────────────────────

function toCents(euros: number): number {
  return Math.round(euros * 100);
}

/** Mise arrondie au centime (le client peut envoyer 12.345). */
export function roundBid(amount: number): number {
  return toCents(amount) / 100;
}

/**
 * Classe les mises par écart au prix, calculé en centimes pour que les ex æquo
 * soient exacts (190 € et 210 € pour 200 €). Classement « 1, 1, 3 » : 3/2/1 pts
 * aux trois premiers rangs. Avec « sans dépasser », une mise au-dessus du prix
 * est hors classement (0 pt).
 */
export function rankBids(
  bids: Record<PlayerId, number>,
  playerIds: PlayerId[],
  price: number,
  noOverbid: boolean,
): JustePrixBidResult[] {
  const priceCents = toCents(price);
  const entries = playerIds
    .filter((id) => id in bids)
    .map((playerId) => {
      const amountCents = toCents(bids[playerId]);
      const distance = Math.abs(amountCents - priceCents);
      return {
        playerId,
        amount: amountCents / 100,
        distance,
        delta: (amountCents - priceCents) / priceCents,
        overbid: amountCents > priceCents,
        bullseye: distance * 100 <= priceCents,
      };
    });
  type Entry = (typeof entries)[number];
  const byDistance = (a: Entry, b: Entry) => a.distance - b.distance;
  const ranked = entries.filter((e) => !(noOverbid && e.overbid)).sort(byDistance);
  const unranked = entries.filter((e) => noOverbid && e.overbid).sort(byDistance);

  const toResult = (e: Entry, rank: number | undefined): JustePrixBidResult => ({
    playerId: e.playerId,
    amount: e.amount,
    delta: e.delta,
    rank,
    points: rank === undefined ? 0 : (JUSTEPRIX_RANK_POINTS[rank - 1] ?? 0),
    overbid: e.overbid,
    bullseye: e.bullseye,
  });
  return [
    ...ranked.map((e) => toResult(e, 1 + ranked.filter((o) => o.distance < e.distance).length)),
    ...unranked.map((e) => toResult(e, undefined)),
  ];
}

// ─── Initialisation ─────────────────────────────────────────────────────────

export function initJustePrix(
  playerIds: PlayerId[],
  items: JustePrixItem[],
  params: JustePrixParams,
  _ctx: EngineCtx,
): ReduceResult<JustePrixState> {
  const state: JustePrixState = {
    kind: 'justeprix',
    phase: 'guess',
    params,
    playerIds: [...playerIds],
    items: items.map((item) => ({ ...item })),
    itemIndex: 0,
    bids: {},
    totals: Object.fromEntries(playerIds.map((id) => [id, 0])),
    history: [],
  };
  return {
    state,
    effects: [
      { type: 'timer:start', id: 'guess', seconds: params.guessSeconds },
      { type: 'game:event', name: 'gameStarted' },
    ],
  };
}

/** « Changer d'article » (host, pendant l'estimation) : le tirage vient du serveur. */
export function canChangeItem(state: JustePrixState): GuardResult {
  if (state.phase !== 'guess') {
    return { ok: false, code: 'ACTION_NOT_ALLOWED', message: 'On ne change d’article que pendant l’estimation.' };
  }
  return { ok: true };
}

/** Remplace l'article courant : mises effacées, chrono relancé. */
export function applyItemChange(state: JustePrixState, item: JustePrixItem): ReduceResult<JustePrixState> {
  const items = [...state.items];
  items[state.itemIndex] = { ...item };
  return {
    state: { ...state, items, bids: {} },
    effects: [
      { type: 'timer:start', id: 'guess', seconds: state.params.guessSeconds },
      { type: 'game:event', name: 'itemChanged' },
    ],
  };
}

// ─── Garde de légalité ──────────────────────────────────────────────────────

export function guardJustePrix(state: JustePrixState, action: JustePrixAction, _ctx: EngineCtx): GuardResult {
  const deny = (message: string): GuardResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });

  switch (action.type) {
    case 'ESTIMATE':
      if (state.phase !== 'guess') return deny('Les estimations sont closes.');
      if (!state.playerIds.includes(action.playerId)) return deny('Tu ne fais pas partie de cette partie.');
      if (!Number.isFinite(action.amount) || action.amount < 0 || action.amount > JUSTEPRIX_MAX_AMOUNT) {
        return deny('Estimation invalide.');
      }
      return { ok: true };

    case 'TIMEOUT':
      return { ok: true };

    case 'HOST_NEXT':
      if (state.phase !== 'reveal') return deny('Rien à avancer dans cette phase.');
      return { ok: true };

    case 'PLAYER_GONE':
      if (state.phase !== 'guess') return deny('Aucune estimation en cours.');
      return { ok: true };
  }
}

// ─── Réducteur ──────────────────────────────────────────────────────────────

/** Clôture anticipée : tous les joueurs CONNECTÉS ont misé (et il en reste au moins un). */
function everyConnectedHasBid(state: JustePrixState, ctx: EngineCtx): boolean {
  const connected = new Set(ctx.connectedIds ?? state.playerIds);
  const active = state.playerIds.filter((id) => connected.has(id));
  return active.length > 0 && active.every((id) => id in state.bids);
}

export function reduceJustePrix(
  state: JustePrixState,
  action: JustePrixAction,
  ctx: EngineCtx,
): ReduceResult<JustePrixState> {
  switch (action.type) {
    case 'ESTIMATE': {
      const next: JustePrixState = {
        ...state,
        bids: { ...state.bids, [action.playerId]: roundBid(action.amount) },
      };
      if (everyConnectedHasBid(next, ctx)) return reveal(next, [{ type: 'timer:cancel', id: 'guess' }]);
      return { state: next, effects: [] };
    }

    case 'TIMEOUT':
      if (action.timerId === 'guess' && state.phase === 'guess') return reveal(state, []);
      return { state, effects: [] };

    case 'PLAYER_GONE':
      if (everyConnectedHasBid(state, ctx)) return reveal(state, [{ type: 'timer:cancel', id: 'guess' }]);
      return { state, effects: [] };

    case 'HOST_NEXT': {
      if (state.itemIndex + 1 >= state.items.length) {
        return { state: { ...state, phase: 'end' }, effects: [{ type: 'game:ended' }] };
      }
      const itemIndex = state.itemIndex + 1;
      return {
        state: { ...state, phase: 'guess', itemIndex, bids: {} },
        effects: [
          { type: 'timer:start', id: 'guess', seconds: state.params.guessSeconds },
          { type: 'game:event', name: 'itemStarted', payload: { itemNumber: itemIndex + 1 } },
        ],
      };
    }
  }
}

/** Article tel que révélé (l'id d'élément reste côté serveur). */
function revealedItem(item: JustePrixItem): JustePrixRoundRecord['item'] {
  return {
    name: item.name,
    details: item.details,
    price: item.price,
    image: item.image,
    source: item.source,
    seenAt: item.seenAt,
    credit: item.credit,
  };
}

/** Révélation d'un coup : prix, mises nominatives, classement, cumul. */
function reveal(state: JustePrixState, extraEffects: GameEffect[]): ReduceResult<JustePrixState> {
  const item = state.items[state.itemIndex];
  const results = rankBids(state.bids, state.playerIds, item.price, state.params.noOverbid);
  const totals = { ...state.totals };
  for (const r of results) totals[r.playerId] = (totals[r.playerId] ?? 0) + r.points;

  const record: JustePrixRoundRecord = {
    itemNumber: state.itemIndex + 1,
    item: revealedItem(item),
    results,
  };
  return {
    state: { ...state, phase: 'reveal', lastResult: record, totals, history: [...state.history, record] },
    effects: [
      ...extraEffects,
      { type: 'game:event', name: 'revealed', payload: { bullseye: results.some((r) => r.bullseye) } },
    ],
  };
}

// ─── Récap ──────────────────────────────────────────────────────────────────

export function sortedTotals(state: JustePrixState): Array<{ playerId: PlayerId; points: number }> {
  return Object.entries(state.totals)
    .map(([playerId, points]) => ({ playerId, points }))
    .sort((a, b) => b.points - a.points);
}

export function buildJustePrixResult(state: JustePrixState, players: Player[], endedAt: number): GameResult {
  const byId = new Map(players.map((p) => [p.id, p]));
  const totals = sortedTotals(state);
  const top = totals.filter((t) => t.points === totals[0]?.points && t.points > 0);
  const names = top.map((t) => byId.get(t.playerId)?.name ?? '???').join(' & ');
  return {
    game: 'justeprix',
    endedAt,
    // Égalité en tête : victoire partagée.
    summary: top.length > 0 ? `En tête : ${names} (${top[0].points} pts)` : 'Personne n’a marqué',
    points: totals.map(({ playerId, points }) => ({
      playerId,
      name: byId.get(playerId)?.name ?? '???',
      avatar: byId.get(playerId)?.avatar ?? '❓',
      points,
    })),
  };
}
