/**
 * Projections Taboo par audience (fiche 5.6). La TV ne montre JAMAIS la carte
 * en cours (le devineur la regarde) ; l'orateur et les arbitres la voient ;
 * la carte buzzée (défaussée) et le récap de passage sont publics.
 */
import type { PlayerId, TabooMeView, TabooPublicView, TabooState } from '../../shared';
import { arbitersOf, currentCard, tabooTotals } from './taboo.engine';

export function projectTabooPublic(state: TabooState, connectedIds: PlayerId[]): TabooPublicView {
  const connected = new Set(connectedIds);
  const noArbiters =
    state.phase === 'live' && arbitersOf(state).every((id) => !connected.has(id)) && arbitersOf(state).length > 0;
  return {
    kind: 'taboo',
    phase: state.phase,
    teams: state.teams.map((t) => [...t]),
    current: state.current
      ? {
          teamIndex: state.current.teamIndex,
          oratorId: state.current.oratorId,
          guesserIds: [...state.current.guesserIds],
          durationSeconds: state.current.durationSeconds,
          suddenDeath: state.current.suddenDeath,
          score: state.current.score,
          playedCount: state.current.played.length,
          aborted: state.current.aborted,
        }
      : undefined,
    upcoming: state.schedule.map((s) => ({
      teamIndex: s.teamIndex,
      oratorId: s.oratorId,
      suddenDeath: s.suddenDeath,
    })),
    // La carte buzzée est hors jeu : publique (affichée 3 s, annulable).
    lastBuzz: state.lastBuzz ? { card: { ...state.lastBuzz.card }, cardSeq: state.lastBuzz.cardSeq } : undefined,
    // Récap du passage : le devineur découvre enfin les cartes.
    recap:
      state.phase === 'recap' && state.current
        ? {
            played: state.current.played.map((p) => ({ card: { ...p.card }, outcome: p.outcome })),
            score: state.current.score,
            aborted: state.current.aborted,
          }
        : undefined,
    totals: tabooTotals(state),
    passagesPlayed: state.passages.filter((p) => !p.aborted).length,
    passagesTotal:
      state.passages.length + state.schedule.length + (state.current && state.phase !== 'end' ? 1 : 0),
    frozen: state.frozen,
    noArbiters,
    history: state.phase === 'end' ? state.passages.map((p) => ({ ...p, played: p.played.map((c) => ({ ...c })) })) : undefined,
    params: {
      passageSeconds: state.params.passageSeconds,
      passesPerTeam: state.params.passesPerTeam,
      hardPass: state.params.hardPass,
    },
  };
}

export function projectTabooMe(state: TabooState, playerId: PlayerId): TabooMeView {
  const inGame = state.playerIds.includes(playerId);
  const teamIndex = state.teams.findIndex((t) => t.includes(playerId));
  const isOrator = inGame && state.current?.oratorId === playerId;
  const isGuesser = inGame && (state.current?.guesserIds.includes(playerId) ?? false);
  const isArbiter = inGame && !isOrator && !isGuesser && !!state.current;
  const card = currentCard(state);
  const showCard = state.phase === 'live' && (isOrator || isArbiter);
  return {
    inGame,
    teamIndex: teamIndex >= 0 ? teamIndex : undefined,
    isOrator,
    isGuesser,
    isArbiter,
    canGo: isOrator && state.phase === 'prep',
    // 🔒👥 La carte en cours : orateur + arbitres — JAMAIS le devineur.
    currentCard: showCard && card ? { word: card.word, forbidden: [...card.forbidden] } : undefined,
    cardSeq: showCard ? state.cardSeq : undefined,
    canBuzz: isArbiter && state.phase === 'live' && !state.frozen,
  };
}
