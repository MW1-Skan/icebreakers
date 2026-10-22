/**
 * Projections Juste Prix par audience. Pendant l'estimation, l'article courant
 * ne sort qu'avec son nom, ses détails et sa photo : ni prix, ni source ; les
 * mises ne sont visibles que de leur auteur (seul QUI a misé est public). Les
 * articles suivants ne sont jamais projetés.
 */
import type {
  JustePrixMeView,
  JustePrixPublicView,
  JustePrixRoundRecord,
  JustePrixState,
  PlayerId,
} from '../../shared';
import { sortedTotals } from './justeprix.engine';

function cloneRecord(record: JustePrixRoundRecord): JustePrixRoundRecord {
  return { ...record, item: { ...record.item }, results: record.results.map((r) => ({ ...r })) };
}

export function projectJustePrixPublic(state: JustePrixState, connectedIds: PlayerId[]): JustePrixPublicView {
  const connected = new Set(connectedIds);
  const current = state.phase === 'end' ? undefined : state.items[state.itemIndex];
  return {
    kind: 'justeprix',
    phase: state.phase,
    itemNumber: state.itemIndex + 1,
    itemsCount: state.items.length,
    item: current ? { name: current.name, details: current.details, image: current.image } : undefined,
    bidderIds: state.phase === 'guess' ? state.playerIds.filter((id) => id in state.bids) : [],
    biddersExpected:
      state.phase === 'guess'
        ? state.playerIds.filter((id) => connected.has(id)).length
        : state.playerIds.length,
    // lastResult ne contient que des articles RÉVÉLÉS : public par construction.
    lastResult: state.lastResult ? cloneRecord(state.lastResult) : undefined,
    totals: sortedTotals(state),
    history: state.phase === 'end' ? state.history.map(cloneRecord) : undefined,
    params: { ...state.params },
  };
}

export function projectJustePrixMe(state: JustePrixState, playerId: PlayerId): JustePrixMeView {
  const inGame = state.playerIds.includes(playerId);
  return {
    inGame,
    canEstimate: inGame && state.phase === 'guess',
    // 🔒 Sa propre mise uniquement.
    myBid: state.phase === 'guess' ? state.bids[playerId] : undefined,
  };
}
