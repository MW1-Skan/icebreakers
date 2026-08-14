/**
 * Projections Wavelength par audience (fiche 5.2). La cible ne sort du serveur
 * que vers le télépathe avant la révélation ; les curseurs individuels sont
 * invisibles des autres pendant le placement (seul le compte est public).
 */
import type { PlayerId, WavelengthMeView, WavelengthPublicView, WavelengthState } from '../../shared';
import { placersOf, sortedTotals } from './wavelength.engine';

export function projectWavelengthPublic(
  state: WavelengthState,
  connectedIds: PlayerId[],
): WavelengthPublicView {
  const connected = new Set(connectedIds);
  const activePlacers = placersOf(state).filter((id) => connected.has(id));
  return {
    kind: 'wavelength',
    phase: state.phase,
    mancheNumber: state.mancheNumber,
    manchesPlanned: state.manchesPlanned,
    telepathId: state.currentTelepathId,
    axis: { ...state.axis },
    clue: state.clue,
    placedCount: Object.keys(state.placements).length,
    placersExpected: state.phase === 'place' ? activePlacers.length : placersOf(state).length,
    // lastResult ne contient QUE des manches résolues/annulées : la cible qui
    // y figure est celle d'une manche passée, publique par construction.
    lastResult: state.lastResult ? { ...state.lastResult, results: state.lastResult.results.map((r) => ({ ...r })) } : undefined,
    totals: sortedTotals(state),
    history: state.phase === 'end' ? state.history.map((h) => ({ ...h, results: h.results.map((r) => ({ ...r })) })) : undefined,
    zoneWidth: state.params.zoneWidth,
    params: {
      manchesCount: state.params.manchesCount,
      placeSeconds: state.params.placeSeconds,
      zoneWidth: state.params.zoneWidth,
    },
  };
}

export function projectWavelengthMe(state: WavelengthState, playerId: PlayerId): WavelengthMeView {
  const inGame = state.playerIds.includes(playerId);
  const isTelepath = inGame && playerId === state.currentTelepathId;
  return {
    inGame,
    isTelepath,
    // 🔒 La cible : télépathe uniquement (avec les zones, dès le tirage).
    target: isTelepath && state.phase !== 'end' ? state.target : undefined,
    canSubmitClue: isTelepath && state.phase === 'clue',
    canPlace: inGame && !isTelepath && state.phase === 'place',
    myPlacement: state.phase === 'place' ? state.placements[playerId] : undefined,
    hasPlaced: state.phase === 'place' && playerId in state.placements,
  };
}
