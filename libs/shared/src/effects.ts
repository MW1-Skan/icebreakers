/**
 * Effets émis par les réducteurs de jeu, exécutés par le serveur (PRD §6.2).
 * Les ids de timer sont propres à chaque jeu ; pause/reprise servent aux gels
 * de manche (ex. Just One : devineur déconnecté).
 */
export type GameEffect =
  | { type: 'timer:start'; id: string; seconds: number }
  | { type: 'timer:cancel'; id: string }
  | { type: 'timer:pause'; id: string }
  | { type: 'timer:resume'; id: string }
  | { type: 'game:event'; name: string; payload?: Record<string, unknown> }
  | { type: 'game:ended'; winner?: string };
