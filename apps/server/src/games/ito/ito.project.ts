/**
 * Projections Ito par audience (fiche 5.5). Le thème, les vies et la frise
 * sont publics ; le nombre d'un joueur ne sort du serveur que vers lui — ou
 * révélé dans la frise (pose, défausse, libération).
 */
import type { ItoMeView, ItoPublicView, ItoState, PlayerId } from '../../shared';
import { ITO_GAP_SUGGEST_THRESHOLD } from '../../shared';
import { itoVerdict } from './ito.engine';

export function projectItoPublic(state: ItoState): ItoPublicView {
  return {
    kind: 'ito',
    phase: state.phase,
    mancheIndex: state.mancheIndex,
    manchesTotal: state.params.manchesCount,
    theme: state.theme,
    lives: state.lives,
    livesTotal: state.params.livesCount,
    holdersCount: state.holders.length,
    holderIds: [...state.holders],
    frise: state.frise.map((c) => ({ ...c })),
    effectiveGap: state.effectiveGap,
    gapReduced: state.effectiveGap < state.params.minGap,
    suggestWiderRange: state.effectiveGap < ITO_GAP_SUGGEST_THRESHOLD && state.params.rangeMax < 100,
    themeLocked: state.themeLocked,
    verdict: state.phase === 'end' ? itoVerdict(state.lives, state.params.livesCount) : undefined,
    history: state.phase === 'end' ? state.history.map((h) => ({ ...h, frise: h.frise.map((c) => ({ ...c })) })) : undefined,
    params: {
      manchesCount: state.params.manchesCount,
      livesCount: state.params.livesCount,
      rangeMax: state.params.rangeMax,
      minGap: state.params.minGap,
    },
  };
}

export function projectItoMe(state: ItoState, playerId: PlayerId): ItoMeView {
  const inGame = state.playerIds.includes(playerId);
  const holding = inGame && state.holders.includes(playerId);
  return {
    inGame,
    // 🔒 Son nombre — le sien seulement (posé/défaussé → visible dans la frise publique).
    myNumber: inGame && playerId in state.numbers ? state.numbers[playerId] : undefined,
    holding,
    canPlay: holding && state.phase === 'play',
  };
}
