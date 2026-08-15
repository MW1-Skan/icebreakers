/**
 * Projections Codenames par audience. La TV et les devineurs ne voient la
 * couleur d'une carte QUE révélée ; la clé complète n'existe que dans la vue
 * des deux maîtres-espions (ils partagent la même clé, comme sur la table).
 * En phase de fin, la clé devient publique.
 */
import type { CodenamesMeView, CodenamesPublicView, CodenamesState, PlayerId } from '../../shared';
import { codenamesCumulative, codenamesRemaining, codenamesTeamOf } from './codenames.engine';

export function projectCodenamesPublic(state: CodenamesState): CodenamesPublicView {
  return {
    kind: 'codenames',
    phase: state.phase,
    teams: [
      [...state.teams[0]],
      [...state.teams[1]],
    ],
    spymasters: [...state.spymasters],
    activeTeam: state.activeTeam,
    startingTeam: state.startingTeam,
    mancheIndex: state.mancheIndex,
    manchesTotal: state.params.manchesCount,
    gridSize: state.params.gridSize,
    // 🔒 La couleur ne sort qu'une fois la carte révélée.
    cards: state.cards.map((c) => ({
      word: c.word,
      revealed: c.revealed,
      ...(c.revealed ? { kind: c.kind } : {}),
    })),
    remaining: codenamesRemaining(state),
    currentClue: state.currentClue ? { ...state.currentClue } : undefined,
    clues: state.clues.map((c) => ({ ...c, guesses: c.guesses.map((g) => ({ ...g })) })),
    seenKeyIds: [...state.seenKeyIds],
    winner: state.winner,
    endedByAssassin: state.endedByAssassin,
    assassinTeam: state.assassinTeam,
    // Fin de manche : la clé complète est enfin publique.
    keyReveal: state.phase === 'end' ? state.cards.map((c) => c.kind) : undefined,
    history: state.history.map((h) => ({ ...h, revealedWords: [...h.revealedWords] })),
    cumulative: state.phase === 'end' && state.params.manchesCount > 1 ? codenamesCumulative(state) : undefined,
    frozen: state.frozen,
    params: {
      gridSize: state.params.gridSize,
      manchesCount: state.params.manchesCount,
      clueSeconds: state.params.clueSeconds,
      guessSeconds: state.params.guessSeconds,
    },
  };
}

export function projectCodenamesMe(state: CodenamesState, playerId: PlayerId): CodenamesMeView {
  const team = codenamesTeamOf(state, playerId);
  const inGame = team !== undefined;
  const isSpymaster = inGame && state.spymasters.includes(playerId);
  const isActiveGuesser =
    inGame && team === state.activeTeam && !isSpymaster && state.teams[state.activeTeam].includes(playerId);
  const guessesMade = state.currentClue ? state.currentClue.count + 1 - state.currentClue.guessesLeft : 0;
  return {
    inGame,
    team,
    isSpymaster,
    hasSeenKey: state.seenKeyIds.includes(playerId),
    // 🔒👥 La clé (couleur de CHAQUE carte) — maîtres-espions uniquement.
    key: isSpymaster && state.phase !== 'end' ? state.cards.map((c) => c.kind) : undefined,
    canGiveClue:
      state.phase === 'clue' && !state.frozen && playerId === state.spymasters[state.activeTeam],
    canReveal: state.phase === 'guess' && !state.frozen && isActiveGuesser && !!state.currentClue,
    canStop:
      state.phase === 'guess' && !state.frozen && isActiveGuesser && !!state.currentClue && guessesMade >= 1,
  };
}
