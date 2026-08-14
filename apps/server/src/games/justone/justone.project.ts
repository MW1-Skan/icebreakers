/**
 * Projections Just One par audience (fiche 5.3, tableau « Écrans par phase »).
 * La TV (écran animateur projeté) ne reçoit QUE des compteurs avant la
 * résolution : le devineur la regarde. Le mot n'y apparaît qu'à la résolution,
 * les textes d'indices qu'au récap final.
 */
import type { JustOneMeView, JustOnePublicView, JustOneState, PlayerId } from '../../shared';
import { isClueCancelled } from '../../shared';
import {
  canRedrawWord,
  effectiveArbiterId,
  giversOf,
  justOneScoreLabel,
} from './justone.engine';

export function projectJustOnePublic(state: JustOneState, connectedIds: PlayerId[]): JustOnePublicView {
  const connected = new Set(connectedIds);
  const activeGiverCount = giversOf(state).filter((id) => connected.has(id)).length;
  const validated = state.validatedClues ?? [];
  const remaining = validated.filter((c) => !isClueCancelled(c));
  const isResolve = state.phase === 'resolve';
  const isEnd = state.phase === 'end';
  return {
    kind: 'justone',
    phase: state.phase,
    mancheIndex: state.mancheIndex,
    manchesTotal: state.params.manchesCount,
    guesserId: state.guesserId,
    arbiterId: effectiveArbiterId(state, connectedIds),
    cluesSubmitted: state.phase === 'write' ? Object.keys(state.clues).length : validated.length,
    giversExpected: state.phase === 'write' ? activeGiverCount : giversOf(state).length,
    giversReady: state.readyGiverIds.length,
    remainingClues: remaining.length,
    cancelledClues: validated.length - remaining.length,
    // La proposition du devineur est publique dès sa soumission.
    guess: state.phase === 'arbitrate' || isResolve ? state.guess : undefined,
    outcome: isResolve ? state.outcome : undefined,
    // Le mot n'est révélé sur l'écran projeté qu'à la résolution de la manche.
    revealedWord: isResolve ? state.word : undefined,
    score: state.score,
    scoreLabel: isEnd ? justOneScoreLabel(state.score, state.params.manchesCount) : undefined,
    // Récap complet (mots + indices, annulés compris) : phase de fin uniquement.
    history: isEnd ? state.history.map((h) => ({ ...h, clues: h.clues.map((c) => ({ ...c })) })) : undefined,
    guesserFrozen: state.guesserFrozen,
    unplayableUsed: state.unplayableUsed,
    params: {
      manchesCount: state.params.manchesCount,
      writeSeconds: state.params.writeSeconds,
      validateSeconds: state.params.validateSeconds,
      guessSeconds: state.params.guessSeconds,
      softPenalty: state.params.softPenalty,
    },
  };
}

export function projectJustOneMe(
  state: JustOneState,
  playerId: PlayerId,
  connectedIds: PlayerId[],
): JustOneMeView {
  const inGame = state.playerIds.includes(playerId);
  const isGuesser = inGame && playerId === state.guesserId;
  const isGiver = inGame && !isGuesser;
  const isArbiter = isGiver && playerId === effectiveArbiterId(state, connectedIds);
  const validated = state.validatedClues ?? [];
  const remaining = validated.filter((c) => !isClueCancelled(c));
  const cluesVisibleToGivers = isGiver && ['validate', 'guess', 'arbitrate', 'resolve'].includes(state.phase);
  const guesserSeesClues = isGuesser && (state.phase === 'guess' || state.phase === 'arbitrate');

  return {
    inGame,
    isGuesser,
    isArbiter,
    // 🔒 Le mot mystère : donneurs uniquement (le devineur le découvre à la résolution).
    word: isGiver && state.phase !== 'end' ? state.word : undefined,
    myClue: isGiver ? state.clues[playerId] : undefined,
    canSubmitClue: isGiver && state.phase === 'write',
    clues: cluesVisibleToGivers ? validated.map((c) => ({ ...c })) : undefined,
    // 🔒 Devineur : indices restants seulement — les annulés sont masqués, pas révélés.
    remainingCluesForGuesser: guesserSeesClues
      ? remaining.map((c) => ({ giverId: c.giverId, text: c.text }))
      : undefined,
    maskedCluesCount: guesserSeesClues ? validated.length - remaining.length : undefined,
    isReady: state.readyGiverIds.includes(playerId),
    canReady: isGiver && state.phase === 'validate',
    canForceClose: isArbiter && state.phase === 'validate',
    canRedraw: isGiver && canRedrawWord(state, playerId, { rng: () => 0, connectedIds }).ok,
    canArbitrate: isArbiter && state.phase === 'arbitrate',
    canGuess: isGuesser && state.phase === 'guess',
  };
}
