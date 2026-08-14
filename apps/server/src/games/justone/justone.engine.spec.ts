/**
 * Tests du réducteur Just One — la fiche 5.3 est la loi :
 * chaque cas limite de la fiche a son test ici.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../shared';
import type { JustOneAction, JustOneParams, JustOneState, PlayerId } from '../../shared';
import type { EngineCtx, ReduceResult } from '../engine';
import {
  applyJustOneRedraw,
  buildJustOneResult,
  canRedrawWord,
  cluesLookAlike,
  effectiveArbiterId,
  guardJustOne,
  initJustOne,
  justOneScoreLabel,
  reduceJustOne,
  resolveJustOneParams,
  startNextJustOneManche,
  validateJustOneSetup,
} from './justone.engine';

const IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5'];

function params(overrides: Partial<JustOneParams> = {}): JustOneParams {
  return resolveJustOneParams(overrides);
}

function ctx(connectedIds?: PlayerId[]): EngineCtx {
  return { rng: mulberry32(1), connectedIds };
}

function freshState(overrides: Partial<JustOneState> = {}): JustOneState {
  const { state } = initJustOne(IDS, 'MOTMYSTERE', params());
  return { ...state, ...overrides };
}

function dispatch(
  state: JustOneState,
  action: JustOneAction,
  context: EngineCtx = ctx(),
): ReduceResult<JustOneState> {
  const g = guardJustOne(state, action, context);
  expect(g.ok, `action ${action.type} devrait être légale : ${JSON.stringify(g)}`).toBe(true);
  return reduceJustOne(state, action, context);
}

function expectDenied(state: JustOneState, action: JustOneAction, context: EngineCtx = ctx()): void {
  expect(guardJustOne(state, action, context).ok, `action ${action.type} aurait dû être refusée`).toBe(false);
}

/** Fait écrire tous les donneurs (p1 devineur en manche 1) → phase validate. */
function writeAll(
  state: JustOneState,
  clues: Record<PlayerId, string>,
): ReduceResult<JustOneState> {
  let cur = state;
  let last: ReduceResult<JustOneState> = { state: cur, effects: [] };
  for (const [playerId, text] of Object.entries(clues)) {
    last = dispatch(cur, { type: 'SUBMIT_CLUE', playerId, text });
    cur = last.state;
  }
  return last;
}

// ─── Setup, rotation ────────────────────────────────────────────────────────

describe('setup et rotation', () => {
  it('valide l’effectif 4–10', () => {
    expect(validateJustOneSetup(3).ok).toBe(false);
    expect(validateJustOneSetup(4).ok).toBe(true);
    expect(validateJustOneSetup(10).ok).toBe(true);
    expect(validateJustOneSetup(11).ok).toBe(false);
  });

  it('le devineur tourne dans l’ordre d’arrivée, l’arbitre est le prochain devineur', () => {
    const s1 = freshState();
    expect(s1.guesserId).toBe('p1');
    expect(s1.arbiterId).toBe('p2');
    expect(s1.phase).toBe('write');

    // rotation avec wrap-around : manche 5 → devineur p5, arbitre p1
    let s = s1;
    for (let manche = 2; manche <= 5; manche++) {
      s = startNextJustOneManche({ ...s, phase: 'resolve' }, `MOT${manche}`).state;
    }
    expect(s.mancheIndex).toBe(5);
    expect(s.guesserId).toBe('p5');
    expect(s.arbiterId).toBe('p1');
  });

  it('la manche suivante repart propre (indices, prêt, verdict remis à zéro)', () => {
    const { state } = writeAll(freshState(), { p2: 'soleil', p3: 'plage', p4: 'été', p5: 'sable' });
    const next = startNextJustOneManche({ ...state, phase: 'resolve', guess: 'x', outcome: 'wrong' }, 'NOUVEAU').state;
    expect(next.phase).toBe('write');
    expect(next.word).toBe('NOUVEAU');
    expect(next.clues).toEqual({});
    expect(next.validatedClues).toBeUndefined();
    expect(next.guess).toBeUndefined();
    expect(next.outcome).toBeUndefined();
    expect(next.unplayableUsed).toBe(false);
  });
});

// ─── Mot injouable (arbitre, 1×, avant le premier indice) ───────────────────

describe('mot injouable', () => {
  it('réservé à l’arbitre, une fois, uniquement avant le premier indice', () => {
    const s = freshState();
    expect(canRedrawWord(s, 'p2', ctx()).ok).toBe(true); // arbitre
    expect(canRedrawWord(s, 'p3', ctx()).ok).toBe(false); // pas arbitre
    expect(canRedrawWord(s, 'p1', ctx()).ok).toBe(false); // devineur

    const afterClue = dispatch(s, { type: 'SUBMIT_CLUE', playerId: 'p3', text: 'lune' }).state;
    expect(canRedrawWord(afterClue, 'p2', ctx()).ok).toBe(false); // trop tard

    const redrawn = applyJustOneRedraw(s, 'AUTREMOT');
    expect(redrawn.state.word).toBe('AUTREMOT');
    expect(redrawn.state.unplayableUsed).toBe(true);
    expect(redrawn.effects).toContainEqual({ type: 'timer:start', id: 'write', seconds: 45 });
    expect(canRedrawWord(redrawn.state, 'p2', ctx()).ok).toBe(false); // déjà utilisé
  });
});

// ─── Écriture des indices ───────────────────────────────────────────────────

describe('écriture des indices', () => {
  it('cas limite fiche : indice multi-mots refusé (sauf trait d’union)', () => {
    const s = freshState();
    expectDenied(s, { type: 'SUBMIT_CLUE', playerId: 'p2', text: 'deux mots' });
    expect(guardJustOne(s, { type: 'SUBMIT_CLUE', playerId: 'p2', text: 'chauve-souris' }, ctx()).ok).toBe(true);
  });

  it('le devineur n’écrit pas ; un donneur peut corriger son indice avant la clôture', () => {
    const s = freshState();
    expectDenied(s, { type: 'SUBMIT_CLUE', playerId: 'p1', text: 'triche' });
    let cur = dispatch(s, { type: 'SUBMIT_CLUE', playerId: 'p2', text: 'brouillon' }).state;
    cur = dispatch(cur, { type: 'SUBMIT_CLUE', playerId: 'p2', text: 'final' }).state;
    expect(cur.clues.p2).toBe('final');
    expect(cur.phase).toBe('write');
  });

  it('clôture anticipée quand tous les donneurs connectés ont écrit', () => {
    const { state, effects } = writeAll(freshState(), { p2: 'soleil', p3: 'plage', p4: 'été', p5: 'sable' });
    expect(state.phase).toBe('validate');
    expect(effects).toContainEqual({ type: 'timer:cancel', id: 'write' });
    expect(effects).toContainEqual({ type: 'timer:start', id: 'validate', seconds: 30 });
  });

  it('cas limite fiche : donneur déconnecté → simplement pas d’indice de sa part', () => {
    // p5 est déconnecté : la clôture anticipée n'attend que p2, p3, p4.
    const context = ctx(['p1', 'p2', 'p3', 'p4']);
    let s = freshState();
    s = reduceJustOne(s, { type: 'SUBMIT_CLUE', playerId: 'p2', text: 'un' }, context).state;
    s = reduceJustOne(s, { type: 'SUBMIT_CLUE', playerId: 'p3', text: 'deux' }, context).state;
    const { state: closed } = reduceJustOne(s, { type: 'SUBMIT_CLUE', playerId: 'p4', text: 'trois' }, context);
    expect(closed.phase).toBe('validate');
    expect(closed.validatedClues?.map((c) => c.giverId)).toEqual(['p2', 'p3', 'p4']);
  });

  it('timeout → les retardataires ne fournissent pas d’indice (pas de pénalité)', () => {
    let s = freshState();
    s = dispatch(s, { type: 'SUBMIT_CLUE', playerId: 'p2', text: 'seul' }).state;
    const { state: closed } = dispatch(s, { type: 'TIMEOUT', timerId: 'write' });
    expect(closed.phase).toBe('validate');
    expect(closed.validatedClues).toHaveLength(1);
    expect(closed.score).toBe(0);
  });

  it('aucun indice au timeout → devinette directe, à l’aveugle', () => {
    const { state, effects } = dispatch(freshState(), { type: 'TIMEOUT', timerId: 'write' });
    expect(state.phase).toBe('guess');
    expect(effects).toContainEqual({ type: 'timer:start', id: 'guess', seconds: 60 });
    // le devineur peut quand même tenter ou passer (règle officielle)
    expect(guardJustOne(state, { type: 'PASS', playerId: 'p1' }, ctx()).ok).toBe(true);
  });
});

// ─── Filtrage automatique par ressemblance ──────────────────────────────────

describe('annulation automatique des indices ressemblants', () => {
  it('cluesLookAlike : identiques normalisés, fautes de frappe, flexions', () => {
    expect(cluesLookAlike('Soleil', 'soleil')).toBe(true);
    expect(cluesLookAlike('soleil', 'soleils')).toBe(true);
    expect(cluesLookAlike('soleil', 'solail')).toBe(true);
    expect(cluesLookAlike('été', 'ete')).toBe(true);
    expect(cluesLookAlike('plage', 'soleil')).toBe(false);
    expect(cluesLookAlike('chat', 'chien')).toBe(false);
  });

  it('cas fiche : « soleil » / « soleils » / « solail » tombent d’un bloc', () => {
    const { state } = writeAll(freshState(), {
      p2: 'soleil',
      p3: 'soleils',
      p4: 'solail',
      p5: 'plage',
    });
    const byGiver = Object.fromEntries(state.validatedClues!.map((c) => [c.giverId, c]));
    expect(byGiver.p2.cancelledAuto).toBe(true);
    expect(byGiver.p3.cancelledAuto).toBe(true);
    expect(byGiver.p4.cancelledAuto).toBe(true);
    expect(byGiver.p5.cancelledAuto).toBe(false);
  });

  it('le regroupement est transitif (chaîne de ressemblances)', () => {
    // mer↔mers (1), mers↔merse (1) : les trois tombent ensemble via la chaîne
    const { state } = writeAll(freshState(), { p2: 'mer', p3: 'mers', p4: 'merse', p5: 'plage' });
    const byGiver = Object.fromEntries(state.validatedClues!.map((c) => [c.giverId, c]));
    expect(byGiver.p2.cancelledAuto).toBe(true);
    expect(byGiver.p3.cancelledAuto).toBe(true);
    expect(byGiver.p4.cancelledAuto).toBe(true);
    expect(byGiver.p5.cancelledAuto).toBe(false);
  });

  it('un indice qui ressemble au mot mystère est annulé d’office', () => {
    const s = freshState({ word: 'Fusée' });
    const { state } = writeAll(s, { p2: 'fusee', p3: 'espace', p4: 'décollage', p5: 'astronaute' });
    const byGiver = Object.fromEntries(state.validatedClues!.map((c) => [c.giverId, c]));
    expect(byGiver.p2.cancelledAuto).toBe(true);
    expect(byGiver.p3.cancelledAuto).toBe(false);
  });
});

// ─── Validation collective ──────────────────────────────────────────────────

describe('validation collective', () => {
  function atValidate(): JustOneState {
    return writeAll(freshState(), { p2: 'soleil', p3: 'plage', p4: 'été', p5: 'sable' }).state;
  }

  it('un donneur bascule « annuler » ; dernier toggle gagne (litige) ; le devineur ne peut rien', () => {
    let s = atValidate();
    s = dispatch(s, { type: 'FLAG_CLUE', playerId: 'p3', giverId: 'p2', cancelled: true }).state;
    expect(s.validatedClues!.find((c) => c.giverId === 'p2')!.cancelledManual).toBe(true);
    // litige : p4 ré-autorise — l'état affiché = dernier toggle
    s = dispatch(s, { type: 'FLAG_CLUE', playerId: 'p4', giverId: 'p2', cancelled: false }).state;
    expect(s.validatedClues!.find((c) => c.giverId === 'p2')!.cancelledManual).toBe(false);

    expectDenied(s, { type: 'FLAG_CLUE', playerId: 'p1', giverId: 'p2', cancelled: true });
    expectDenied(s, { type: 'READY', playerId: 'p1' });
  });

  it('un indice auto-annulé est verrouillé (pas de ré-autorisation manuelle)', () => {
    const { state } = writeAll(freshState(), { p2: 'soleil', p3: 'soleils', p4: 'été', p5: 'sable' });
    expectDenied(state, { type: 'FLAG_CLUE', playerId: 'p4', giverId: 'p2', cancelled: false });
  });

  it('la phase se clôt quand tous les donneurs connectés sont prêts', () => {
    let s = atValidate();
    s = dispatch(s, { type: 'READY', playerId: 'p2' }).state;
    s = dispatch(s, { type: 'READY', playerId: 'p3' }).state;
    s = dispatch(s, { type: 'READY', playerId: 'p4' }).state;
    expect(s.phase).toBe('validate');
    const { state: closed, effects } = dispatch(s, { type: 'READY', playerId: 'p5' });
    expect(closed.phase).toBe('guess');
    expect(effects).toContainEqual({ type: 'timer:cancel', id: 'validate' });
    expect(effects).toContainEqual({ type: 'timer:start', id: 'guess', seconds: 60 });
  });

  it('l’arbitre de manche peut forcer la clôture ; timeout idem', () => {
    const forced = dispatch(atValidate(), { type: 'FORCE_CLOSE', playerId: 'p2' });
    expect(forced.state.phase).toBe('guess');
    expectDenied(atValidate(), { type: 'FORCE_CLOSE', playerId: 'p3' });

    const timedOut = dispatch(atValidate(), { type: 'TIMEOUT', timerId: 'validate' });
    expect(timedOut.state.phase).toBe('guess');
  });
});

// ─── Devinette et résolution ────────────────────────────────────────────────

describe('devinette et résolution', () => {
  function atGuess(word = 'MOTMYSTERE'): JustOneState {
    const base = freshState({ word });
    const { state } = writeAll(base, { p2: 'soleil', p3: 'plage', p4: 'été', p5: 'sable' });
    return dispatch(state, { type: 'FORCE_CLOSE', playerId: 'p2' }).state;
  }

  it('seul le devineur répond ; réponse exacte (normalisée) → +1', () => {
    const s = atGuess('Café');
    expectDenied(s, { type: 'SUBMIT_GUESS', playerId: 'p2', guess: 'cafe' });
    const { state: resolved, effects } = dispatch(s, { type: 'SUBMIT_GUESS', playerId: 'p1', guess: '  CAFE ' });
    expect(resolved.phase).toBe('resolve');
    expect(resolved.outcome).toBe('correct');
    expect(resolved.score).toBe(1);
    expect(effects).toContainEqual({ type: 'timer:cancel', id: 'guess' });
  });

  it('cas fiche : réponse proche (faute de frappe, flexion) → l’arbitre tranche', () => {
    const s = atGuess('Croissant');
    const { state: pending, effects } = dispatch(s, { type: 'SUBMIT_GUESS', playerId: 'p1', guess: 'croisant' });
    expect(pending.phase).toBe('arbitrate');
    expect(pending.guess).toBe('croisant');
    expect(effects).toContainEqual({ type: 'timer:start', id: 'arbitrate', seconds: 30 });

    expectDenied(pending, { type: 'ARBITRATE', playerId: 'p3', decision: 'accept' });
    const accepted = dispatch(pending, { type: 'ARBITRATE', playerId: 'p2', decision: 'accept' });
    expect(accepted.state.outcome).toBe('correct');
    expect(accepted.state.score).toBe(1);

    const rejected = dispatch(pending, { type: 'ARBITRATE', playerId: 'p2', decision: 'reject' });
    expect(rejected.state.outcome).toBe('wrong');
    expect(rejected.state.score).toBe(-1);
  });

  it('l’arbitre ne tranche pas dans les temps → on pardonne (accepté)', () => {
    const s = atGuess('Croissant');
    const pending = dispatch(s, { type: 'SUBMIT_GUESS', playerId: 'p1', guess: 'croisant' }).state;
    const { state: resolved } = dispatch(pending, { type: 'TIMEOUT', timerId: 'arbitrate' });
    expect(resolved.outcome).toBe('correct');
    expect(resolved.score).toBe(1);
  });

  it('réponse fausse → −1 ; en mode doux → 0 ; passer/timeout → 0', () => {
    const wrong = dispatch(atGuess(), { type: 'SUBMIT_GUESS', playerId: 'p1', guess: 'ananas' });
    expect(wrong.state.outcome).toBe('wrong');
    expect(wrong.state.score).toBe(-1);

    const soft = freshState({ params: params({ softPenalty: true }) });
    const softGuess = dispatch(
      dispatch(writeAll(soft, { p2: 'a1', p3: 'b2', p4: 'c3', p5: 'd4' }).state, {
        type: 'FORCE_CLOSE',
        playerId: 'p2',
      }).state,
      { type: 'SUBMIT_GUESS', playerId: 'p1', guess: 'ananas' },
    );
    expect(softGuess.state.score).toBe(0);

    const passed = dispatch(atGuess(), { type: 'PASS', playerId: 'p1' });
    expect(passed.state.outcome).toBe('pass');
    expect(passed.state.score).toBe(0);

    const timedOut = dispatch(atGuess(), { type: 'TIMEOUT', timerId: 'guess' });
    expect(timedOut.state.outcome).toBe('timeout');
    expect(timedOut.state.score).toBe(0);
  });

  it('l’historique enregistre mot, indices (avec annulations), proposition et verdict', () => {
    const s = atGuess('Café');
    const { state: resolved } = dispatch(s, { type: 'SUBMIT_GUESS', playerId: 'p1', guess: 'café' });
    expect(resolved.history).toHaveLength(1);
    expect(resolved.history[0]).toMatchObject({
      word: 'Café',
      guesserId: 'p1',
      guess: 'café',
      outcome: 'correct',
      delta: 1,
    });
    expect(resolved.history[0].clues).toHaveLength(4);
  });
});

// ─── Arbitre glissant et gel du devineur (déconnexions) ─────────────────────

describe('déconnexions', () => {
  it('cas fiche : arbitre déconnecté → le rôle glisse au donneur suivant dans la rotation', () => {
    const s = freshState(); // arbitre nominal p2
    expect(effectiveArbiterId(s, ['p1', 'p3', 'p4', 'p5'])).toBe('p3');
    // p2 ET p3 déconnectés → p4
    expect(effectiveArbiterId(s, ['p1', 'p4', 'p5'])).toBe('p4');
    // le devineur n'est jamais arbitre : manche 5 (devineur p5, arbitre p1), p1 déco → p2
    let s5 = s;
    for (let m = 2; m <= 5; m++) s5 = startNextJustOneManche({ ...s5, phase: 'resolve' }, `M${m}`).state;
    expect(effectiveArbiterId(s5, ['p2', 'p3', 'p4', 'p5'])).toBe('p2');

    // le glissement s'applique aux gardes : FORCE_CLOSE par l'arbitre effectif
    const atValidate = writeAll(s, { p2: 'a1', p3: 'b2', p4: 'c3', p5: 'd4' }).state;
    const context = ctx(['p1', 'p3', 'p4', 'p5']);
    expect(guardJustOne(atValidate, { type: 'FORCE_CLOSE', playerId: 'p3' }, context).ok).toBe(true);
    expect(guardJustOne(atValidate, { type: 'FORCE_CLOSE', playerId: 'p4' }, context).ok).toBe(false);
  });

  it('cas fiche : devineur déconnecté → gel (timers en pause), retour → reprise', () => {
    const s = writeAll(freshState(), { p2: 'a1', p3: 'b2', p4: 'c3', p5: 'd4' }).state;
    const { state: frozen, effects } = dispatch(s, { type: 'GUESSER_DISCONNECTED' });
    expect(frozen.guesserFrozen).toBe(true);
    expect(effects).toContainEqual({ type: 'timer:pause', id: 'validate' });
    expect(effects).toContainEqual({ type: 'timer:start', id: 'guesserGone', seconds: 60 });

    const { state: back, effects: backEffects } = dispatch(frozen, { type: 'GUESSER_RECONNECTED' });
    expect(back.guesserFrozen).toBe(false);
    expect(backEffects).toContainEqual({ type: 'timer:resume', id: 'validate' });
    expect(backEffects).toContainEqual({ type: 'timer:cancel', id: 'guesserGone' });
  });

  it('cas fiche : devineur absent > 60 s → manche annulée, ni point ni malus', () => {
    const s = writeAll(freshState(), { p2: 'a1', p3: 'b2', p4: 'c3', p5: 'd4' }).state;
    const frozen = dispatch(s, { type: 'GUESSER_DISCONNECTED' }).state;
    const { state: aborted, effects } = dispatch(frozen, { type: 'TIMEOUT', timerId: 'guesserGone' });
    expect(aborted.phase).toBe('resolve');
    expect(aborted.outcome).toBe('aborted');
    expect(aborted.score).toBe(0);
    expect(aborted.history[0].outcome).toBe('aborted');
    expect(effects).toContainEqual({ type: 'timer:cancel', id: 'validate' });
    // on passe au devineur suivant à la manche d'après
    const next = startNextJustOneManche(aborted, 'SUIVANT').state;
    expect(next.guesserId).toBe('p2');
  });
});

// ─── Fin de partie et barème ────────────────────────────────────────────────

describe('fin de partie', () => {
  it('après la dernière manche, HOST_NEXT termine la partie', () => {
    const s = freshState({
      params: params({ manchesCount: 5 }),
      mancheIndex: 5,
      phase: 'resolve',
      outcome: 'correct',
      score: 4,
    });
    const { state: end, effects } = dispatch(s, { type: 'HOST_NEXT' });
    expect(end.phase).toBe('end');
    expect(effects).toContainEqual({ type: 'game:ended' });
  });

  it('barème de la fiche, proportionnel au nombre de manches', () => {
    expect(justOneScoreLabel(8, 8)).toBe('Score parfait !');
    expect(justOneScoreLabel(7, 8)).toBe('Incroyable !');
    expect(justOneScoreLabel(5, 8)).toBe('Waouh !');
    expect(justOneScoreLabel(6, 8)).toBe('Waouh !');
    expect(justOneScoreLabel(3, 8)).toBe('Pas mal');
    expect(justOneScoreLabel(4, 8)).toBe('Pas mal');
    expect(justOneScoreLabel(2, 8)).toBe('On réessaie ?');
    expect(justOneScoreLabel(-1, 8)).toBe('On réessaie ?');
    expect(justOneScoreLabel(13, 13)).toBe('Score parfait !');
  });

  it('buildJustOneResult : score collectif au récap, pas de points individuels', () => {
    const s = freshState({ phase: 'end', score: 6 });
    const result = buildJustOneResult(s, [], 42);
    expect(result.game).toBe('justone');
    expect(result.summary).toContain('6/8');
    expect(result.summary).toContain('Waouh');
    expect(result.points).toEqual([]);
  });
});
