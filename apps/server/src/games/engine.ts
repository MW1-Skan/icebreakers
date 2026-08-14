/**
 * Interface commune des moteurs de jeu (PRD §6.2) : réducteurs purs
 * `(state, action, ctx) → newState + effects`, sans I/O. Le serveur exécute
 * les effets (timers, événements) et rediffuse les projections.
 */
import type { ErrorCode, GameEffect, GameId, PlayerId, Rng } from '../shared';

export interface EngineCtx {
  rng: Rng;
  /** Joueurs actuellement connectés (clôtures anticipées, rôles glissants). */
  connectedIds?: PlayerId[];
}

export interface ReduceResult<S> {
  state: S;
  effects: GameEffect[];
}

export type GuardResult = { ok: true } | { ok: false; code: ErrorCode; message: string };

export interface GameEngine<S, A> {
  readonly id: GameId;
  /** Légalité de l'action dans cette phase (l'identité de l'acteur est garantie par le gateway). */
  guard(state: S, action: A, ctx: EngineCtx): GuardResult;
  reduce(state: S, action: A, ctx: EngineCtx): ReduceResult<S>;
}
