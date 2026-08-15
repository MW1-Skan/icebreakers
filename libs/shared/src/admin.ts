/** Contrat REST de la page /admin (PRD §4.3). */
import type { GameId, PackMode } from './types';

export interface AdminPackInfo {
  id: string;
  game: GameId;
  mode: PackMode;
  name: string;
  author?: string;
  entriesCount: number;
  /** builtin = committé dans le repo ; data = uploadé à chaud (data/packs/). */
  source: 'builtin' | 'data';
  enabled: boolean;
  file: string;
}

export type AdminUploadResult =
  | { ok: true; packId: string; entriesCount: number; replaced: boolean }
  | { ok: false; errors: string[] };

export interface AdminLoginResponse {
  token: string;
}
