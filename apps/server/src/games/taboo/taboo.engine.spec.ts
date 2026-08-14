/**
 * Tests du réducteur Taboo — la fiche 5.6 est la loi :
 * chaque cas limite de la fiche a son test ici.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../shared';
import type { PlayerId, TabooAction, TabooCard, TabooState } from '../../shared';
import type { EngineCtx, ReduceResult } from '../engine';
import {
  arbitersOf,
  buildTabooResult,
  composeTeams,
  currentCard,
  guardTaboo,
  initTaboo,
  reduceTaboo,
  resolveTabooParams,
  tabooTotals,
  validateTabooSetup,
} from './taboo.engine';

const IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];

function cards(n: number): TabooCard[] {
  return Array.from({ length: n }, (_, i) => ({
    word: `MOT${i + 1}`,
    forbidden: [`FA${i + 1}`, `FB${i + 1}`, `FC${i + 1}`],
  }));
}

function ctx(seed = 1): EngineCtx {
  return { rng: mulberry32(seed) };
}

/** Partie 4 joueurs à binômes FORCÉS : [p1,p2] et [p3,p4], 2 passages/équipe. */
function freshState(deckSize = 20, overrides: Partial<TabooState> = {}): TabooState {
  const params = resolveTabooParams({ teams: [['p1', 'p2'], ['p3', 'p4']] });
  const { state } = initTaboo(IDS, cards(deckSize), params, ctx());
  return { ...state, ...overrides };
}

function dispatch(state: TabooState, action: TabooAction, context: EngineCtx = ctx()): ReduceResult<TabooState> {
  const g = guardTaboo(state, action, context);
  expect(g.ok, `action ${action.type} devrait être légale : ${JSON.stringify(g)}`).toBe(true);
  return reduceTaboo(state, action, context);
}

function expectDenied(state: TabooState, action: TabooAction): void {
  expect(guardTaboo(state, action, ctx()).ok, `action ${action.type} aurait dû être refusée`).toBe(false);
}

function atLive(deckSize = 20): TabooState {
  return dispatch(freshState(deckSize), { type: 'GO', playerId: 'p1' }).state;
}

// ─── Binômes et planning ────────────────────────────────────────────────────

describe('binômes et planning', () => {
  it('valide l’effectif 4–10 ; binômes du host respectés s’ils sont valides', () => {
    expect(validateTabooSetup(3).ok).toBe(false);
    expect(validateTabooSetup(4).ok).toBe(true);
    const { teams, error } = composeTeams(IDS, [['p2', 'p4'], ['p1', 'p3']], mulberry32(1));
    expect(teams).toEqual([['p2', 'p4'], ['p1', 'p3']]);
    expect(error).toBeUndefined();
  });

  it('binômes invalides → composition aléatoire avec avertissement', () => {
    const { teams, error } = composeTeams(IDS, [['p1', 'p2', 'p3'], ['p4']], mulberry32(1));
    expect(error).toBeTruthy();
    expect(teams.flat().sort()).toEqual([...IDS].sort());
    expect(teams.every((t) => t.length === 2)).toBe(true);
  });

  it('cas fiche : effectif impair → un trio (tournant : orateur différent à chaque passage)', () => {
    const five = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const { teams } = composeTeams(five, undefined, mulberry32(3));
    const sizes = teams.map((t) => t.length).sort();
    expect(sizes).toEqual([2, 3]);

    const params = resolveTabooParams({ teams: [['p1', 'p2'], ['p3', 'p4', 'p5']], passesPerTeam: 3 });
    const { state } = initTaboo(five, cards(30), params, ctx());
    const trioPassages = [state.current!, ...state.schedule].filter((p) => p.teamIndex === 1);
    expect(trioPassages.map((p) => p.oratorId)).toEqual(['p3', 'p4', 'p5']); // rotation complète
    // dans le trio, les DEUX autres devinent
    expect(state.schedule.find((p) => p.teamIndex === 1 && p.oratorId === 'p4')).toBeTruthy();
  });

  it('dans un binôme, l’orateur du passage 1 devient devineur au passage 2', () => {
    const s = freshState();
    const specs = [s.current!, ...s.schedule];
    expect(specs.map((p) => `${p.teamIndex}:${p.oratorId}`)).toEqual(['0:p1', '1:p3', '0:p2', '1:p4']);
  });
});

// ─── Passage : Trouvé / Passer / Buzz ───────────────────────────────────────

describe('passage', () => {
  it('seul l’orateur lance le chrono ; la carte va à l’orateur et aux arbitres', () => {
    const s = freshState();
    expectDenied(s, { type: 'GO', playerId: 'p2' });
    const live = dispatch(s, { type: 'GO', playerId: 'p1' }).state;
    expect(live.phase).toBe('live');
    expect(currentCard(live)?.word).toBeTruthy();
    expect(arbitersOf(live)).toEqual(['p3', 'p4']); // le binôme actif n'arbitre pas
  });

  it('Trouvé +1, Passer 0 (−1 en mode dur), Buzz −1 ; la carte suivante s’affiche', () => {
    let s = atLive();
    const first = currentCard(s)!.word;
    s = dispatch(s, { type: 'FOUND', playerId: 'p1', cardSeq: s.cardSeq }).state;
    expect(s.current!.score).toBe(1);
    expect(currentCard(s)!.word).not.toBe(first);

    s = dispatch(s, { type: 'PASS_CARD', playerId: 'p1', cardSeq: s.cardSeq }).state;
    expect(s.current!.score).toBe(1);

    const { state: buzzed } = dispatch(s, { type: 'BUZZ', playerId: 'p3', cardSeq: s.cardSeq });
    expect(buzzed.current!.score).toBe(0);
    expect(buzzed.lastBuzz?.card.word).toBeTruthy();
    expect(buzzed.current!.played.map((p) => p.outcome)).toEqual(['found', 'passed', 'buzzed']);

    // mode dur : la passe coûte −1
    const hard = dispatch(
      { ...atLive(), params: resolveTabooParams({ hardPass: true, teams: [['p1', 'p2'], ['p3', 'p4']] }) },
      { type: 'PASS_CARD', playerId: 'p1', cardSeq: 1 },
    );
    expect(hard.state.current!.score).toBe(-1);
  });

  it('cas fiche : buzz ↔ trouvé quasi simultanés — le premier reçu fait foi, l’autre est refusé', () => {
    const s = atLive();
    const seq = s.cardSeq;
    const afterFound = dispatch(s, { type: 'FOUND', playerId: 'p1', cardSeq: seq }).state;
    // le buzz tardif cite l'ancienne carte → refusé (toast), pas de −1
    expectDenied(afterFound, { type: 'BUZZ', playerId: 'p3', cardSeq: seq });
    expect(afterFound.current!.score).toBe(1);

    // et dans l'autre sens : buzz d'abord, le Trouvé tardif est refusé
    const afterBuzz = dispatch(s, { type: 'BUZZ', playerId: 'p4', cardSeq: seq }).state;
    expectDenied(afterBuzz, { type: 'FOUND', playerId: 'p1', cardSeq: seq });
  });

  it('le devineur ne buzze pas, l’orateur non plus', () => {
    const s = atLive();
    expectDenied(s, { type: 'BUZZ', playerId: 'p2', cardSeq: s.cardSeq }); // devineur du binôme actif
    expectDenied(s, { type: 'BUZZ', playerId: 'p1', cardSeq: s.cardSeq }); // orateur
  });

  it('cas fiche : buzz contesté → annulation (−1 rendu) ou annulation + trouvé (+1 restitué)', () => {
    let s = atLive();
    s = dispatch(s, { type: 'BUZZ', playerId: 'p3', cardSeq: s.cardSeq }).state;
    expect(s.current!.score).toBe(-1);

    const cancelled = dispatch(s, { type: 'HOST_CANCEL_BUZZ', countAsFound: false }).state;
    expect(cancelled.current!.score).toBe(0);
    expect(cancelled.current!.played.at(-1)?.outcome).toBe('buzzCancelled');
    expect(cancelled.lastBuzz).toBeUndefined();
    expectDenied(cancelled, { type: 'HOST_CANCEL_BUZZ', countAsFound: false }); // plus rien à annuler

    const asFound = dispatch(s, { type: 'HOST_CANCEL_BUZZ', countAsFound: true }).state;
    expect(asFound.current!.score).toBe(1);
    expect(asFound.current!.played.at(-1)?.outcome).toBe('buzzFound');
  });

  it('timeout → récap du passage, les cartes jouées rejoignent la réserve de re-mélange', () => {
    let s = atLive();
    s = dispatch(s, { type: 'FOUND', playerId: 'p1', cardSeq: s.cardSeq }).state;
    s = dispatch(s, { type: 'PASS_CARD', playerId: 'p1', cardSeq: s.cardSeq }).state;
    const { state: recap } = dispatch(s, { type: 'TIMEOUT', timerId: 'passage' });
    expect(recap.phase).toBe('recap');
    expect(recap.discardPool).toHaveLength(2);
    expect(recap.current!.score).toBe(1);
  });

  it('cas fiche : deck épuisé → re-mélange des cartes des passages précédents (jamais celles en cours)', () => {
    // deck de 3 cartes : le passage 1 les consomme toutes → fin anticipée
    let s = atLive(3);
    s = dispatch(s, { type: 'FOUND', playerId: 'p1', cardSeq: s.cardSeq }).state;
    s = dispatch(s, { type: 'FOUND', playerId: 'p1', cardSeq: s.cardSeq }).state;
    const { state: exhausted } = dispatch(s, { type: 'FOUND', playerId: 'p1', cardSeq: s.cardSeq });
    expect(exhausted.phase).toBe('recap'); // plus aucune carte nulle part
    expect(exhausted.discardPool).toHaveLength(3);

    // passage suivant : le GO re-mélange les cartes du passage précédent
    const prep = dispatch(exhausted, { type: 'HOST_NEXT' }).state;
    const { state: live2, effects } = dispatch(prep, { type: 'GO', playerId: 'p3' });
    expect(live2.deck).toHaveLength(3);
    expect(effects).toContainEqual({ type: 'game:event', name: 'deckReshuffled' });
  });
});

// ─── Déconnexions (cas limites fiche) ───────────────────────────────────────

describe('déconnexions', () => {
  it('orateur/devineur déconnecté → chrono en pause, reprise à son retour', () => {
    const s = atLive();
    const { state: frozen, effects } = dispatch(s, { type: 'PLAYER_GONE' });
    expect(frozen.frozen).toBe(true);
    expect(effects).toContainEqual({ type: 'timer:pause', id: 'passage' });
    expect(effects).toContainEqual({ type: 'timer:start', id: 'playerGone', seconds: 30 });

    const { state: back, effects: backEffects } = dispatch(frozen, { type: 'PLAYER_BACK' });
    expect(back.frozen).toBe(false);
    expect(backEffects).toContainEqual({ type: 'timer:resume', id: 'passage' });
  });

  it('absent > 30 s → passage annulé (score ignoré) et REJOUÉ en fin de rotation, une seule fois', () => {
    let s = atLive();
    s = dispatch(s, { type: 'FOUND', playerId: 'p1', cardSeq: s.cardSeq }).state;
    s = dispatch(s, { type: 'PLAYER_GONE' }).state;
    const { state: aborted } = dispatch(s, { type: 'TIMEOUT', timerId: 'playerGone' });
    expect(aborted.phase).toBe('recap');
    expect(aborted.current!.aborted).toBe(true);
    // rejoué en fin de rotation (mêmes binôme et orateur)
    expect(aborted.schedule.at(-1)).toMatchObject({ teamIndex: 0, oratorId: 'p1' });

    // le score du passage annulé ne compte pas
    const advanced = dispatch(aborted, { type: 'HOST_NEXT' }).state;
    expect(tabooTotals(advanced).find((t) => t.teamIndex === 0)?.points).toBe(0);

    // un second abandon du même passage n'est plus rejoué
    let replay = advanced;
    while (replay.current && !(replay.current.teamIndex === 0 && replay.current.oratorId === 'p1')) {
      replay = dispatch(replay, { type: 'GO', playerId: replay.current.oratorId }).state;
      replay = dispatch(replay, { type: 'TIMEOUT', timerId: 'passage' }).state;
      replay = dispatch(replay, { type: 'HOST_NEXT' }).state;
    }
    replay = dispatch(replay, { type: 'GO', playerId: 'p1' }).state;
    replay = dispatch(replay, { type: 'PLAYER_GONE' }).state;
    const again = dispatch(replay, { type: 'TIMEOUT', timerId: 'playerGone' }).state;
    expect(again.schedule.some((p) => p.teamIndex === 0 && p.oratorId === 'p1')).toBe(false);
  });
});

// ─── Rotation, mort subite, fin ─────────────────────────────────────────────

describe('rotation et fin', () => {
  /** Joue un passage complet : l'orateur trouve `found` cartes puis timeout. */
  function playPassage(s: TabooState, found: number): TabooState {
    let cur = dispatch(s, { type: 'GO', playerId: s.current!.oratorId }).state;
    for (let i = 0; i < found; i++) {
      cur = dispatch(cur, { type: 'FOUND', playerId: cur.current!.oratorId, cardSeq: cur.cardSeq }).state;
    }
    cur = dispatch(cur, { type: 'TIMEOUT', timerId: 'passage' }).state;
    return dispatch(cur, { type: 'HOST_NEXT' }).state;
  }

  it('4 passages joués → classement, pas de mort subite sans égalité', () => {
    let s = freshState(40);
    s = playPassage(s, 3); // équipe 0 (p1)
    s = playPassage(s, 1); // équipe 1 (p3)
    s = playPassage(s, 2); // équipe 0 (p2)
    s = playPassage(s, 1); // équipe 1 (p4)
    expect(s.phase).toBe('end');
    expect(tabooTotals(s)).toEqual([
      { teamIndex: 0, points: 5 },
      { teamIndex: 1, points: 2 },
    ]);

    const players = IDS.map((id, i) => ({ id, name: `J${i + 1}`, avatar: '🦊', connected: true, joinedAt: i }));
    expect(buildTabooResult(s, players, 0).summary).toBe('J1 & J2 gagnent (5 pts)');
  });

  it('cas fiche : égalité en tête → mort subite 30 s (orateur = celui qui a le moins fait deviner)', () => {
    let s = freshState(60);
    s = playPassage(s, 2); // éq. 0, orateur p1 : 2 trouvés
    s = playPassage(s, 3); // éq. 1, orateur p3 : 3 trouvés
    s = playPassage(s, 3); // éq. 0, orateur p2 : 3 trouvés
    s = playPassage(s, 2); // éq. 1, orateur p4 : 2 trouvés → 5-5, égalité !
    expect(s.phase).toBe('prep');
    expect(s.current?.suddenDeath).toBe(true);
    expect(s.current?.durationSeconds).toBe(30);
    // équipe 0 : p1 (2) a moins fait deviner que p2 (3) → p1 orateur
    expect(s.current?.oratorId).toBe('p1');
    expect(s.schedule[0]).toMatchObject({ teamIndex: 1, oratorId: 'p4', suddenDeath: true });

    // la mort subite départage…
    s = playPassage(s, 1); // éq. 0 → 6
    s = playPassage(s, 0); // éq. 1 → 5
    expect(s.phase).toBe('end');
    expect(tabooTotals(s)[0]).toEqual({ teamIndex: 0, points: 6 });
  });

  it('cas fiche : nouvelle égalité après la mort subite → victoire partagée', () => {
    let s = freshState(60);
    s = playPassage(s, 2);
    s = playPassage(s, 2);
    s = playPassage(s, 2);
    s = playPassage(s, 2); // 4-4
    expect(s.current?.suddenDeath).toBe(true);
    s = playPassage(s, 1);
    s = playPassage(s, 1); // 5-5, encore égalité
    expect(s.phase).toBe('end'); // pas de 2e mort subite

    const players = IDS.map((id, i) => ({ id, name: `J${i + 1}`, avatar: '🦊', connected: true, joinedAt: i }));
    expect(buildTabooResult(s, players, 0).summary).toContain('Victoire partagée');
  });
});
