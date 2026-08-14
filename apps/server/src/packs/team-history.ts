/**
 * Anti-répétition inter-rétros par nom d'équipe (PRD §3.5) — STUB pour l'étape 1.
 * L'interface est en place ; l'implémentation fichier (`data/history/<team>.json`,
 * TTL 90 jours) viendra plus tard. L'implémentation nulle ne filtre rien.
 */
import { Injectable } from '@nestjs/common';

export interface TeamHistoryStore {
  /** Retire de `elementIds` ceux déjà joués par cette équipe. */
  filterUnplayed(teamName: string, elementIds: string[]): string[];
  markPlayed(teamName: string, elementIds: string[]): void;
}

@Injectable()
export class NoopTeamHistoryStore implements TeamHistoryStore {
  filterUnplayed(_teamName: string, elementIds: string[]): string[] {
    return elementIds;
  }

  markPlayed(_teamName: string, _elementIds: string[]): void {
    // no-op — v1
  }
}
