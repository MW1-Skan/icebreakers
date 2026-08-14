/**
 * Projections Undercover par audience (fiche 5.1, tableau « Écrans par phase »).
 * La vue publique est celle de la TV : AUCUN secret n'y entre avant la phase
 * de fin. La vue `me` porte uniquement le secret du joueur destinataire.
 */
import type { PlayerId, UndercoverMeView, UndercoverPublicView, UndercoverState } from '../../shared';
import {
  undercoverCumulativePoints,
  undercoverManchePoints,
  voteOptionsFor,
  wordFor,
} from './undercover.engine';

export function projectUndercoverPublic(state: UndercoverState): UndercoverPublicView {
  const isEnd = state.phase === 'end';
  return {
    kind: 'undercover',
    phase: state.phase,
    round: state.round,
    mancheIndex: state.mancheIndex,
    manchesTotal: state.params.manchesCount,
    describePass: state.describePass,
    aliveIds: [...state.alive],
    speakingOrder: [...state.speakingOrder],
    currentSpeakerId: state.phase === 'describe' ? state.speakingOrder[state.turnIndex] : undefined,
    seenWordIds: [...state.seenWord],
    votesCast: Object.keys(state.votes).length,
    votesExpected: state.alive.length,
    revoteCandidates: state.revoteCandidates ? [...state.revoteCandidates] : undefined,
    lastReveal: state.lastReveal,
    whiteGuess: state.whiteGuess
      ? {
          playerId: state.whiteGuess.playerId,
          guess: state.whiteGuess.guess,
          correct: state.whiteGuess.correct,
          resolved: state.whiteGuess.resolved,
        }
      : undefined,
    eliminations: state.eliminations.map((e) => ({ ...e })),
    suggestAbort: state.suggestAbort,
    end: isEnd && state.winner
      ? {
          winner: state.winner,
          words: { a: state.pair.a, b: state.pair.b, civilianWord: state.civilianWord },
          roles: state.playerIds.map((playerId) => ({
            playerId,
            role: state.roles[playerId],
            word: wordFor(state, playerId),
          })),
          points: undercoverManchePoints(state),
          cumulative: undercoverCumulativePoints(state),
          isFinalManche: state.mancheIndex >= state.params.manchesCount,
        }
      : undefined,
    params: {
      undercoverCount: state.params.undercoverCount,
      mrWhite: state.params.mrWhite,
      discussSeconds: state.params.discussSeconds,
      voteSeconds: state.params.voteSeconds,
      publicVotes: state.params.publicVotes,
      manchesCount: state.params.manchesCount,
      describePasses: state.params.describePasses,
    },
  };
}

export function projectUndercoverMe(state: UndercoverState, playerId: PlayerId): UndercoverMeView {
  const inGame = state.playerIds.includes(playerId);
  const alive = state.alive.includes(playerId);
  const role = state.roles[playerId];
  const canVote = inGame && alive && state.phase === 'vote';
  return {
    inGame,
    alive,
    // Un civil et un undercover voient SEULEMENT leur mot — jamais leur rôle.
    word: inGame ? wordFor(state, playerId) : undefined,
    // Seul Mr. White sait qui il est.
    isMrWhite: inGame && role === 'mrwhite' ? true : undefined,
    hasSeenWord: state.seenWord.includes(playerId),
    isMyTurn: state.phase === 'describe' && state.speakingOrder[state.turnIndex] === playerId,
    canVote,
    voteOptions: canVote ? voteOptionsFor(state, playerId) : [],
    myVote: canVote ? state.votes[playerId] : undefined,
    canGuess:
      state.phase === 'whiteGuess' &&
      state.whiteGuess?.playerId === playerId &&
      !state.whiteGuess.resolved,
  };
}
