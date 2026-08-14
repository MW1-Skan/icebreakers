/**
 * Projections Spyfall par audience (fiche 5.4). Thème + grille publics en
 * permanence ; la carte est cachée à l'espion — donc à la TV — et l'identité
 * de l'espion ne sort qu'à sa révélation (coup tenté) ou à l'issue.
 */
import type { PlayerId, SpyfallMeView, SpyfallPublicView, SpyfallState } from '../../shared';
import { accusationVoters, finalVoters, sortedSpyfallTotals } from './spyfall.engine';
import type { EngineCtx } from '../engine';

export function projectSpyfallPublic(state: SpyfallState, connectedIds: PlayerId[]): SpyfallPublicView {
  const ctx: EngineCtx = { rng: () => 0, connectedIds };
  const resolved = state.phase === 'reveal' || state.phase === 'end';
  return {
    kind: 'spyfall',
    phase: state.phase,
    mancheIndex: state.mancheIndex,
    manchesTotal: state.params.manchesCount,
    category: state.category,
    grid: [...state.grid],
    firstQuestionerId: state.firstQuestionerId,
    seenCardIds: [...state.seenCardIds],
    accusation: state.accusation
      ? {
          accuserId: state.accusation.accuserId,
          accusedId: state.accusation.accusedId,
          votesCast: Object.keys(state.accusation.votes).length,
          votersExpected: accusationVoters(state, ctx).length,
        }
      : undefined,
    accusationsUsed: [...state.accusationsUsed],
    finalVotesCast: Object.keys(state.finalVotes).length,
    finalVotersExpected: state.phase === 'finalVote' ? finalVoters(state, ctx).length : 0,
    // « L'espion se révèle ! » : identité publique dès le coup tenté, et à l'issue.
    revealedSpyId: state.phase === 'spyGuess' || resolved ? state.spyId : undefined,
    frozen: state.frozen,
    lastOutcome: resolved ? state.lastOutcome : undefined,
    totals: sortedSpyfallTotals(state),
    history: state.phase === 'end' ? state.history.map((h) => ({ ...h })) : undefined,
    params: { mancheSeconds: state.params.mancheSeconds, manchesCount: state.params.manchesCount },
  };
}

export function projectSpyfallMe(state: SpyfallState, playerId: PlayerId): SpyfallMeView {
  const inGame = state.playerIds.includes(playerId);
  const isSpy = inGame && playerId === state.spyId;
  const resolved = state.phase === 'reveal' || state.phase === 'end';
  const isAccused = state.accusation?.accusedId === playerId;
  return {
    inGame,
    // 🔒 « Tu es l'ESPION » — connu de lui seul (avant toute révélation).
    isSpy: isSpy ? true : undefined,
    // 🔒 La carte secrète — tous les civils, jamais l'espion (avant résolution).
    card: inGame && !isSpy ? state.card : resolved && isSpy ? state.card : undefined,
    hasSeenCard: state.seenCardIds.includes(playerId),
    canAccuse:
      inGame && state.phase === 'interrogate' && !state.accusationsUsed.includes(playerId) && !state.frozen,
    canVoteAccusation:
      inGame && state.phase === 'accusationVote' && !isAccused && !(playerId in (state.accusation?.votes ?? {})),
    isAccused,
    myAccusationVote: state.accusation?.votes[playerId],
    canSpyReveal: isSpy && state.phase === 'interrogate' && !state.frozen,
    canSpyGuess: isSpy && state.phase === 'spyGuess',
    canVoteFinal: inGame && state.phase === 'finalVote' && !(playerId in state.finalVotes),
    myFinalVote: state.phase === 'finalVote' ? state.finalVotes[playerId] : undefined,
  };
}
